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
}

export interface Scene {
  id: string;
  number: number;
  title: string;
  units: ScriptUnit[];
}

export type ScriptUnit = Speech | StageDirection;

export interface Speech {
  type: "speech";
  id: string;
  /** e.g. "#Ham" — matches Character.id */
  characterId: string;
  /** Display name from <speaker>, e.g. "HAMLET" */
  characterName: string;
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
}

export interface Character {
  /** e.g. "#Ham" from xml:id — we store with the # prefix */
  id: string;
  name: string;
}
