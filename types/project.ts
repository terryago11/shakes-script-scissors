export interface ProjectSettings {
  wordsPerMinute: number;
  /** Minutes below which an actor quick-change is flagged as a warning. Defaults to 2.0 at usage site. */
  quickChangeThresholdMinutes?: number;
}

export interface Project {
  /** Schema version for future migrations */
  version: number;
  id: string;
  playId: string;
  playTitle: string;
  /** User-given project name (e.g. "2024 Production"). Falls back to playTitle if absent. */
  name?: string;
  settings?: ProjectSettings;
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
  /** Flat list of scene IDs in display order; absent = TEI order */
  sceneOrder?: string[];
  /** stageId → effective character list (full override of StageDirection.characters) */
  stageDirectionEdits?: Record<string, string[]>;
  /** Named pauses inserted after specific scenes. Key format: "after:{sceneId}" */
  pauses?: Record<string, { name: string; minutes: number }>;
  /** unitId → characterId: re-attributes a speech to a different character for cast planning */
  speechReassignments?: Record<string, string>;
}
