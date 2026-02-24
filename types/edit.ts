/**
 * Word-level speech editing types.
 *
 * Edits are stored as a sparse list of operations against the canonical TEI line text.
 * Character offsets refer to positions within `Line.text`.
 */

export interface SpeechEdit {
  unitId: string;
  ops: EditOp[];
}

export type EditOp =
  /** Cut a range of characters within a line */
  | { type: "cut"; lineId: string; start: number; end: number }
  /** Insert text before a character offset within a line */
  | { type: "insert"; lineId: string; offset: number; text: string };
