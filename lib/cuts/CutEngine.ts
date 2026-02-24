import type { Play, Scene, ScriptUnit } from "@/types/play";
import type { Actor, ActorAssignment, Cut } from "@/types/project";
import type { LineCounts, LineWithStatus, ScriptUnitWithStatus } from "@/types/cut";

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

  let totalOriginal = 0;
  let totalAfterCut = 0;

  // Walk all scenes and units
  for (const act of play.acts) {
    for (const scene of act.scenes) {
      const unitsWithStatus: ScriptUnitWithStatus[] = [];

      for (const unit of scene.units) {
        const status: "kept" | "cut" = cut.cutMap[unit.id] === "cut" ? "cut" : "kept";

        if (unit.type === "speech") {
          if (!byCharacter[unit.characterId]) {
            byCharacter[unit.characterId] = { original: 0, afterCut: 0 };
          }

          // Build per-line statuses (only if this speech is kept)
          let lineStatuses: LineWithStatus[] | undefined;
          let effectiveStatus = status;
          let keptLineCount = unit.lineCount;

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

          byCharacter[unit.characterId].original += unit.lineCount;
          totalOriginal += unit.lineCount;

          if (effectiveStatus === "kept") {
            byCharacter[unit.characterId].afterCut += keptLineCount;
            totalAfterCut += keptLineCount;
          }

          unitsWithStatus.push({ unit, status: effectiveStatus, lineStatuses });
        } else {
          unitsWithStatus.push({ unit, status });
        }
      }

      unitsByScene.set(scene.id, unitsWithStatus);
    }
  }

  // Aggregate by actor
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

  return {
    unitsByScene,
    lineCounts: {
      total: { original: totalOriginal, afterCut: totalAfterCut },
      byCharacter,
      byActor,
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
