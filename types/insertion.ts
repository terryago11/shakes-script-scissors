export interface InsertedLine {
  /** Synthetic ID — format: "ins_{insertionId}_{index}" */
  id: string;
  text: string;
}

export interface Insertion {
  id: string;
  /** The insertion appears after this unit in the effective scene order */
  afterUnitId: string;
  /** Character who speaks this insertion */
  characterId: string;
  lines: InsertedLine[];
}
