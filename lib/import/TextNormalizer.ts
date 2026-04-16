/**
 * Text normalisation utilities for the Word import pipeline.
 */

/** Lowercase, strip punctuation (keeping alphanumeric and spaces), collapse whitespace. */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Split normalised text into tokens (on whitespace). */
export function tokenize(text: string): string[] {
  const n = normalize(text);
  return n ? n.split(" ") : [];
}

/**
 * Jaccard similarity over token sets (intersection / union).
 * Returns 0..1 where 1 = identical token sets.
 */
export function jaccardSimilarity(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 1;
  if (a.length === 0 || b.length === 0) return 0;
  const setA = new Set(a);
  const setB = new Set(b);
  let intersection = 0;
  for (const t of setA) {
    if (setB.has(t)) intersection++;
  }
  const union = setA.size + setB.size - intersection;
  return intersection / union;
}

const ROMAN: Record<string, number> = {
  i: 1, v: 5, x: 10, l: 50, c: 100, d: 500, m: 1000,
};

/** Parse a roman numeral string (e.g. "III", "iv") to arabic. Returns 0 on failure. */
export function romanToArabic(s: string): number {
  const str = s.toLowerCase();
  if (!/^[ivxlcdm]+$/.test(str)) return 0;
  let result = 0;
  for (let i = 0; i < str.length; i++) {
    const curr = ROMAN[str[i]];
    const next = ROMAN[str[i + 1]];
    if (curr === undefined) return 0;
    result += next && curr < next ? -curr : curr;
  }
  return result;
}

const WORD_NUMS: Record<string, number> = {
  one: 1, first: 1,
  two: 2, second: 2,
  three: 3, third: 3,
  four: 4, fourth: 4,
  five: 5, fifth: 5,
  six: 6, sixth: 6,
  seven: 7, seventh: 7,
  eight: 8, eighth: 8,
  nine: 9, ninth: 9,
  ten: 10, tenth: 10,
};

/** Parse a word-form number ("one", "first") to arabic. Returns 0 on failure. */
export function wordNumToArabic(s: string): number {
  return WORD_NUMS[s.toLowerCase()] ?? 0;
}

/**
 * Parse an act/scene number from a single token.
 * Handles arabic digits, roman numerals, English words.
 * Returns 0 if unparseable.
 */
export function parseNumber(s: string): number {
  const trimmed = s.trim();
  const n = parseInt(trimmed, 10);
  if (!isNaN(n) && String(n) === trimmed) return n;
  const roman = romanToArabic(trimmed);
  if (roman > 0) return roman;
  return wordNumToArabic(trimmed);
}

/** Tokenise `text` into words with their start/end offsets in the original string. */
export function tokenizeWithOffsets(
  text: string
): Array<{ token: string; start: number; end: number }> {
  const result: Array<{ token: string; start: number; end: number }> = [];
  const regex = /\S+/g;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(text)) !== null) {
    result.push({ token: m[0], start: m.index, end: m.index + m[0].length });
  }
  return result;
}

/**
 * Find the character span (start, end) of `queryText` within `sourceText` using
 * token-level matching: normalise both to token sequences, find the token subsequence,
 * then map back to character offsets in the *original* `sourceText`.
 *
 * Returns null if not found.
 */
export function findTokenSpan(
  queryText: string,
  sourceText: string
): { start: number; end: number } | null {
  const queryTokens = tokenize(queryText);
  if (queryTokens.length === 0) return null;

  const sourceWithOffsets = tokenizeWithOffsets(sourceText);
  // Normalise each source token to match tokenize() output
  const sourceNorm = sourceWithOffsets.map((t) => tokenize(t.token).join(""));

  for (let i = 0; i <= sourceNorm.length - queryTokens.length; i++) {
    let match = true;
    for (let j = 0; j < queryTokens.length; j++) {
      if (sourceNorm[i + j] !== queryTokens[j]) {
        match = false;
        break;
      }
    }
    if (match) {
      return {
        start: sourceWithOffsets[i].start,
        end: sourceWithOffsets[i + queryTokens.length - 1].end,
      };
    }
  }
  return null;
}
