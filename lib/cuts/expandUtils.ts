import type { ScriptUnit, Speech, Line, StageDirection, Character } from "@/types/play";
import type { Cut } from "@/types/project";
import type { Insertion } from "@/types/insertion";
import type { InsertedSD } from "@/types/insertedsd";

/**
 * Expand speech splits in a flat list of ScriptUnits for a single scene.
 *
 * For each Speech with a speechSplits entry, emits two synthetic Speech objects:
 *   Part 1: original id
 *   Part 2: id "${unitId}:s2", characterId = split.newCharacterId ?? original
 *
 * When `splitAtWordOffset` is set the split occurs within line[splitAtLineIndex]:
 *   Part 1 gets text[0..wordOffset] (trimmed), Part 2 starts with the remainder
 *   indented proportionally (partIndent=true, partIndentChars=wordOffset).
 *
 * When `splitAtWordOffset` is absent the split is a clean line-boundary split.
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

    const { splitAtLineIndex, splitAtWordOffset, newCharacterId } = split;

    if (splitAtWordOffset !== undefined) {
      // --- Intra-line (word-offset) split ---
      const wordOffset = splitAtWordOffset;
      const splitLine = unit.lines[splitAtLineIndex];

      const p1Text = splitLine.text.slice(0, wordOffset).trimEnd();
      const p2Text = splitLine.text.slice(wordOffset).trimStart();

      // Part 1: full lines before split line + left half of split line (if non-empty)
      const halfP1: Line = { ...splitLine, id: `${splitLine.id}:a`, text: p1Text };
      const part1Lines: Line[] = [
        ...unit.lines.slice(0, splitAtLineIndex),
        ...(p1Text ? [halfP1] : []),
      ];

      // Part 2: right half of split line (indented proportionally) + remaining lines
      const halfP2: Line = {
        ...splitLine,
        id: `${splitLine.id}:b`,
        text: p2Text,
        partIndent: true,
        partIndentChars: wordOffset,
      };
      const part2Lines: Line[] = [
        ...(p2Text ? [halfP2] : []),
        ...unit.lines.slice(splitAtLineIndex + 1),
      ];

      const part1: Speech = { ...unit, lines: part1Lines, lineCount: part1Lines.length };
      result.push(part1);

      if (part2Lines.length > 0) {
        const part2: Speech = {
          ...unit,
          id: `${unit.id}:s2`,
          characterId: newCharacterId ?? unit.characterId,
          lines: part2Lines,
          lineCount: part2Lines.length,
        };
        result.push(part2);
      }
    } else {
      // --- Line-boundary split (original behaviour) ---
      const lines1 = unit.lines.slice(0, splitAtLineIndex);
      const lines2 = unit.lines.slice(splitAtLineIndex);

      // Part 1 keeps the original id — existing cutMap/lineCutMap entries remain valid
      const part1: Speech = { ...unit, lines: lines1, lineCount: lines1.length };
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

export function expandInsertedSDs(
  units: ScriptUnit[],
  insertedSDs: Record<string, InsertedSD> | undefined
): ScriptUnit[] {
  if (!insertedSDs || Object.keys(insertedSDs).length === 0) return units;

  const afterMap = new Map<string, InsertedSD[]>();
  for (const isd of Object.values(insertedSDs)) {
    const arr = afterMap.get(isd.afterUnitId) ?? [];
    arr.push(isd);
    afterMap.set(isd.afterUnitId, arr);
  }

  const result: ScriptUnit[] = [];
  for (const unit of units) {
    result.push(unit);
    const following = afterMap.get(unit.id);
    if (!following) continue;
    for (const isd of following) {
      result.push({
        type: "stage",
        id: isd.id,
        text: isd.text,
        characters: isd.characters,
        stageType: isd.stageType,
        isSong: isd.isSong,
        isDance: isd.isDance,
      } as StageDirection);
    }
  }
  return result;
}

/**
 * Expand speeches whose lines contain `stageNote` values into:
 *   Speech (lines before the stageNote line)
 *   StageDirection (synthetic, text = stageNote, id = "{lineId}:sd")
 *   Speech (stageNote line stripped + remaining lines, id = "{speechId}:sn{lineIdx}")
 *
 * Recursively expands additional stageNotes in the continuation speech.
 * Non-speech units and speeches with no stageNotes pass through unchanged.
 */
export function expandStageNotes(units: ScriptUnit[]): ScriptUnit[] {
  // Fast path: nothing to expand
  if (!units.some((u) => u.type === "speech" && (u as Speech).lines.some((l) => l.stageNote))) {
    return units;
  }

  const result: ScriptUnit[] = [];
  for (const unit of units) {
    if (unit.type !== "speech") {
      result.push(unit);
      continue;
    }
    const speech = unit as Speech;
    const snIdx = speech.lines.findIndex((l) => l.stageNote);
    if (snIdx === -1) {
      result.push(unit);
      continue;
    }

    const linesBefore = speech.lines.slice(0, snIdx);
    const stageLine = speech.lines[snIdx];
    const linesAfter = speech.lines.slice(snIdx + 1);

    // If the inline stage was mid-line, stageNotePre holds the spoken text that came before it.
    // Append a synthetic "pre" line to linesBefore so it renders before the SD block.
    const allLinesBefore: Line[] = stageLine.stageNotePre
      ? [...linesBefore, { ...stageLine, text: stageLine.stageNotePre, stageNote: undefined, stageNotePre: undefined }]
      : linesBefore;

    // Part 1: lines before the stageNote line (emit only if non-empty)
    if (allLinesBefore.length > 0) {
      result.push({ ...speech, lines: allLinesBefore, lineCount: allLinesBefore.length });
    }

    // Synthetic StageDirection
    const syntheticSD: StageDirection = {
      type: "stage",
      id: `${stageLine.id}:sd`,
      text: stageLine.stageNote!,
      characters: [],
      stageType: "delivery",
    };
    result.push(syntheticSD);

    // Part 2: the stageLine (after-text) with stageNote/stageNotePre stripped + remaining lines.
    // Add indentation to show the text continues on the same verse line as the before-text.
    // Only add if the line doesn't already have a partIndent from TEI shared-verse encoding.
    const sdIndentChars = stageLine.stageNotePre
      ? stageLine.stageNotePre.length  // mid-line SD: indent by length of before-text
      : 6;                             // leading SD (burden/refrain): small fixed indent
    const continuedLine: Line = {
      ...stageLine,
      stageNote: undefined,
      stageNotePre: undefined,
      ...(!stageLine.partIndent && { partIndent: true, partIndentChars: sdIndentChars }),
    };
    const part2Lines = [continuedLine, ...linesAfter].filter((l) => l.text.trim().length > 0);
    if (part2Lines.length > 0) {
      const part2: Speech = {
        ...speech,
        id: `${speech.id}:sn${snIdx}`,
        lines: part2Lines,
        lineCount: part2Lines.length,
      };
      // Recurse to handle additional stageNotes in part2
      result.push(...expandStageNotes([part2]));
    }
  }
  return result;
}
