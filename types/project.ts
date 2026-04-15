export interface ProjectSettings {
  wordsPerMinute: number;
  /** Minutes below which an actor quick-change is flagged as a warning. Defaults to 2.0 at usage site. */
  quickChangeThresholdMinutes?: number;
  /** Minimum total minutes for a suggested rehearsal block. Defaults to 5. */
  rehearsalMinBlockMinutes?: number;
  /** Maximum total minutes for a suggested rehearsal block. Defaults to 60. */
  rehearsalMaxBlockMinutes?: number;
  /** Actors with less stage time (minutes) than this are flagged in Casting. Defaults to 10. */
  minActorStageTimeMinutes?: number;
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
  /** Short production notes per act, keyed by act ID */
  actDescriptions?: Record<string, string>;
  /** Short production notes per scene, keyed by scene ID */
  sceneDescriptions?: Record<string, string>;
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

export interface SubdivisionSplit {
  /** Stable unique ID for this split boundary (generated via generateId()) */
  id: string;
  /** The ScriptUnit.id of the last unit in this part (part ends after this unit) */
  afterUnitId: string;
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
  /**
   * unitId → speaker override: replaces the full set of speakers for that speech.
   * A single-element array = reassigned to one character (was a single string in v1 projects).
   * A multi-element array = speech attributed to all listed characters simultaneously.
   * Absent = use speech.characterIds ?? [speech.characterId].
   */
  speechReassignments?: Record<string, string[]>;
  /** characterId → display name override for this cut; never alters underlying Play data */
  characterAliases?: Record<string, string>;
  /**
   * Director-specified pairs of characters that must share the same actor.
   * Each entry is [charIdA, charIdB] (IDs stored in sorted order).
   * Overrides quick-change constraints in the Suggest algorithm — use to
   * encode dramaturgical choices (e.g. Theseus/Oberon) before running Suggest.
   */
  characterLinks?: Array<[string, string]>;
  /**
   * Speech splits: divides a Speech into two independently cuttable parts.
   * Part 1 keeps the original unitId. Part 2 uses "${unitId}:s2".
   * lines[0..splitAtLineIndex-1] = part 1; lines[splitAtLineIndex..] = part 2.
   */
  speechSplits?: Record<string, {
    /** Part 2 starts at this index into speech.lines[] */
    splitAtLineIndex: number;
    /**
     * If set, the split occurs within line[splitAtLineIndex] at this character offset.
     * Part 1 gets text[0..splitAtWordOffset], Part 2 gets text[splitAtWordOffset..].
     * When absent the split is a clean line-boundary split (existing behaviour).
     */
    splitAtWordOffset?: number;
    /** If set, Part 2 is attributed to this character instead of the original */
    newCharacterId?: string;
  }>;
  /** Inserted speeches keyed by insertion ID. Each appears after a specific unit. */
  insertions?: Record<string, import("./insertion").Insertion>;
  /**
   * Per-line overrides for shared-verse (partIndent) indentation.
   * lineId → true (force indent) | false (suppress TEI-set indent).
   * Absent key = use the TEI parser's partIndent value.
   * Only meaningful for lines where the TEI parser sets partIndent=true.
   */
  partIndentOverrides?: Record<string, boolean>;
  /**
   * Song/dance stage direction durations: stageId → extra minutes to add to scene/show time.
   * Set via the "+ time" editor on highlighted song/dance SDs.
   */
  stageDurations?: Record<string, number>;
  /** Director-inserted stage directions keyed by their generated ID. Each appears after a specific unit. */
  insertedSDs?: Record<string, import("./insertedsd").InsertedSD>;
  /**
   * Overrides isSong/isDance on existing TEI SDs without modifying the parsed Play data.
   * A missing key means use the TEI value; an explicit false overrides a TEI true.
   */
  sdFlagOverrides?: Record<string, { isSong?: boolean; isDance?: boolean }>;
  /**
   * Per-line song overrides: lineId → true (mark as sung) | false (un-mark a TEI sung line).
   * Absent key = use the TEI parser's isSong value.
   */
  lineSongOverrides?: Record<string, boolean>;
  /**
   * Cosmetic text rewrites for stage directions: sdId → rewritten prose.
   * Absent key = display the original TEI text.
   * Display-only: has no effect on on-stage tracking, stage time, or character calculations.
   */
  sdTextEdits?: Record<string, string>;
  /**
   * Scene sub-divisions: splits a scene into A/B/C sub-parts for planning purposes.
   * Key = real scene ID. Value = ordered array of split points (each defines where a new part begins).
   * N splits → N+1 parts, labelled A, B, C, …
   * Sub-scenes are always displayed in canonical order (A before B before C).
   * Virtual sub-scene IDs use the format "${realSceneId}:p${partIndex}".
   */
  sceneSubdivisions?: Record<string, SubdivisionSplit[]>;
}
