import type { ScriptUnit, Speech, Character } from "@/types/play";
import type { Cut } from "@/types/project";
import type { Insertion } from "@/types/insertion";

/**
 * Expand speech splits in a flat list of ScriptUnits for a single scene.
 *
 * For each Speech with a speechSplits entry, emits two synthetic Speech objects:
 *   Part 1: original id, lines[0..splitAtLineIndex-1]
 *   Part 2: id "${unitId}:s2", characterId = split.newCharacterId ?? original,
 *           lines[splitAtLineIndex..]
 *
 * Non-speech units and unsplit speeches are passed through unchanged.
 * Returns the input array unchanged if speechSplits is absent or empty.
 */
export function expandSplits(
  units: ScriptUnit[],
  speechSplits: Cut["speechSplits"]
): ScriptUnit[] {
  if (!speechSplits || Object.keys(speechSplits).length === 0) return units;

  const result: ScriptUnit[] = [];
  for (const unit of units) {
    if (unit.type !== "speech") {
      result.push(unit);
      continue;
    }
    const split = speechSplits[unit.id];
    if (!split) {
      result.push(unit);
      continue;
    }

    const { splitAtLineIndex, newCharacterId } = split;
    const lines1 = unit.lines.slice(0, splitAtLineIndex);
    const lines2 = unit.lines.slice(splitAtLineIndex);

    // Part 1 keeps the original id — existing cutMap/lineCutMap entries remain valid
    const part1: Speech = {
      ...unit,
      lines: lines1,
      lineCount: lines1.length,
    };
    result.push(part1);

    // Part 2 gets virtual id ":s2" — attributed to newCharacterId if set
    if (lines2.length > 0) {
      const part2: Speech = {
        ...unit,
        id: `${unit.id}:s2`,
        characterId: newCharacterId ?? unit.characterId,
        lines: lines2,
        lineCount: lines2.length,
      };
      result.push(part2);
    }
  }
  return result;
}

/**
 * Expand insertions in a flat list of ScriptUnits for a single scene.
 *
 * For each unit, emits the unit itself, then any Insertion objects whose
 * afterUnitId matches that unit's id — as synthetic Speech objects.
 *
 * Returns the input array unchanged if insertions is absent or empty.
 */
export function expandInsertions(
  units: ScriptUnit[],
  insertions: Cut["insertions"],
  castList: Character[]
): ScriptUnit[] {
  if (!insertions || Object.keys(insertions).length === 0) return units;

  // Build afterUnitId → Insertion[] map
  const afterMap = new Map<string, Insertion[]>();
  for (const ins of Object.values(insertions)) {
    const arr = afterMap.get(ins.afterUnitId) ?? [];
    arr.push(ins);
    afterMap.set(ins.afterUnitId, arr);
  }

  const result: ScriptUnit[] = [];
  for (const unit of units) {
    result.push(unit);
    const following = afterMap.get(unit.id);
    if (!following) continue;
    for (const ins of following) {
      const charName = castList.find((c) => c.id === ins.characterId)?.name ?? ins.characterId;
      const synthetic: Speech = {
        type: "speech",
        id: ins.id,
        characterId: ins.characterId,
        characterName: charName,
        speakerTag: charName,
        lines: ins.lines.map((l) => ({ id: l.id, ftln: 0, text: l.text })),
        lineCount: ins.lines.length,
      };
      result.push(synthetic);
    }
  }
  return result;
}
