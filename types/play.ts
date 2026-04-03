export interface Play {
  id: string;
  title: string;
  acts: Act[];
  castList: Character[];
}

export interface Act {
  id: string;
  number: number;
  title: string;
  scenes: Scene[];
  /** "act" (default / undefined), "prologue", "epilogue", or "induction" */
  divType?: "act" | "prologue" | "epilogue" | "induction";
}

export interface Scene {
  id: string;
  number: number;
  title: string;
  units: ScriptUnit[];
  /** "scene" (default / undefined), "chorus", "epilogue", or "prologue" */
  sceneType?: "scene" | "chorus" | "epilogue" | "prologue";
}

export type ScriptUnit = Speech | StageDirection;

export interface Speech {
  type: "speech";
  id: string;
  /** e.g. "#Ham" — matches Character.id; always the first (primary) character */
  characterId: string;
  /**
   * All character IDs from the TEI who="" attribute.
   * Defined and length > 1 when multiple speakers deliver these lines simultaneously.
   * Undefined for normal single-speaker speeches.
   */
  characterIds?: string[];
  /** Normalized display name (cast list name uppercased, or speaker tag as fallback) */
  characterName: string;
  /** Raw text from the TEI <speaker> tag verbatim, e.g. "GHOST OF HAMLET'S FATHER " */
  speakerTag: string;
  lines: Line[];
  lineCount: number;
  /** True when the speech contains <lg> stanza children (e.g. a sung song) */
  isSong?: boolean;
  /** Delivery/location qualifier from a pre-speech <stage>, e.g. "[within]".
   *  Displayed inline after the character name. */
  deliveryNote?: string;
}

export interface Line {
  id: string;
  /** Folger Through Line Number */
  ftln: number;
  text: string;
  /** True when this line comes from an <lg> stanza that is a song (not a poem) */
  isSong?: boolean;
  /** True when this line is a B-rhyme (even 1-indexed position) in a poem stanza — rendered indented */
  poemIndent?: boolean;
  /** True when this line has part="F" or part="I"+prev= — it continues a shared verse line */
  partIndent?: boolean;
  /** Character count of all preceding parts in the shared-line chain.
   *  Used for proportional ch-based indent so the fragment visually "completes" the line. */
  partIndentChars?: number;
  /** Inline stage direction text preceding this line's spoken text (e.g. "To Helen.").
   *  Extracted from <stage> elements inside <l> or <p>/<lb> prose; rendered as italic muted
   *  annotation before the line text. Not part of the editable spoken text. */
  stageNote?: string;
}

export interface StageDirection {
  type: "stage";
  id: string;
  text: string;
  /** Character IDs mentioned in the stage direction */
  characters: string[];
  stageType?: "entrance" | "exit" | "business" | "delivery" | "mixed";
  isSong?: boolean;
  isDance?: boolean;
}

export interface Character {
  /** e.g. "#Ham" from xml:id — we store with the # prefix */
  id: string;
  name: string;
}
