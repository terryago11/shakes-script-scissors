import type { ScriptUnit } from "./play";

export interface ScriptUnitWithStatus {
  unit: ScriptUnit;
  status: "kept" | "cut";
}

export interface LineCounts {
  total: {
    original: number;
    afterCut: number;
  };
  byCharacter: Record<string, { original: number; afterCut: number }>;
  byActor: Record<
    string,
    { characters: string[]; original: number; afterCut: number }
  >;
}

export interface CueEntry {
  type: "cue" | "lines" | "stage";
  text: string;
}

export interface CueScript {
  actorId: string;
  actorName: string;
  playTitle: string;
  cutName: string;
  entries: CueEntry[];
}
