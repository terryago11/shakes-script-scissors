import type { Play } from "@/types/play";
import type { Cut, ActorAssignment, ProjectSettings } from "@/types/project";
import { getEffectiveCharacters } from "./StageTimeEngine";
import { getEffectiveSceneOrder } from "@/lib/project/projectUtils";

const AVG_WORDS_PER_LINE = 8;
const DEFAULT_WPM = 135;
const DEFAULT_THRESHOLD_MINUTES = 2.0;

export interface QuickChangeWarning {
  actorId: string;
  exitCharacterId: string;
  enterCharacterId: string;
  /** Scene where the exit happened */
  exitSceneId: string;
  /** Act number (1-based) of the exit scene */
  exitActNum: number;
  /** Scene number (1-based, within its act) of the exit scene */
  exitSceneNum: number;
  /** Approximate scene-relative line number (original/uncut) of the exit */
  exitApproxLine: number;
  /** Scene where the entrance happens */
  enterSceneId: string;
  /** Act number (1-based) of the entrance scene */
  enterActNum: number;
  /** Scene number (1-based, within its act) of the entrance scene */
  enterSceneNum: number;
  /** Approximate scene-relative line number (original/uncut) of the entrance */
  enterApproxLine: number;
  /** Gap in minutes between the exit and the entrance */
  gapMinutes: number;
}

export interface QuickChangeResult {
  warnings: QuickChangeWarning[];
}

interface ExitRecord {
  sceneId: string;
  /** Cumulative minutes at the point of exit */
  atCumulativeMinutes: number;
  charId: string;
  /** Act number (1-based) */
  actNum: number;
  /** Scene number within act (1-based) */
  sceneNum: number;
  /** Scene-relative line count (original/uncut) at point of exit */
  approxLine: number;
}

export function computeQuickChanges(
  play: Play,
  cut: Cut,
  assignments: ActorAssignment[],
  settings?: ProjectSettings,
): QuickChangeResult {
  const threshold = settings?.quickChangeThresholdMinutes ?? DEFAULT_THRESHOLD_MINUTES;
  const wpm = settings?.wordsPerMinute ?? DEFAULT_WPM;

  // Build character → actor lookup
  const charToActor = new Map<string, string>();
  for (const a of assignments) {
    charToActor.set(a.characterId, a.actorId);
  }

  // Effective scene order: custom order with any missing scenes appended
  const effectiveSceneOrder = getEffectiveSceneOrder(play, cut);

  // Build scene lookup
  const sceneById = new Map<string, (typeof play.acts)[0]["scenes"][0]>();
  // Build scene → act/scene-number lookup (1-based, always from original TEI order)
  const sceneLocation = new Map<string, { actNum: number; sceneNum: number }>();
  for (let ai = 0; ai < play.acts.length; ai++) {
    for (let si = 0; si < play.acts[ai].scenes.length; si++) {
      const scene = play.acts[ai].scenes[si];
      sceneById.set(scene.id, scene);
      sceneLocation.set(scene.id, { actNum: ai + 1, sceneNum: si + 1 });
    }
  }

  const warnings: QuickChangeWarning[] = [];
  // Key: `${actorId}:${charId}` → last exit record
  const lastExitByActorChar = new Map<string, ExitRecord>();

  let cumulativeMinutes = 0;

  for (const sceneId of effectiveSceneOrder) {
    const scene = sceneById.get(sceneId);
    if (!scene) continue;

    const { actNum, sceneNum } = sceneLocation.get(sceneId) ?? { actNum: 0, sceneNum: 0 };

    // Track on-stage set within scene to compute virtual exit at scene end
    const onStage = new Set<string>();
    // Track scene duration as we walk speeches
    let sceneMinutes = 0;
    // Track original (uncut) scene-relative line count for location display
    let sceneLineCount = 0;

    for (const unit of scene.units) {
      if (unit.type === "stage") {
        if (unit.stageType === "entrance") {
          const effectiveChars = getEffectiveCharacters(unit, cut.stageDirectionEdits);
          for (const charId of effectiveChars) {
            const actorId = charToActor.get(charId);
            if (!actorId) { onStage.add(charId); continue; }

            // Check all previous exits for this actor
            for (const [key, record] of lastExitByActorChar) {
              const colonIdx = key.indexOf(":");
              const recActorId = key.slice(0, colonIdx);
              if (recActorId !== actorId) continue;
              if (record.charId === charId) continue; // same character re-entering

              const gap = cumulativeMinutes + sceneMinutes - record.atCumulativeMinutes;
              if (gap < threshold) {
                warnings.push({
                  actorId,
                  exitCharacterId: record.charId,
                  enterCharacterId: charId,
                  exitSceneId: record.sceneId,
                  exitActNum: record.actNum,
                  exitSceneNum: record.sceneNum,
                  exitApproxLine: record.approxLine,
                  enterSceneId: sceneId,
                  enterActNum: actNum,
                  enterSceneNum: sceneNum,
                  enterApproxLine: sceneLineCount,
                  gapMinutes: gap,
                });
              }
            }
            onStage.add(charId);
          }
        } else if (unit.stageType === "exit") {
          const effectiveChars = getEffectiveCharacters(unit, cut.stageDirectionEdits);
          for (const charId of effectiveChars) {
            const actorId = charToActor.get(charId);
            if (actorId) {
              lastExitByActorChar.set(`${actorId}:${charId}`, {
                sceneId,
                atCumulativeMinutes: cumulativeMinutes + sceneMinutes,
                charId,
                actNum,
                sceneNum,
                approxLine: sceneLineCount,
              });
            }
            onStage.delete(charId);
          }
        }
      } else if (unit.type === "speech") {
        // Always count original lines for location tracking (regardless of cut status)
        sceneLineCount += unit.lineCount;

        const isKept = (cut.cutMap[unit.id] ?? "kept") === "kept";
        if (isKept) {
          let keptLines = unit.lineCount;
          if (cut.lineCutMap) {
            const cutCount = unit.lines.filter((l) => cut.lineCutMap![l.id] === "cut").length;
            keptLines = Math.max(0, unit.lineCount - cutCount);
          }
          sceneMinutes += (keptLines * AVG_WORDS_PER_LINE) / wpm;
        }
      }
    }

    // Characters still on stage at scene end — record virtual exit at scene end
    for (const charId of onStage) {
      const actorId = charToActor.get(charId);
      if (actorId) {
        lastExitByActorChar.set(`${actorId}:${charId}`, {
          sceneId,
          atCumulativeMinutes: cumulativeMinutes + sceneMinutes,
          charId,
          actNum,
          sceneNum,
          approxLine: sceneLineCount,
        });
      }
    }

    cumulativeMinutes += sceneMinutes;

    // Add pause duration after this scene (if any)
    const pauseKey = `after:${sceneId}`;
    if (cut.pauses?.[pauseKey]) {
      cumulativeMinutes += cut.pauses[pauseKey].minutes;
    }
  }

  return { warnings };
}
