export interface WordGap {
  /** Character offset in the original string where a word starts (or the end of the string). */
  offset: number;
}

/**
 * Returns the character offset of each word-start plus one trailing entry at
 * the end of the string.  Callers render the text between consecutive gaps
 * as a word, and use each gap's offset as the insertion / split point.
 *
 * Example: "To be"  →  [{offset:0}, {offset:3}, {offset:5}]
 *   gap[0] ← before "To"
 *   gap[1] ← before "be"
 *   gap[2] ← after  "be" (end of string)
 */
export function getWordGaps(text: string): WordGap[] {
  const gaps: WordGap[] = [];
  const regex = /\S+/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    gaps.push({ offset: match.index });
  }
  gaps.push({ offset: text.length }); // trailing gap after last word
  return gaps;
}
