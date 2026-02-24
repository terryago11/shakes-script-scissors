import type { Play, StageDirection } from "@/types/play";
import type { Cut, ProjectSettings } from "@/types/project";

const AVG_WORDS_PER_LINE = 8;
const DEFAULT_WPM = 135;

export interface CharacterStageTime {
  characterId: string;
  minutes: number;
  /** Scene IDs in which this character was on stage */
  scenes: string[];
}

export interface StageTimeResult {
  byCharacter: Record<string, CharacterStageTime>;
  totalMinutes: number;
}

/** Returns the effective character list for an SD, applying any overrides from the cut. */
function getEffectiveCharacters(sd: StageDirection, edits?: Record<string, string[]>): string[] {
  return edits?.[sd.id] ?? sd.characters;
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

    // ── Step 1: Pre-scan for explicitly entered characters ──────────────────
    const explicitlyEntered = new Set<string>();
    for (const unit of units) {
      if (unit.type === "stage" && unit.stageType === "entrance") {
        for (const charId of getEffectiveCharacters(unit, edits)) {
          explicitlyEntered.add(charId);
        }
      }
    }

    // ── Step 2: Initialize onStage ──────────────────────────────────────────
    // Characters with kept speeches who were never explicitly entered → assumed on from start (fallback)
    const onStage = new Set<string>();
    for (const unit of units) {
      if (
        unit.type === "speech" &&
        (cut.cutMap[unit.id] ?? "kept") === "kept" &&
        !explicitlyEntered.has(unit.characterId)
      ) {
        onStage.add(unit.characterId);
      }
    }

    // ── Step 3: Walk units in document order ────────────────────────────────
    for (const unit of units) {
      if (unit.type === "stage") {
        if (unit.stageType === "entrance") {
          for (const charId of getEffectiveCharacters(unit, edits)) {
            onStage.add(charId);
          }
        } else if (unit.stageType === "exit") {
          for (const charId of getEffectiveCharacters(unit, edits)) {
            onStage.delete(charId);
          }
        }
      } else if (unit.type === "speech") {
        const isKept = (cut.cutMap[unit.id] ?? "kept") === "kept";
        if (!isKept) continue;

        // Kept lines count (account for lineCutMap)
        let keptLines = unit.lineCount;
        if (cut.lineCutMap) {
          const cutLines = unit.lines.filter(
            (l) => cut.lineCutMap![l.id] === "cut"
          ).length;
          keptLines = Math.max(0, unit.lineCount - cutLines);
        }

        const speechMinutes = (keptLines * AVG_WORDS_PER_LINE) / wpm;
        totalMinutes += speechMinutes;

        const charId = unit.characterId;
        if (onStage.has(charId)) {
          if (!byCharacter[charId]) {
            byCharacter[charId] = { characterId: charId, minutes: 0, scenes: [] };
          }
          byCharacter[charId].minutes += speechMinutes;
          if (!byCharacter[charId].scenes.includes(sceneId)) {
            byCharacter[charId].scenes.push(sceneId);
          }
        }
      }
    }
    // Step 4: Characters remaining in onStage at scene end are fine — no explicit exit needed (fallback)
  }

  return { byCharacter, totalMinutes };
}
