export interface Project {
  /** Schema version for future migrations */
  version: number;
  id: string;
  playId: string;
  playTitle: string;
  actors: Actor[];
  /** Maps characterId → actorId (one actor per character) */
  assignments: ActorAssignment[];
  cuts: Cut[];
  activeCutId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Actor {
  id: string;
  name: string;
  /** Hex color for UI highlighting, e.g. "#e74c3c" */
  color: string;
}

export interface ActorAssignment {
  characterId: string;
  actorId: string;
}

export interface Cut {
  id: string;
  name: string;
  createdAt: string;
  /** ScriptUnit.id → status; absent = "kept" (default) */
  cutMap: Record<string, "cut" | "kept">;
  /** Line.id → status; absent = "kept" (default). Only meaningful within kept speeches. */
  lineCutMap?: Record<string, "cut" | "kept">;
  /** unitId → word-level edit ops for that speech */
  speechEdits?: Record<string, import("./edit").SpeechEdit>;
}
