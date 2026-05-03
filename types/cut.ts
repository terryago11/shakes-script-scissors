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

export interface SceneCounts {
  lines: CountPair;
  words: CountPair;
}

/** Per-unit kept counts, the load-bearing source of truth for any UI count surface.
 *  Consumers that need per-character-per-scene cells (with subdivision) should re-bucket
 *  from this map rather than recomputing cuts/edits in parallel. */
export interface UnitCounts {
  lines: CountPair;
  words: CountPair;
  effectiveSpeakers: string[];
  originalSpeakers: string[];
}

export interface LineCounts {
  total: CountPair;
  byCharacter: Record<string, CountPair>;
  byActor: Record<string, { characters: string[] } & CountPair>;
  byScene: Record<string, SceneCounts>;
  byAct: Record<string, SceneCounts>;
  /** charId → real sceneId → counts. Sanity-check companion to byCharacter; subdivided
   *  columns use byUnit instead. */
  byCharacterByScene: Record<string, Record<string, SceneCounts>>;
  /** unitId → kept counts + speaker attribution. Engine is the only place that interprets
   *  cutMap / lineCutMap / speechEdits / speechReassignments. */
  byUnit: Record<string, UnitCounts>;
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
  sceneId?: string;
  actId?: string;
  sceneTitle?: string;
  actTitle?: string;
  isSong?: boolean;
  isDance?: boolean;
}

export interface CueScript {
  actorId: string;
  actorName: string;
  playTitle: string;
  cutName: string;
  entries: CueEntry[];
}
