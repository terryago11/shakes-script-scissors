import type { Play, Scene, ScriptUnit } from "@/types/play";
import type { Actor, ActorAssignment, Cut } from "@/types/project";
import type { LineCounts, ScriptUnitWithStatus } from "@/types/cut";

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
        unitsWithStatus.push({ unit, status });

        if (unit.type === "speech") {
          const count = unit.lineCount;
          if (!byCharacter[unit.characterId]) {
            byCharacter[unit.characterId] = { original: 0, afterCut: 0 };
          }
          byCharacter[unit.characterId].original += count;
          totalOriginal += count;

          if (status === "kept") {
            byCharacter[unit.characterId].afterCut += count;
            totalAfterCut += count;
          }
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
  for (const act of play.acts) {
    for (const scene of act.scenes) {
      for (const unit of scene.units) {
        if (unit.type === "speech" && unit.characterId === characterId) {
          original += unit.lineCount;
          if (cut.cutMap[unit.id] !== "cut") {
            afterCut += unit.lineCount;
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
