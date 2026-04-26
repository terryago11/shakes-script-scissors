import type { Play, Scene, ScriptUnit } from "@/types/play";
import { expandSplits, expandInsertions, expandStageNotes } from "./expandUtils";
import type { Actor, ActorAssignment, Cut } from "@/types/project";
import { buildSceneEntries } from "./SceneSubdivisionUtils";
import type { LineCounts, LineWithStatus, ScriptUnitWithStatus, CountPair, SceneCounts, UnitCounts } from "@/types/cut";
import { applyEditsToLine, segmentsToText } from "./applyEdits";

/** Count words in a string */
function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Pure function: given a play, a cut, casting assignments, and actors,
 * compute the effective filtered units and line counts.
 */
export function computeCuts(
  play: Play,
  cut: Cut,
  assignments: ActorAssignment[],
  actors: Actor[]
): { unitsByScene: Map<string, ScriptUnitWithStatus[]>; lineCounts: LineCounts } {
  const unitsByScene = new Map<string, ScriptUnitWithStatus[]>();
  const lineCutMap = cut.lineCutMap ?? {};

  // Build character → actor lookup
  const charToActor: Record<string, string> = {};
  for (const a of assignments) {
    charToActor[a.characterId] = a.actorId;
  }

  // Build actor → characters lookup for line count aggregation
  const actorToChars: Record<string, string[]> = {};
  for (const a of assignments) {
    if (!actorToChars[a.actorId]) actorToChars[a.actorId] = [];
    actorToChars[a.actorId].push(a.characterId);
  }

  // Initialize line counts
  const byCharacter: LineCounts["byCharacter"] = {};
  for (const char of play.castList) {
    byCharacter[char.id] = { original: 0, afterCut: 0 };
  }

  // Initialize word counts (parallel structure)
  const wordsByCharacter: Record<string, CountPair> = {};
  for (const char of play.castList) {
    wordsByCharacter[char.id] = { original: 0, afterCut: 0 };
  }

  let totalOriginal = 0;
  let totalAfterCut = 0;
  let totalWordsOriginal = 0;
  let totalWordsAfterCut = 0;

  const speechEdits = cut.speechEdits ?? {};
  const speechReassignments = cut.speechReassignments ?? {};

  /**
   * Returns the effective set of speaker IDs for a speech:
   *   1. Speaker override from speechReassignments (string[])
   *   2. Original multi-speaker list from speech.characterIds
   *   3. Single original speaker fallback
   */
  function effectiveSpeakers(unit: { id: string; characterId: string; characterIds?: string[] }): string[] {
    const override = speechReassignments[unit.id];
    // "__ALL__" is a display-only sentinel — attribution still uses original speakers
    if (!override || override[0] === "__ALL__") return unit.characterIds ?? [unit.characterId];
    return override;
  }

  // Per-scene and per-act aggregates
  const byScene: Record<string, SceneCounts> = {};
  const byAct: Record<string, SceneCounts> = {};

  // Per-character-per-scene (real scene id) and per-unit breakdowns.
  // byUnit is the load-bearing source of truth for any consumer that needs cell-level data.
  const byCharacterByScene: Record<string, Record<string, SceneCounts>> = {};
  const byUnit: Record<string, UnitCounts> = {};

  function ensureCharScene(charId: string, sceneId: string): SceneCounts {
    if (!byCharacterByScene[charId]) byCharacterByScene[charId] = {};
    let entry = byCharacterByScene[charId][sceneId];
    if (!entry) {
      entry = { lines: { original: 0, afterCut: 0 }, words: { original: 0, afterCut: 0 } };
      byCharacterByScene[charId][sceneId] = entry;
    }
    return entry;
  }

  // Walk all scenes and units
  for (const act of play.acts) {
    byAct[act.id] = { lines: { original: 0, afterCut: 0 }, words: { original: 0, afterCut: 0 } };
    for (const scene of act.scenes) {
      byScene[scene.id] = { lines: { original: 0, afterCut: 0 }, words: { original: 0, afterCut: 0 } };
      const unitsWithStatus: ScriptUnitWithStatus[] = [];

      // Expand splits, insertions, and inline stageNotes before iterating so each part is processed independently
      const expandedUnits = expandStageNotes(expandInsertions(
        expandSplits(scene.units, cut.speechSplits),
        cut.insertions,
        play.castList
      ));

      for (const unit of expandedUnits) {
        // For stageNote continuation parts ("<id>:sn<n>"), inherit cut status from the base speech.
        const snBaseMatch = unit.id.match(/^(.+):sn\d+$/);
        const snBaseId = snBaseMatch ? snBaseMatch[1] : null;
        const status: "kept" | "cut" =
          cut.cutMap[unit.id] === "cut" ? "cut"
          : (snBaseId && cut.cutMap[snBaseId] === "cut") ? "cut"
          : "kept";

        if (unit.type === "speech") {
          // afterCut lines/words go to ALL effective speakers (multi-speaker supported).
          // Original counts always stay with the primary (first) character.
          const speakers = effectiveSpeakers(unit);
          // Insertions (synthetic speeches from cut.insertions) have no original line count
          const isInsertion = !!(cut.insertions?.[unit.id]);

          // Original speakers: all TEI-listed characters (not just primary)
          const originalSpeakers = unit.characterIds ?? [unit.characterId];
          // Ensure all original + effective speakers are initialised
          for (const spkId of [...new Set([...originalSpeakers, ...speakers])]) {
            if (!byCharacter[spkId]) byCharacter[spkId] = { original: 0, afterCut: 0 };
            if (!wordsByCharacter[spkId]) wordsByCharacter[spkId] = { original: 0, afterCut: 0 };
          }

          // Build per-line statuses (only if this speech is kept)
          let lineStatuses: LineWithStatus[] | undefined;
          let effectiveStatus = status;
          let keptLineCount = unit.lineCount;

          // Compute original word count for this speech
          const speechOriginalWords = unit.lines.reduce(
            (sum, l) => sum + countWords(l.text),
            0
          );

          if (status === "kept" && unit.lines.length > 0) {
            // Check if any lines have been individually cut
            const hasLineCuts = unit.lines.some((l) => lineCutMap[l.id] === "cut");
            if (hasLineCuts) {
              lineStatuses = unit.lines.map((l) => ({
                lineId: l.id,
                status: lineCutMap[l.id] === "cut" ? "cut" : "kept",
              }));
              keptLineCount = lineStatuses.filter((ls) => ls.status === "kept").length;
              // If every line is individually cut, treat the whole speech as cut
              if (keptLineCount === 0) effectiveStatus = "cut";
            }
          }

          if (!isInsertion) {
            // Original counts go to ALL TEI-listed speakers (each co-speaker owns the original lines)
            for (const spkId of originalSpeakers) {
              byCharacter[spkId].original += unit.lineCount;
              wordsByCharacter[spkId].original += speechOriginalWords;
              const cs = ensureCharScene(spkId, scene.id);
              cs.lines.original += unit.lineCount;
              cs.words.original += speechOriginalWords;
            }
            totalOriginal += unit.lineCount;
            totalWordsOriginal += speechOriginalWords;
            byScene[scene.id].lines.original += unit.lineCount;
            byAct[act.id].lines.original += unit.lineCount;
            byScene[scene.id].words.original += speechOriginalWords;
            byAct[act.id].words.original += speechOriginalWords;
          }

          let unitKeptLines = 0;
          let unitKeptWords = 0;

          if (effectiveStatus === "kept") {
            // Single pass: compute both word count and effective line count.
            // A line counts as "kept" only if it still has content after word-level ops.
            const edit = speechEdits[unit.id];
            const ops = edit?.ops ?? [];

            for (const line of unit.lines) {
              if (lineCutMap[line.id] === "cut") continue;
              if (ops.length > 0) {
                const segments = applyEditsToLine(line.id, line.text, ops);
                const keptText = segmentsToText(segments);
                unitKeptWords += countWords(keptText);
                if (keptText.trim().length > 0) unitKeptLines++;
              } else {
                unitKeptWords += countWords(line.text);
                unitKeptLines++;
              }
            }

            // afterCut attributed to ALL effective speakers (each actor learns every line)
            for (const spkId of speakers) {
              byCharacter[spkId].afterCut += unitKeptLines;
              wordsByCharacter[spkId].afterCut += unitKeptWords;
              const cs = ensureCharScene(spkId, scene.id);
              cs.lines.afterCut += unitKeptLines;
              cs.words.afterCut += unitKeptWords;
            }
            totalAfterCut += unitKeptLines;
            byScene[scene.id].lines.afterCut += unitKeptLines;
            byAct[act.id].lines.afterCut += unitKeptLines;
            totalWordsAfterCut += unitKeptWords;
            byScene[scene.id].words.afterCut += unitKeptWords;
            byAct[act.id].words.afterCut += unitKeptWords;
          }

          // byUnit captures every speech (insertions included) so consumers can re-bucket
          // by sub-scene / column / arbitrary grouping without re-interpreting cuts/edits.
          byUnit[unit.id] = {
            lines: {
              original: isInsertion ? 0 : unit.lineCount,
              afterCut: unitKeptLines,
            },
            words: {
              original: isInsertion ? 0 : speechOriginalWords,
              afterCut: unitKeptWords,
            },
            effectiveSpeakers: [...speakers],
            originalSpeakers: [...originalSpeakers],
          };

          unitsWithStatus.push({ unit, status: effectiveStatus, lineStatuses });
        } else {
          unitsWithStatus.push({ unit, status });
        }
      }

      unitsByScene.set(scene.id, unitsWithStatus);

      // If the scene has subdivisions, produce per-sub-scene byScene entries in addition
      // to the whole-scene aggregate already stored in byScene[scene.id].
      if (cut.sceneSubdivisions?.[scene.id]?.length) {
        const entries = buildSceneEntries(scene, cut, play);
        for (const entry of entries) {
          // Skip the trivial single-entry case (partCount===1 uses the real scene ID)
          if (entry.partCount === 1) continue;
          const subCounts = { lines: { original: 0, afterCut: 0 }, words: { original: 0, afterCut: 0 } };
          for (const unit of entry.units) {
            if (unit.type !== "speech") continue;
            const isInsertion = !!(cut.insertions?.[unit.id]);
            const speechOrigWords = unit.lines.reduce((s, l) => s + countWords(l.text), 0);

            const snBaseMatch = unit.id.match(/^(.+):sn\d+$/);
            const snBaseId = snBaseMatch ? snBaseMatch[1] : null;
            const unitStatus: "kept" | "cut" =
              cut.cutMap[unit.id] === "cut" ? "cut"
              : (snBaseId && cut.cutMap[snBaseId] === "cut") ? "cut"
              : "kept";

            if (!isInsertion) {
              subCounts.lines.original += unit.lineCount;
              subCounts.words.original += speechOrigWords;
            }

            if (unitStatus === "kept") {
              const edit = speechEdits[unit.id];
              const ops = edit?.ops ?? [];
              let keptWords = 0;
              let effectiveKeptLines = 0;
              for (const line of unit.lines) {
                if ((cut.lineCutMap ?? {})[line.id] === "cut") continue;
                if (ops.length > 0) {
                  const segments = applyEditsToLine(line.id, line.text, ops);
                  const keptText = segmentsToText(segments);
                  keptWords += countWords(keptText);
                  if (keptText.trim().length > 0) effectiveKeptLines++;
                } else {
                  keptWords += countWords(line.text);
                  effectiveKeptLines++;
                }
              }
              subCounts.lines.afterCut += effectiveKeptLines;
              subCounts.words.afterCut += keptWords;
            }
          }
          byScene[entry.id] = subCounts;
        }
      }
    }
  }

  // Aggregate by actor (lines)
  const byActor: LineCounts["byActor"] = {};
  for (const actor of actors) {
    const chars = actorToChars[actor.id] || [];
    let original = 0;
    let afterCut = 0;
    for (const charId of chars) {
      const c = byCharacter[charId];
      if (c) {
        original += c.original;
        afterCut += c.afterCut;
      }
    }
    byActor[actor.id] = { characters: chars, original, afterCut };
  }

  // Aggregate by actor (words)
  const wordsByActor: LineCounts["words"]["byActor"] = {};
  for (const actor of actors) {
    const chars = actorToChars[actor.id] || [];
    let original = 0;
    let afterCut = 0;
    for (const charId of chars) {
      const c = wordsByCharacter[charId];
      if (c) {
        original += c.original;
        afterCut += c.afterCut;
      }
    }
    wordsByActor[actor.id] = { characters: chars, original, afterCut };
  }

  return {
    unitsByScene,
    lineCounts: {
      total: { original: totalOriginal, afterCut: totalAfterCut },
      byCharacter,
      byActor,
      byScene,
      byAct,
      byCharacterByScene,
      byUnit,
      words: {
        total: { original: totalWordsOriginal, afterCut: totalWordsAfterCut },
        byCharacter: wordsByCharacter,
        byActor: wordsByActor,
      },
    },
  };
}

