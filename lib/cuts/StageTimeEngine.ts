import type { Play, StageDirection, ScriptUnit } from "@/types/play";
import type { Cut, ProjectSettings } from "@/types/project";
import { expandSplits, expandInsertions } from "./expandUtils";
import { getSubSceneId } from "./SceneSubdivisionUtils";
import { getEffectiveSceneOrder } from "@/lib/project/projectUtils";

const AVG_WORDS_PER_LINE = 8;
const DEFAULT_WPM = 135;

export interface SceneStageTime {
  sceneId: string;
  /** On-stage minutes in the cut script for this scene */
  minutes: number;
  /** On-stage minutes in the uncut script for this scene */
  originalMinutes: number;
}

export interface CharacterStageTime {
  characterId: string;
  /** On-stage minutes in the cut script */
  minutes: number;
  /** On-stage minutes in the uncut script */
  originalMinutes: number;
  /** Per-scene breakdown */
  scenes: SceneStageTime[];
}

export interface StageTimeResult {
  byCharacter: Record<string, CharacterStageTime>;
  totalMinutes: number;
  originalTotalMinutes: number;
  /** Total minutes added by pauses (already included in totalMinutes) */
  pauseMinutes: number;
  /** Characters with kept speeches but no matching entrance or exit SD */
  warnings: Array<{ characterId: string; type: "no-exit" | "no-entrance" }>;
}

/** Returns the effective character list for an SD, applying any overrides from the cut. */
export function getEffectiveCharacters(sd: StageDirection, edits?: Record<string, string[]>): string[] {
  return edits?.[sd.id] ?? sd.characters;
}

/**
 * Compute the set of characters on stage immediately before `sceneUnits[targetIndex]`.
 * Walks raw TEI units (cut-independent) so entrances/exits are tracked regardless of cut status.
 * Used by StageDirectionBlock to pre-fill the SD character chip editor for exit SDs.
 */
export function getOnStageAtUnit(
  sceneUnits: ScriptUnit[],
  targetIndex: number,
  edits?: Record<string, string[]>
): Set<string> {
  const onStage = new Set<string>();
  for (let i = 0; i < targetIndex; i++) {
    const unit = sceneUnits[i];
    if (unit.type !== "stage") continue;
    if (unit.stageType === "entrance") {
      for (const charId of getEffectiveCharacters(unit, edits)) {
        onStage.add(charId);
      }
    } else if (unit.stageType === "exit") {
      for (const charId of getEffectiveCharacters(unit, edits)) {
        onStage.delete(charId);
      }
    }
  }
  return onStage;
}

/**
 * Returns characters expected to enter at sceneUnits[targetIndex] (an entrance SD):
 * chars who appear in exit SDs later in the scene but have no prior entrance SD before targetIndex.
 * Purely entrance/exit SD tracking — does not look at speakers.
 */
export function getExpectedEntrantsAtUnit(
  sceneUnits: ScriptUnit[],
  targetIndex: number,
  edits?: Record<string, string[]>
): Set<string> {
  // Collect chars who entered before targetIndex
  const alreadyEntered = new Set<string>();
  for (let i = 0; i < targetIndex; i++) {
    const unit = sceneUnits[i];
    if (unit.type === "stage" && unit.stageType === "entrance") {
      for (const charId of getEffectiveCharacters(unit, edits)) {
        alreadyEntered.add(charId);
      }
    }
  }
  // Collect chars who exit after targetIndex
  const exitLater = new Set<string>();
  for (let i = targetIndex + 1; i < sceneUnits.length; i++) {
    const unit = sceneUnits[i];
    if (unit.type === "stage" && unit.stageType === "exit") {
      for (const charId of getEffectiveCharacters(unit, edits)) {
        exitLater.add(charId);
      }
    }
  }
  // Suggest chars who exit later but haven't entered yet
  const suggestions = new Set<string>();
  for (const charId of exitLater) {
    if (!alreadyEntered.has(charId)) suggestions.add(charId);
  }
  return suggestions;
}

function ensureChar(byChar: Record<string, CharacterStageTime>, charId: string): CharacterStageTime {
  if (!byChar[charId]) {
    byChar[charId] = { characterId: charId, minutes: 0, originalMinutes: 0, scenes: [] };
  }
  return byChar[charId];
}

