import type { ScriptUnit } from "./play";

export interface LineWithStatus {
  lineId: string;
  status: "kept" | "cut";
}

export interface ScriptUnitWithStatus {
  unit: ScriptUnit;
  status: "kept" | "cut";
  /** Per-line cut status for speech units (only present when lineCutMap has entries for this speech) */
  lineStatuses?: LineWithStatus[];
}

export interface CountPair {
  original: number;
  afterCut: number;
}

export interface LineCounts {
  total: CountPair;
  byCharacter: Record<string, CountPair>;
  byActor: Record<string, { characters: string[] } & CountPair>;
  /** Word-level counts (parallel structure to line counts) */
  words: {
    total: CountPair;
    byCharacter: Record<string, CountPair>;
    byActor: Record<string, { characters: string[] } & CountPair>;
  };
}

export interface CueEntry {
  type: "cue" | "lines" | "stage";
  text: string;
  characterName?: string; // set on "lines" entries to show who is speaking
  cueSpeakerName?: string; // set on "cue" entries to label who is giving the cue
}

export interface CueScript {
  actorId: string;
  actorName: string;
  playTitle: string;
  cutName: string;
  entries: CueEntry[];
}
