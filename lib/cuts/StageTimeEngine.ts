import type { Play, StageDirection } from "@/types/play";
import type { Cut, ProjectSettings } from "@/types/project";

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

  // Effective scene order (custom or TEI default)
  const defaultSceneOrder = play.acts.flatMap((act) => act.scenes.map((s) => s.id));
  const effectiveSceneOrder = cut.sceneOrder ?? defaultSceneOrder;

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

    const units = scene.units;

    // ── On-stage sets — populated ONLY by entrance/exit SDs, no fallback ────
    // onStageOrig: driven by original SD characters (sd.characters), unaffected by edits
    // onStage:     driven by effective characters (edits override sd.characters for cut version)
    const onStage = new Set<string>();
    const onStageOrig = new Set<string>();

    // ── Walk units in document order ─────────────────────────────────────────
    for (const unit of units) {
      if (unit.type === "stage") {
        if (unit.stageType === "entrance") {
          // Original: always use the raw SD characters
          for (const charId of unit.characters) {
            onStageOrig.add(charId);
          }
          // Cut: use effective characters (may have additions/removals via stageDirectionEdits)
          for (const charId of getEffectiveCharacters(unit, edits)) {
            onStage.add(charId);
          }
        } else if (unit.stageType === "exit") {
          // Original: always use the raw SD characters
          for (const charId of unit.characters) {
            onStageOrig.delete(charId);
          }
          // Cut: use effective characters
          for (const charId of getEffectiveCharacters(unit, edits)) {
            onStage.delete(charId);
          }
        }
      } else if (unit.type === "speech") {
        // ── Original: accumulate for ALL speeches ──────────────────────────
        const origMinutes = (unit.lineCount * AVG_WORDS_PER_LINE) / wpm;
        originalTotalMinutes += origMinutes;
        if (!sceneOrigMinByChar[sceneId]) sceneOrigMinByChar[sceneId] = {};
        for (const charId of onStageOrig) {
          const entry = ensureChar(byCharacter, charId);
          entry.originalMinutes += origMinutes;
          sceneOrigMinByChar[sceneId][charId] = (sceneOrigMinByChar[sceneId][charId] ?? 0) + origMinutes;
        }

        // ── Cut: only for kept speeches ────────────────────────────────────
        const isKept = (cut.cutMap[unit.id] ?? "kept") === "kept";
        if (!isKept) continue;

        let keptLines = unit.lineCount;
        if (cut.lineCutMap) {
          const cutCount = unit.lines.filter((l) => cut.lineCutMap![l.id] === "cut").length;
          keptLines = Math.max(0, unit.lineCount - cutCount);
        }

        const cutMinutes = (keptLines * AVG_WORDS_PER_LINE) / wpm;
        totalMinutes += cutMinutes;

        if (!sceneMinByChar[sceneId]) sceneMinByChar[sceneId] = {};
        // Accumulate for ALL characters currently on stage (cut version)
        for (const charId of onStage) {
          const entry = ensureChar(byCharacter, charId);
          entry.minutes += cutMinutes;
          sceneMinByChar[sceneId][charId] = (sceneMinByChar[sceneId][charId] ?? 0) + cutMinutes;
        }
      }
    }
    // Characters remaining in onStage at scene end are assumed to exit at scene end
  }

  // Build per-scene SceneStageTime[] for each character
  const allCharIds = new Set([
    ...Object.keys(sceneMinByChar).flatMap((sid) => Object.keys(sceneMinByChar[sid])),
    ...Object.keys(sceneOrigMinByChar).flatMap((sid) => Object.keys(sceneOrigMinByChar[sid])),
  ]);
  for (const charId of allCharIds) {
    const entry = ensureChar(byCharacter, charId);
    entry.scenes = effectiveSceneOrder
      .filter((sid) => (sceneMinByChar[sid]?.[charId] ?? 0) > 0 || (sceneOrigMinByChar[sid]?.[charId] ?? 0) > 0)
      .map((sid) => ({
        sceneId: sid,
        minutes: sceneMinByChar[sid]?.[charId] ?? 0,
        originalMinutes: sceneOrigMinByChar[sid]?.[charId] ?? 0,
      }));
  }

  // Add pause minutes to cut running time only (original is unaffected)
  let pauseMinutes = 0;
  if (cut.pauses) {
    for (const [key, pause] of Object.entries(cut.pauses)) {
      const sceneId = key.replace(/^after:/, "");
      if (effectiveSceneOrder.includes(sceneId)) {
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
          if (unit.stageType === "exit") {
            for (const charId of getEffectiveCharacters(unit, edits)) {
              exitedAnywhereChars.add(charId);
            }
          } else if (unit.stageType === "entrance") {
            for (const charId of getEffectiveCharacters(unit, edits)) {
              enteredAnywhereChars.add(charId);
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