export function computeStageTime(
  play: Play,
  cut: Cut,
  settings?: ProjectSettings
): StageTimeResult {
  const wpm = settings?.wordsPerMinute ?? DEFAULT_WPM;
  const edits = cut.stageDirectionEdits;

  const byCharacter: Record<string, CharacterStageTime> = {};
  let totalMinutes = 0;
  let originalTotalMinutes = 0;

  // Per-scene minute accumulators: sceneId → charId → minutes
  const sceneMinByChar: Record<string, Record<string, number>> = {};
  const sceneOrigMinByChar: Record<string, Record<string, number>> = {};

  // Effective scene order: custom order with any missing scenes appended
  const effectiveSceneOrder = getEffectiveSceneOrder(play, cut);

  // Build scene lookup
  const sceneById = new Map<string, (typeof play.acts)[0]["scenes"][0]>();
  for (const act of play.acts) {
    for (const scene of act.scenes) {
      sceneById.set(scene.id, scene);
    }
  }

  for (const sceneId of effectiveSceneOrder) {
    const scene = sceneById.get(sceneId);
    if (!scene) continue;

    // Expand splits and insertions so each part is attributed independently
    const expandedUnits = expandInsertions(
      expandSplits(scene.units, cut.speechSplits),
      cut.insertions,
      play.castList
    );

    // Build sub-scene tracking if this scene has subdivisions.
    // On-stage state CARRIES ACROSS sub-scene boundaries (sub-scenes are within the same TEI scene).
    const splits = cut.sceneSubdivisions?.[sceneId] ?? [];
    const splitUnitIds = new Set(splits.map((s) => s.afterUnitId));
    let currentPartIndex = 0;
    // currentSceneKey = virtual sub-scene ID or real scene ID (when not subdivided)
    let currentSceneKey = splits.length > 0 ? getSubSceneId(sceneId, 0) : sceneId;

    // ── On-stage sets — populated ONLY by entrance/exit SDs, reset each scene ─
    // onStageOrig: driven by original SD characters (sd.characters), unaffected by edits
    // onStage:     driven by effective characters (edits override sd.characters for cut version)
    const onStage = new Set<string>();
    const onStageOrig = new Set<string>();

    // ── Walk units in document order ─────────────────────────────────────────
    for (const unit of expandedUnits) {
      if (unit.type === "stage") {
        if (unit.stageType === "entrance") {
          // Original: always use the raw SD characters
          for (const charId of unit.characters) {
            onStageOrig.add(charId);
          }
          // Cut: skip if SD is cut (character never enters in cut version)
          if ((cut.cutMap[unit.id] ?? "kept") !== "cut") {
            for (const charId of getEffectiveCharacters(unit, edits)) {
              onStage.add(charId);
            }
          }
        } else if (unit.stageType === "exit") {
          // Original: always use the raw SD characters
          for (const charId of unit.characters) {
            onStageOrig.delete(charId);
          }
          // Cut: skip if SD is cut (character stays on-stage in cut version)
          if ((cut.cutMap[unit.id] ?? "kept") !== "cut") {
            for (const charId of getEffectiveCharacters(unit, edits)) {
              onStage.delete(charId);
            }
          }
        }

        // ── Song/dance duration — extra minutes added by the director ─────────
        const sdDuration = cut.stageDurations?.[unit.id];
        if (sdDuration && sdDuration > 0) {
          // Add to cut running time + all on-stage characters (cut version)
          const sdIsKept = (cut.cutMap[unit.id] ?? "kept") === "kept";
          if (sdIsKept) {
            totalMinutes += sdDuration;
            if (!sceneMinByChar[currentSceneKey]) sceneMinByChar[currentSceneKey] = {};
            for (const charId of onStage) {
              const entry = ensureChar(byCharacter, charId);
              entry.minutes += sdDuration;
              sceneMinByChar[currentSceneKey][charId] = (sceneMinByChar[currentSceneKey][charId] ?? 0) + sdDuration;
            }
          }
          // Always add to original running time (SD exists in the original play)
          originalTotalMinutes += sdDuration;
          if (!sceneOrigMinByChar[currentSceneKey]) sceneOrigMinByChar[currentSceneKey] = {};
          for (const charId of onStageOrig) {
            const entry = ensureChar(byCharacter, charId);
            entry.originalMinutes += sdDuration;
            sceneOrigMinByChar[currentSceneKey][charId] = (sceneOrigMinByChar[currentSceneKey][charId] ?? 0) + sdDuration;
          }
        }
      } else if (unit.type === "speech") {
        // ── Original: accumulate for all non-insertion speeches ────────────
        // Insertions have no "original" — they're new text that didn't exist in the uncut play.
        const isInsertion = !!(cut.insertions?.[unit.id]);
        if (!isInsertion) {
          const origMinutes = (unit.lineCount * AVG_WORDS_PER_LINE) / wpm;
          originalTotalMinutes += origMinutes;
          if (!sceneOrigMinByChar[currentSceneKey]) sceneOrigMinByChar[currentSceneKey] = {};
          for (const charId of onStageOrig) {
            const entry = ensureChar(byCharacter, charId);
            entry.originalMinutes += origMinutes;
            sceneOrigMinByChar[currentSceneKey][charId] = (sceneOrigMinByChar[currentSceneKey][charId] ?? 0) + origMinutes;
          }
        }

        // ── Cut: only for kept speeches ────────────────────────────────────
        const isKept = (cut.cutMap[unit.id] ?? "kept") === "kept";
        if (!isKept) {
          // Advance sub-scene key even for cut units (boundary tracking must stay in sync)
          if (splitUnitIds.has(unit.id)) {
            currentPartIndex++;
            currentSceneKey = splits.length > 0 ? getSubSceneId(sceneId, currentPartIndex) : sceneId;
          }
          continue;
        }

        let keptLines = unit.lineCount;
        if (cut.lineCutMap) {
          const cutCount = unit.lines.filter((l) => cut.lineCutMap![l.id] === "cut").length;
          keptLines = Math.max(0, unit.lineCount - cutCount);
        }

        const cutMinutes = (keptLines * AVG_WORDS_PER_LINE) / wpm;
        totalMinutes += cutMinutes;

        if (!sceneMinByChar[currentSceneKey]) sceneMinByChar[currentSceneKey] = {};
        // Accumulate for ALL characters currently on stage (cut version)
        for (const charId of onStage) {
          const entry = ensureChar(byCharacter, charId);
          entry.minutes += cutMinutes;
          sceneMinByChar[currentSceneKey][charId] = (sceneMinByChar[currentSceneKey][charId] ?? 0) + cutMinutes;
        }

        // Extra duration for song/dance speeches (set from the Scenes & Pauses dashboard).
        // Adds to total show/scene running time only — per-character attribution is not
        // attempted since many Shakespeare scenes lack explicit entrance SDs.
        const speechDuration = cut.stageDurations?.[unit.id];
        if (speechDuration && speechDuration > 0) {
          totalMinutes += speechDuration;
          originalTotalMinutes += speechDuration;
        }

        // Per-line song durations (set via lineSongOverrides + stageDurations in dashboard).
        // Adds to total/scene running time only (same policy as speech-level song durations).
        if (cut.lineSongOverrides || cut.stageDurations) {
          for (const line of unit.lines) {
            const effectiveIsSong = cut.lineSongOverrides?.[line.id] ?? line.isSong ?? false;
            if (!effectiveIsSong) continue;
            const lineDuration = cut.stageDurations?.[line.id];
            if (lineDuration && lineDuration > 0) {
              totalMinutes += lineDuration;
              originalTotalMinutes += lineDuration;
            }
          }
        }
      }

      // Advance to the next sub-scene part after processing a boundary unit
      // (on-stage state is NOT reset — sub-scenes are within the same TEI scene)
      if (splitUnitIds.has(unit.id)) {
        currentPartIndex++;
        currentSceneKey = splits.length > 0 ? getSubSceneId(sceneId, currentPartIndex) : sceneId;
      }
    }
    // Characters remaining in onStage at scene end are assumed to exit at scene end
  }

  // Build the full ordered list of scene keys (real IDs or virtual sub-scene IDs)
  // This expands any subdivided scenes into their virtual sub-scene keys.
  const allSceneKeys = effectiveSceneOrder.flatMap((realId) => {
    const subdivSplits = cut.sceneSubdivisions?.[realId];
    if (!subdivSplits?.length) return [realId];
    return Array.from({ length: subdivSplits.length + 1 }, (_, i) => getSubSceneId(realId, i));
  });

  // Build per-scene SceneStageTime[] for each character
  const allCharIds = new Set([
    ...Object.keys(sceneMinByChar).flatMap((sid) => Object.keys(sceneMinByChar[sid])),
    ...Object.keys(sceneOrigMinByChar).flatMap((sid) => Object.keys(sceneOrigMinByChar[sid])),
  ]);
  for (const charId of allCharIds) {
    const entry = ensureChar(byCharacter, charId);
    entry.scenes = allSceneKeys
      .filter((sid) => (sceneMinByChar[sid]?.[charId] ?? 0) > 0 || (sceneOrigMinByChar[sid]?.[charId] ?? 0) > 0)
      .map((sid) => ({
        sceneId: sid,
        minutes: sceneMinByChar[sid]?.[charId] ?? 0,
        originalMinutes: sceneOrigMinByChar[sid]?.[charId] ?? 0,
      }));
  }

  // Add pause minutes to cut running time only (original is unaffected).
  // Pauses may be keyed after real scene IDs OR virtual sub-scene IDs.
  let pauseMinutes = 0;
  if (cut.pauses) {
    const allSceneKeysSet = new Set(allSceneKeys);
    for (const [key, pause] of Object.entries(cut.pauses)) {
      const afterId = key.replace(/^after:/, "");
      if (allSceneKeysSet.has(afterId)) {
        pauseMinutes += pause.minutes;
      }
    }
  }
  totalMinutes += pauseMinutes;

  // ── No-exit / no-entrance warning detection ──────────────────────────────
  // Walk ALL scenes in the play (not just effectiveSceneOrder) so we catch every SD.
  // A warning fires if a character has at least one kept speech but no matching entrance/exit SD.
  const exitedAnywhereChars = new Set<string>();
  const enteredAnywhereChars = new Set<string>();
  const speakingKeptChars = new Set<string>();
  for (const act of play.acts) {
    for (const scene of act.scenes) {
      for (const unit of scene.units) {
        if (unit.type === "stage") {
          // Only count SDs that are kept in the cut version
          if ((cut.cutMap[unit.id] ?? "kept") !== "cut") {
            if (unit.stageType === "exit") {
              for (const charId of getEffectiveCharacters(unit, edits)) {
                exitedAnywhereChars.add(charId);
              }
            } else if (unit.stageType === "entrance") {
              for (const charId of getEffectiveCharacters(unit, edits)) {
                enteredAnywhereChars.add(charId);
              }
            }
          }
        } else if (unit.type === "speech") {
          // Skip speeches with empty/invalid characterId (data quality gaps in TEI)
          if ((cut.cutMap[unit.id] ?? "kept") === "kept" && unit.characterId) {
            speakingKeptChars.add(unit.characterId);
          }
        }
      }
    }
  }
  const warnings: StageTimeResult["warnings"] = [];
  for (const charId of speakingKeptChars) {
    if (!exitedAnywhereChars.has(charId)) {
      warnings.push({ characterId: charId, type: "no-exit" });
    }
    if (!enteredAnywhereChars.has(charId)) {
      warnings.push({ characterId: charId, type: "no-entrance" });
    }
  }

  return { byCharacter, totalMinutes, originalTotalMinutes, pauseMinutes, warnings };
}

