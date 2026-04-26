import type { LineCounts } from "@/types/cut";

export interface IntegrityDiscrepancy {
  charId: string;
  field: "lines.original" | "lines.afterCut" | "words.original" | "words.afterCut";
  source: "byCharacterByScene" | "byUnit";
  expected: number;
  actual: number;
}

export interface IntegrityReport {
  ok: boolean;
  discrepancies: IntegrityDiscrepancy[];
  /** Char count the report visited — useful for sanity-checking the check itself ran. */
  charsChecked: number;
}

/**
 * Cross-check that the load-bearing engine outputs (byUnit, byCharacterByScene) reconcile
 * with the canonical byCharacter / words.byCharacter totals. Should always pass when the
 * engine is the sole source of truth — fires only if a future change breaks the invariant.
 */
export function runCountIntegrityCheck(lineCounts: LineCounts): IntegrityReport {
  const discrepancies: IntegrityDiscrepancy[] = [];
  const charIds = Object.keys(lineCounts.byCharacter);

  // Invert byUnit once (O(U)) so the per-character checks are O(C) not O(C×U).
  interface CharTotals { linesOrig: number; linesAfter: number; wordsOrig: number; wordsAfter: number }
  const unitTotals = new Map<string, CharTotals>();
  for (const entry of Object.values(lineCounts.byUnit)) {
    for (const charId of entry.originalSpeakers) {
      const t = unitTotals.get(charId) ?? { linesOrig: 0, linesAfter: 0, wordsOrig: 0, wordsAfter: 0 };
      t.linesOrig += entry.lines.original;
      t.wordsOrig += entry.words.original;
      unitTotals.set(charId, t);
    }
    for (const charId of entry.effectiveSpeakers) {
      const t = unitTotals.get(charId) ?? { linesOrig: 0, linesAfter: 0, wordsOrig: 0, wordsAfter: 0 };
      t.linesAfter += entry.lines.afterCut;
      t.wordsAfter += entry.words.afterCut;
      unitTotals.set(charId, t);
    }
  }

  for (const charId of charIds) {
    const expected = lineCounts.byCharacter[charId];
    const expectedWords = lineCounts.words.byCharacter[charId];
    if (!expected || !expectedWords) continue;

    const sceneEntries = lineCounts.byCharacterByScene[charId] ?? {};
    let scLinesOrig = 0, scLinesAfter = 0, scWordsOrig = 0, scWordsAfter = 0;
    for (const counts of Object.values(sceneEntries)) {
      scLinesOrig += counts.lines.original;
      scLinesAfter += counts.lines.afterCut;
      scWordsOrig += counts.words.original;
      scWordsAfter += counts.words.afterCut;
    }

    if (scLinesOrig !== expected.original)
      discrepancies.push({ charId, field: "lines.original", source: "byCharacterByScene", expected: expected.original, actual: scLinesOrig });
    if (scLinesAfter !== expected.afterCut)
      discrepancies.push({ charId, field: "lines.afterCut", source: "byCharacterByScene", expected: expected.afterCut, actual: scLinesAfter });
    if (scWordsOrig !== expectedWords.original)
      discrepancies.push({ charId, field: "words.original", source: "byCharacterByScene", expected: expectedWords.original, actual: scWordsOrig });
    if (scWordsAfter !== expectedWords.afterCut)
      discrepancies.push({ charId, field: "words.afterCut", source: "byCharacterByScene", expected: expectedWords.afterCut, actual: scWordsAfter });

    const u = unitTotals.get(charId) ?? { linesOrig: 0, linesAfter: 0, wordsOrig: 0, wordsAfter: 0 };

    if (u.linesOrig !== expected.original)
      discrepancies.push({ charId, field: "lines.original", source: "byUnit", expected: expected.original, actual: u.linesOrig });
    if (u.linesAfter !== expected.afterCut)
      discrepancies.push({ charId, field: "lines.afterCut", source: "byUnit", expected: expected.afterCut, actual: u.linesAfter });
    if (u.wordsOrig !== expectedWords.original)
      discrepancies.push({ charId, field: "words.original", source: "byUnit", expected: expectedWords.original, actual: u.wordsOrig });
    if (u.wordsAfter !== expectedWords.afterCut)
      discrepancies.push({ charId, field: "words.afterCut", source: "byUnit", expected: expectedWords.afterCut, actual: u.wordsAfter });
  }

  return { ok: discrepancies.length === 0, discrepancies, charsChecked: charIds.length };
}
