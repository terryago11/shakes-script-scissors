import type { Play, StageDirection } from "@/types/play";
import type { Cut, ProjectSettings } from "@/types/project";

const AVG_WORDS_PER_LINE = 8;
const DEFAULT_WPM = 135;

export interface CharacterStageTime {
  characterId: string;
  /** On-stage minutes in the cut script */
  minutes: number;
  /** On-stage minutes in the uncut script */
  originalMinutes: number;
  /** Scene IDs in which this character was on stage */
  scenes: string[];
}

export interface StageTimeResult {
  byCharacter: Record<string, CharacterStageTime>;
  totalMinutes: number;
  originalTotalMinutes: number;
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

    // ── Pre-scan: collect explicitly entered characters ──────────────────────
    const explicitlyEntered = new Set<string>();
    for (const unit of units) {
      if (unit.type === "stage" && unit.stageType === "entrance") {
        for (const charId of getEffectiveCharacters(unit, edits)) {
          explicitlyEntered.add(charId);
        }
      }
    }

    // ── Initialize on-stage sets ─────────────────────────────────────────────
    // cut version: fallback chars have KEPT speeches + no entrance SD
    const onStage = new Set<string>();
    // original version: fallback chars have ANY speeches + no entrance SD
    const onStageOrig = new Set<string>();

    for (const unit of units) {
      if (unit.type === "speech" && !explicitlyEntered.has(unit.characterId)) {
        onStageOrig.add(unit.characterId);
        if ((cut.cutMap[unit.id] ?? "kept") === "kept") {
          onStage.add(unit.characterId);
        }
      }
    }

    // ── Walk units in document order ─────────────────────────────────────────
    for (const unit of units) {
      if (unit.type === "stage") {
        if (unit.stageType === "entrance") {
          for (const charId of getEffectiveCharacters(unit, edits)) {
            onStage.add(charId);
            onStageOrig.add(charId);
          }
        } else if (unit.stageType === "exit") {
          for (const charId of getEffectiveCharacters(unit, edits)) {
            onStage.delete(charId);
            onStageOrig.delete(charId);
          }
        }
      } else if (unit.type === "speech") {
        // ── Original: accumulate for ALL speeches ──────────────────────────
        const origMinutes = (unit.lineCount * AVG_WORDS_PER_LINE) / wpm;
        originalTotalMinutes += origMinutes;
        for (const charId of onStageOrig) {
          const entry = ensureChar(byCharacter, charId);
          entry.originalMinutes += origMinutes;
          if (!entry.scenes.includes(sceneId)) entry.scenes.push(sceneId);
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

        // Accumulate for ALL characters currently on stage (not just the speaker)
        for (const charId of onStage) {
          const entry = ensureChar(byCharacter, charId);
          entry.minutes += cutMinutes;
          if (!entry.scenes.includes(sceneId)) entry.scenes.push(sceneId);
        }
      }
    }
    // Characters remaining at scene end stay until end (fallback — no action needed)
  }

  return { byCharacter, totalMinutes, originalTotalMinutes };
}