/**
 * Returns a symmetric map of pairwise shared on-stage minutes:
 * for each pair of characters (a, b) that are ever simultaneously on stage
 * during a kept speech, accumulates the duration of that speech.
 * Keys are stored with min(a,b) as outer key for consistency.
 * Use getSharedMinutes(map, a, b) for direction-independent lookup.
 */
export function computePairwiseSharedMinutes(
  play: Play,
  cut: Cut,
  settings?: ProjectSettings,
): Map<string, Map<string, number>> {
  const wpm = settings?.wordsPerMinute ?? DEFAULT_WPM;
  const edits = cut.stageDirectionEdits;
  const shared = new Map<string, Map<string, number>>();

  function addShared(a: string, b: string, minutes: number) {
    const [lo, hi] = a < b ? [a, b] : [b, a];
    if (!shared.has(lo)) shared.set(lo, new Map());
    const inner = shared.get(lo)!;
    inner.set(hi, (inner.get(hi) ?? 0) + minutes);
  }

  const sceneById = new Map<string, (typeof play.acts)[0]["scenes"][0]>();
  for (const act of play.acts) {
    for (const scene of act.scenes) sceneById.set(scene.id, scene);
  }

  for (const sceneId of getEffectiveSceneOrder(play, cut)) {
    const scene = sceneById.get(sceneId);
    if (!scene) continue;
    const onStage = new Set<string>();

    for (const unit of scene.units) {
      if (unit.type === "stage") {
        if (unit.stageType === "entrance") {
          for (const c of getEffectiveCharacters(unit, edits)) onStage.add(c);
        } else if (unit.stageType === "exit") {
          for (const c of getEffectiveCharacters(unit, edits)) onStage.delete(c);
        }
      } else if (unit.type === "speech") {
        const isKept = (cut.cutMap[unit.id] ?? "kept") === "kept";
        if (!isKept) continue;
        let keptLines = unit.lineCount;
        if (cut.lineCutMap) {
          const cut_ = unit.lines.filter((l) => cut.lineCutMap![l.id] === "cut").length;
          keptLines = Math.max(0, unit.lineCount - cut_);
        }
        const minutes = (keptLines * AVG_WORDS_PER_LINE) / wpm;
        if (minutes <= 0) continue;
        const list = Array.from(onStage);
        for (let i = 0; i < list.length; i++) {
          for (let j = i + 1; j < list.length; j++) {
            addShared(list[i], list[j], minutes);
          }
        }
      }
    }
  }

  return shared;
}

export function getSharedMinutes(
  map: Map<string, Map<string, number>>,
  a: string,
  b: string,
): number {
  const [lo, hi] = a < b ? [a, b] : [b, a];
  return map.get(lo)?.get(hi) ?? 0;
}