/** Get all units for a scene flat (without status), for a given cut */
export function getSceneUnits(scene: Scene, cutMap: Cut["cutMap"]): ScriptUnitWithStatus[] {
  return scene.units.map((unit) => ({
    unit,
    status: cutMap[unit.id] === "cut" ? "cut" : "kept",
  }));
}

/** Count lines in a cut for a specific character */
export function countCharacterLines(
  play: Play,
  cut: Cut,
  characterId: string
): { original: number; afterCut: number } {
  let original = 0;
  let afterCut = 0;
  const lineCutMap = cut.lineCutMap ?? {};
  for (const act of play.acts) {
    for (const scene of act.scenes) {
      for (const unit of scene.units) {
        if (unit.type === "speech" && unit.characterId === characterId) {
          original += unit.lineCount;
          if (cut.cutMap[unit.id] !== "cut") {
            const keptLines = unit.lines.filter((l) => lineCutMap[l.id] !== "cut").length;
            afterCut += keptLines;
          }
        }
      }
    }
  }
  return { original, afterCut };
}

/** Get all ScriptUnits in order across the entire play */
export function getAllUnitsInOrder(play: Play): ScriptUnit[] {
  const units: ScriptUnit[] = [];
  for (const act of play.acts) {
    for (const scene of act.scenes) {
      units.push(...scene.units);
    }
  }
  return units;
}

/**
 * Get all effective ScriptUnits in play order, with speech splits and insertions expanded.
 * Use this instead of getAllUnitsInOrder when you have a Cut (e.g. in CueScriptBuilder, HTML exporter).
 */
export function getEffectiveUnitsInOrder(play: Play, cut: Cut): ScriptUnit[] {
  const units: ScriptUnit[] = [];
  for (const act of play.acts) {
    for (const scene of act.scenes) {
      const expanded = expandStageNotes(expandInsertions(
        expandSplits(scene.units, cut.speechSplits),
        cut.insertions,
        play.castList
      ));
      units.push(...expanded);
    }
  }
  return units;
}
