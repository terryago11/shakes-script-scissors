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
  /** e.g. "#Ham" — matches Character.id */
  characterId: string;
  /** Normalized display name (cast list name uppercased, or speaker tag as fallback) */
  characterName: string;
  /** Raw text from the TEI <speaker> tag verbatim, e.g. "GHOST OF HAMLET'S FATHER " */
  speakerTag: string;
  lines: Line[];
  lineCount: number;
}

export interface Line {
  id: string;
  /** Folger Through Line Number */
  ftln: number;
  text: string;
}

export interface StageDirection {
  type: "stage";
  id: string;
  text: string;
  /** Character IDs mentioned in the stage direction */
  characters: string[];
  stageType?: "entrance" | "exit" | "business" | "delivery";
  isSong?: boolean;
  isDance?: boolean;
}

export interface Character {
  /** e.g. "#Ham" from xml:id — we store with the # prefix */
  id: string;
  name: string;
}
