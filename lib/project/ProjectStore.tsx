"use client";

import React, { createContext, useContext, useReducer, useEffect, useCallback } from "react";
import type { Project, Actor, ActorAssignment, Cut, ProjectSettings } from "@/types/project";
import type { SpeechEdit, EditOp } from "@/types/edit";
import type { Insertion, InsertedLine } from "@/types/insertion";
import { generateId, defaultColors } from "./projectUtils";

const CURRENT_VERSION = 1;
const STORAGE_PREFIX = "sss_project_";
const MAX_HISTORY = 20;

// --- State and actions ---

interface ProjectState {
  project: Project | null;
  activeCutId: string | null;
  /** In-memory undo stack — NOT persisted to localStorage. Clears on cut switch / page reload. */
  undoStack: Cut[];
  /** In-memory redo stack — NOT persisted to localStorage. */
  redoStack: Cut[];
}

const initialState: ProjectState = {
  project: null,
  activeCutId: null,
  undoStack: [],
  redoStack: [],
};

type ProjectAction =
  | { type: "LOAD"; project: Project }
  | { type: "UNLOAD" }
  | { type: "SET_ACTIVE_CUT"; cutId: string }
  | { type: "TOGGLE_UNIT"; unitId: string }
  | { type: "SET_UNIT_STATUS"; unitId: string; status: "cut" | "kept" }
  | { type: "BULK_ADD_EDIT_OPS"; ops: Array<{ unitId: string; op: EditOp }> }
  | { type: "REMOVE_EDIT_OP"; unitId: string; opIndex: number }
  | { type: "CLEAR_SPEECH_EDITS"; unitId: string }
  | { type: "ADD_CUT"; name: string; cloneFromId?: string }
  | { type: "RENAME_CUT"; cutId: string; name: string }
  | { type: "DELETE_CUT"; cutId: string }
  | { type: "ADD_ACTOR"; name: string }
  | { type: "UPDATE_ACTOR"; actorId: string; name: string; color: string }
  | { type: "DELETE_ACTOR"; actorId: string }
  | { type: "ASSIGN_CHARACTER"; characterId: string; actorId: string | null }
  | { type: "RENAME_PROJECT"; name: string }
  | { type: "SET_SCENE_ORDER"; sceneOrder: string[] }
  | { type: "SET_SD_CHARACTERS"; stageId: string; characters: string[] }
  | { type: "REPLACE_PROJECT"; project: Project }
  | { type: "SET_PAUSE"; afterSceneId: string; name: string; minutes: number }
  | { type: "REMOVE_PAUSE"; afterSceneId: string }
  | { type: "UPDATE_SETTINGS"; settings: Partial<ProjectSettings> }
  | { type: "REASSIGN_SPEECH"; unitId: string; characterId: string | null }
  | { type: "SET_CHARACTER_ALIAS"; characterId: string; alias: string | null }
  | { type: "TOGGLE_CHARACTER_LINK"; charIdA: string; charIdB: string }
  | { type: "BULK_SET_CAST"; actors: Actor[]; assignments: ActorAssignment[] }
  | { type: "SPLIT_SPEECH"; unitId: string; splitAtLineIndex: number; splitAtWordOffset?: number; newCharacterId?: string }
  | { type: "MERGE_SPEECH"; unitId: string; part2LineIds: string[] }
  | { type: "ADD_INSERTION"; insertion: Insertion }
  | { type: "REMOVE_INSERTION"; insertionId: string; lineIds: string[] }
  | { type: "UPDATE_INSERTION"; insertionId: string; characterId: string; lines: InsertedLine[] }
  | { type: "SET_STAGE_DURATION"; stageId: string; minutes: number }
  | { type: "CLEAR_STAGE_DURATION"; stageId: string }
  | { type: "UNDO" }
  | { type: "REDO" }
  | { type: "SET_PART_INDENT_OVERRIDE"; lineId: string; value: boolean | null };

function reducer(state: ProjectState, action: ProjectAction): ProjectState {
  if (!state.project && action.type !== "LOAD" && action.type !== "REPLACE_PROJECT") {
    return state;
  }

  switch (action.type) {
    case "LOAD":
    case "REPLACE_PROJECT": {
      const activeCutId = action.project.activeCutId ||
        action.project.cuts[0]?.id || null;
      return { project: action.project, activeCutId, undoStack: [], redoStack: [] };
    }

    case "UNLOAD":
      return { project: null, activeCutId: null, undoStack: [], redoStack: [] };

    case "RENAME_PROJECT":
      return {
        ...state,
        project: state.project
          ? { ...state.project, name: action.name, updatedAt: now() }
          : null,
      };

    case "SET_ACTIVE_CUT":
      return {
        ...state,
        activeCutId: action.cutId,
        undoStack: [],
        redoStack: [],
        project: state.project
          ? { ...state.project, activeCutId: action.cutId, updatedAt: now() }
          : null,
      };

    case "UNDO": {
      if (!state.undoStack.length || !state.project || !state.activeCutId) return state;
      const prev = state.undoStack[state.undoStack.length - 1];
      const curr = state.project.cuts.find((c) => c.id === state.activeCutId)!;
      return {
        ...state,
        project: {
          ...state.project,
          cuts: state.project.cuts.map((c) => c.id === state.activeCutId ? prev : c),
          updatedAt: now(),
        },
        undoStack: state.undoStack.slice(0, -1),
        redoStack: [...state.redoStack, curr],
      };
    }

    case "REDO": {
      if (!state.redoStack.length || !state.project || !state.activeCutId) return state;
      const next = state.redoStack[state.redoStack.length - 1];
      const curr = state.project.cuts.find((c) => c.id === state.activeCutId)!;
      return {
        ...state,
        project: {
          ...state.project,
          cuts: state.project.cuts.map((c) => c.id === state.activeCutId ? next : c),
          updatedAt: now(),
        },
        undoStack: [...state.undoStack, curr],
        redoStack: state.redoStack.slice(0, -1),
      };
    }

    case "TOGGLE_UNIT": {
      const p = state.project!;
      const cut = p.cuts.find((c) => c.id === state.activeCutId);
      if (!cut) return state;
      const current = cut.cutMap[action.unitId];
      const newStatus = current === "cut" ? "kept" : "cut";
      return withUndo(state, (c) => ({
        ...c,
        cutMap: { ...c.cutMap, [action.unitId]: newStatus },
      }));
    }

    case "SET_UNIT_STATUS":
      return withUndo(state, (c) => ({
        ...c,
        cutMap: { ...c.cutMap, [action.unitId]: action.status },
      }));

    case "BULK_ADD_EDIT_OPS": {
      // Apply all ops in one state update (avoids N re-renders in cut mode)
      return withUndo(state, (c) => {
        const edits = { ...(c.speechEdits ?? {}) };
        for (const { unitId, op } of action.ops) {
          const existing = edits[unitId];
          edits[unitId] = {
            unitId,
            ops: [...(existing?.ops ?? []), op],
          };
        }
        return { ...c, speechEdits: edits };
      });
    }

    case "SET_SCENE_ORDER":
      return withUndo(state, (c) => ({ ...c, sceneOrder: action.sceneOrder }));

    case "SET_SD_CHARACTERS":
      return withUndo(state, (c) => ({
        ...c,
        stageDirectionEdits: {
          ...c.stageDirectionEdits,
          [action.stageId]: action.characters,
        },
      }));

    case "REMOVE_EDIT_OP": {
      return withUndo(state, (c) => {
        const edits = { ...(c.speechEdits ?? {}) };
        const existing = edits[action.unitId];
        if (!existing) return c;
        const newOps = existing.ops.filter((_, i) => i !== action.opIndex);
        if (newOps.length === 0) {
          const { [action.unitId]: _removed, ...rest } = edits;
          void _removed;
          return { ...c, speechEdits: Object.keys(rest).length > 0 ? rest : undefined };
        }
        edits[action.unitId] = { ...existing, ops: newOps };
        return { ...c, speechEdits: edits };
      });
    }

    case "CLEAR_SPEECH_EDITS": {
      const current = state.project!.cuts.find((c) => c.id === state.activeCutId)?.speechEdits ?? {};
      const { [action.unitId]: _removed, ...rest } = current;
      void _removed;
      return withUndo(state, (c) => ({
        ...c,
        speechEdits: Object.keys(rest).length > 0 ? rest : undefined,
      }));
    }

    case "ADD_CUT": {
      const p = state.project!;
      const source = action.cloneFromId
        ? p.cuts.find((c) => c.id === action.cloneFromId)
        : null;
      const newCut: Cut = {
        id: generateId(),
        name: action.name,
        createdAt: now(),
        cutMap: source ? { ...source.cutMap } : {},
        lineCutMap: source?.lineCutMap ? { ...source.lineCutMap } : {},
        speechEdits: source?.speechEdits ? { ...source.speechEdits } : {},
        sceneOrder: source?.sceneOrder ? [...source.sceneOrder] : undefined,
        stageDirectionEdits: source?.stageDirectionEdits ? { ...source.stageDirectionEdits } : undefined,
        pauses: source?.pauses ? { ...source.pauses } : undefined,
        speechReassignments: source?.speechReassignments ? { ...source.speechReassignments } : undefined,
        characterAliases: source?.characterAliases ? { ...source.characterAliases } : undefined,
        characterLinks: source?.characterLinks
          ? source.characterLinks.map(([a, b]) => [a, b] as [string, string])
          : undefined,
        speechSplits: source?.speechSplits
          ? Object.fromEntries(Object.entries(source.speechSplits).map(([k, v]) => [k, { ...v }]))
          : undefined,
        insertions: source?.insertions
          ? Object.fromEntries(Object.entries(source.insertions).map(([k, v]) => [k, { ...v, lines: [...v.lines] }]))
          : undefined,
        stageDurations: source?.stageDurations ? { ...source.stageDurations } : undefined,
        partIndentOverrides: source?.partIndentOverrides ? { ...source.partIndentOverrides } : undefined,
      };
      const newProject = {
        ...p,
        cuts: [...p.cuts, newCut],
        activeCutId: newCut.id,
        updatedAt: now(),
      };
      return { project: newProject, activeCutId: newCut.id, undoStack: [], redoStack: [] };
    }

    case "RENAME_CUT": {
      const p = state.project!;
      return {
        ...state,
        project: {
          ...p,
          cuts: p.cuts.map((c) =>
            c.id === action.cutId ? { ...c, name: action.name } : c
          ),
          updatedAt: now(),
        },
      };
    }

    case "DELETE_CUT": {
      const p = state.project!;
      if (p.cuts.length <= 1) return state; // can't delete the last cut
      const remaining = p.cuts.filter((c) => c.id !== action.cutId);
      const newActiveCutId =
        state.activeCutId === action.cutId ? remaining[0].id : state.activeCutId;
      return {
        project: {
          ...p,
          cuts: remaining,
          activeCutId: newActiveCutId,
          updatedAt: now(),
        },
        activeCutId: newActiveCutId,
        undoStack: [],
        redoStack: [],
      };
    }

    case "ADD_ACTOR": {
      const p = state.project!;
      const usedColors = new Set(p.actors.map((a) => a.color));
      const color = defaultColors.find((c) => !usedColors.has(c)) || defaultColors[0];
      const newActor: Actor = {
        id: generateId(),
        name: action.name,
        color,
      };
      return {
        ...state,
        project: {
          ...p,
          actors: [...p.actors, newActor],
          updatedAt: now(),
        },
      };
    }

    case "UPDATE_ACTOR": {
      const p = state.project!;
      return {
        ...state,
        project: {
          ...p,
          actors: p.actors.map((a) =>
            a.id === action.actorId
              ? { ...a, name: action.name, color: action.color }
              : a
          ),
          updatedAt: now(),
        },
      };
    }

    case "DELETE_ACTOR": {
      const p = state.project!;
      return {
        ...state,
        project: {
          ...p,
          actors: p.actors.filter((a) => a.id !== action.actorId),
          assignments: p.assignments.filter((a) => a.actorId !== action.actorId),
          updatedAt: now(),
        },
      };
    }

    case "ASSIGN_CHARACTER": {
      const p = state.project!;
      const filtered = p.assignments.filter(
        (a) => a.characterId !== action.characterId
      );
      const newAssignments: ActorAssignment[] = action.actorId
        ? [...filtered, { characterId: action.characterId, actorId: action.actorId }]
        : filtered;
      return {
        ...state,
        project: { ...p, assignments: newAssignments, updatedAt: now() },
      };
    }

    case "SET_PAUSE":
      return withUndo(state, (c) => ({
        ...c,
        pauses: {
          ...(c.pauses ?? {}),
          [`after:${action.afterSceneId}`]: { name: action.name, minutes: action.minutes },
        },
      }));

    case "REMOVE_PAUSE": {
      const pauseKey = `after:${action.afterSceneId}`;
      const existing = state.project!.cuts.find((c) => c.id === state.activeCutId)?.pauses ?? {};
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { [pauseKey]: _removed, ...rest } = existing;
      return withUndo(state, (c) => ({ ...c, pauses: rest }));
    }

    case "UPDATE_SETTINGS": {
      const p = state.project!;
      return {
        ...state,
        project: {
          ...p,
          settings: { ...(p.settings ?? { wordsPerMinute: 135 }), ...action.settings },
          updatedAt: now(),
        },
      };
    }

    case "REASSIGN_SPEECH": {
      const existing = state.project!.cuts.find((c) => c.id === state.activeCutId)?.speechReassignments ?? {};
      if (action.characterId === null) {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { [action.unitId]: _removed, ...rest } = existing;
        return withUndo(state, (c) => ({ ...c, speechReassignments: rest }));
      }
      return withUndo(state, (c) => ({
        ...c,
        speechReassignments: { ...existing, [action.unitId]: action.characterId! },
      }));
    }

    case "SET_CHARACTER_ALIAS": {
      const existing = state.project!.cuts.find((c) => c.id === state.activeCutId)?.characterAliases ?? {};
      if (!action.alias) {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { [action.characterId]: _removed, ...rest } = existing;
        return withUndo(state, (c) => ({ ...c, characterAliases: rest }));
      }
      return withUndo(state, (c) => ({
        ...c,
        characterAliases: { ...existing, [action.characterId]: action.alias! },
      }));
    }

    case "TOGGLE_CHARACTER_LINK": {
      const existing = state.project!.cuts.find((c) => c.id === state.activeCutId)?.characterLinks ?? [];
      // Always store pairs in sorted order so we can do a simple equality check
      const [keyA, keyB] =
        action.charIdA < action.charIdB
          ? [action.charIdA, action.charIdB]
          : [action.charIdB, action.charIdA];
      const alreadyLinked = existing.some(([a, b]) => a === keyA && b === keyB);
      const newLinks: Array<[string, string]> = alreadyLinked
        ? existing.filter(([a, b]) => !(a === keyA && b === keyB))
        : [...existing, [keyA, keyB]];
      return withUndo(state, (c) => ({
        ...c,
        characterLinks: newLinks.length > 0 ? newLinks : undefined,
      }));
    }

    case "BULK_SET_CAST": {
      const p = state.project!;
      return {
        ...state,
        project: {
          ...p,
          actors: action.actors,
          assignments: action.assignments,
          updatedAt: now(),
        },
      };
    }

    case "SPLIT_SPEECH": {
      const part2Id = `${action.unitId}:s2`;
      return withUndo(state, (c) => ({
        ...c,
        speechSplits: {
          ...(c.speechSplits ?? {}),
          [action.unitId]: {
            splitAtLineIndex: action.splitAtLineIndex,
            ...(action.splitAtWordOffset !== undefined ? { splitAtWordOffset: action.splitAtWordOffset } : {}),
            ...(action.newCharacterId ? { newCharacterId: action.newCharacterId } : {}),
          },
        },
        cutMap: { ...c.cutMap, [part2Id]: "kept" },
      }));
    }

    case "MERGE_SPEECH": {
      const part2Id = `${action.unitId}:s2`;
      return withUndo(state, (c) => {
        const newSplits = { ...(c.speechSplits ?? {}) };
        delete newSplits[action.unitId];

        const newCutMap = { ...c.cutMap };
        delete newCutMap[part2Id];

        const newLineCutMap = { ...(c.lineCutMap ?? {}) };
        for (const lineId of action.part2LineIds) {
          delete newLineCutMap[lineId];
        }

        const newEdits = { ...(c.speechEdits ?? {}) };
        delete newEdits[part2Id];

        const newReassignments = { ...(c.speechReassignments ?? {}) };
        delete newReassignments[part2Id];

        return {
          ...c,
          speechSplits: Object.keys(newSplits).length > 0 ? newSplits : undefined,
          cutMap: newCutMap,
          lineCutMap: Object.keys(newLineCutMap).length > 0 ? newLineCutMap : undefined,
          speechEdits: Object.keys(newEdits).length > 0 ? newEdits : undefined,
          speechReassignments: Object.keys(newReassignments).length > 0 ? newReassignments : undefined,
        };
      });
    }

    case "ADD_INSERTION": {
      return withUndo(state, (c) => ({
        ...c,
        insertions: {
          ...(c.insertions ?? {}),
          [action.insertion.id]: action.insertion,
        },
        cutMap: { ...c.cutMap, [action.insertion.id]: "kept" },
      }));
    }

    case "REMOVE_INSERTION": {
      return withUndo(state, (c) => {
        const newInsertions = { ...(c.insertions ?? {}) };
        delete newInsertions[action.insertionId];

        const newCutMap = { ...c.cutMap };
        delete newCutMap[action.insertionId];

        const newLineCutMap = { ...(c.lineCutMap ?? {}) };
        for (const lineId of action.lineIds) {
          delete newLineCutMap[lineId];
        }

        return {
          ...c,
          insertions: Object.keys(newInsertions).length > 0 ? newInsertions : undefined,
          cutMap: newCutMap,
          lineCutMap: Object.keys(newLineCutMap).length > 0 ? newLineCutMap : undefined,
        };
      });
    }

    case "UPDATE_INSERTION": {
      return withUndo(state, (c) => {
        if (!c.insertions?.[action.insertionId]) return c;
        return {
          ...c,
          insertions: {
            ...c.insertions,
            [action.insertionId]: {
              ...c.insertions[action.insertionId],
              characterId: action.characterId,
              lines: action.lines,
            },
          },
        };
      });
    }

    case "SET_STAGE_DURATION": {
      return withUndo(state, (c) => ({
        ...c,
        stageDurations: { ...(c.stageDurations ?? {}), [action.stageId]: action.minutes },
      }));
    }

    case "CLEAR_STAGE_DURATION": {
      return withUndo(state, (c) => {
        const newDurations = { ...(c.stageDurations ?? {}) };
        delete newDurations[action.stageId];
        return {
          ...c,
          stageDurations: Object.keys(newDurations).length > 0 ? newDurations : undefined,
        };
      });
    }

    case "SET_PART_INDENT_OVERRIDE": {
      return withUndo(state, (c) => {
        if (action.value === null) {
          const ovr = { ...(c.partIndentOverrides ?? {}) };
          delete ovr[action.lineId];
          return { ...c, partIndentOverrides: Object.keys(ovr).length > 0 ? ovr : undefined };
        }
        return { ...c, partIndentOverrides: { ...(c.partIndentOverrides ?? {}), [action.lineId]: action.value } };
      });
    }

    default:
      return state;
  }
}

/**
 * Like `updateActiveCut`, but also snapshots the current active cut to
 * `undoStack` before applying the mutation, and clears `redoStack`.
 * Use this for all script-editing mutations so they can be undone.
 */
function withUndo(
  state: ProjectState,
  updater: (cut: Cut) => Cut
): ProjectState {
  const activeCut = state.project && state.activeCutId
    ? state.project.cuts.find((c) => c.id === state.activeCutId) ?? null
    : null;
  const stateWithSnapshot = activeCut
    ? {
        ...state,
        undoStack: [...state.undoStack, activeCut].slice(-MAX_HISTORY),
        redoStack: [],
      }
    : state;
  return updateActiveCut(stateWithSnapshot, updater);
}

function updateActiveCut(
  state: ProjectState,
  updater: (cut: Cut) => Cut
): ProjectState {
  const p = state.project!;
  return {
    ...state,
    project: {
      ...p,
      cuts: p.cuts.map((c) =>
        c.id === state.activeCutId ? updater(c) : c
      ),
      updatedAt: now(),
    },
  };
}

function now(): string {
  return new Date().toISOString();
}

// --- Context ---

interface ProjectContextValue {
  project: Project | null;
  activeCutId: string | null;
  activeCut: Cut | null;
  dispatch: React.Dispatch<ProjectAction>;
  createProject: (playId: string, playTitle: string, name?: string) => Project;
  loadProject: (project: Project) => void;
  unloadProject: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

const ProjectContext = createContext<ProjectContextValue | null>(null);

export function ProjectProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  // Persist to localStorage on every project change
  useEffect(() => {
    if (!state.project) return;
    try {
      localStorage.setItem(
        `${STORAGE_PREFIX}${state.project.id}`,
        JSON.stringify(state.project)
      );
    } catch {
      // localStorage might be full or unavailable — silently ignore
    }
  }, [state.project]);

  const createProject = useCallback((playId: string, playTitle: string, name?: string): Project => {
    const id = generateId();
    const firstCutId = generateId();
    const project: Project = {
      version: CURRENT_VERSION,
      id,
      playId,
      playTitle,
      ...(name && name !== playTitle ? { name } : {}),
      actors: [],
      assignments: [],
      cuts: [
        {
          id: firstCutId,
          name: "Draft 1",
          createdAt: now(),
          cutMap: {},
        },
      ],
      activeCutId: firstCutId,
      createdAt: now(),
      updatedAt: now(),
    };
    dispatch({ type: "LOAD", project });
    return project;
  }, []);

  const loadProject = useCallback((project: Project) => {
    dispatch({ type: "LOAD", project });
  }, []);

  const unloadProject = useCallback(() => {
    dispatch({ type: "UNLOAD" });
  }, []);

  const activeCut = state.project && state.activeCutId
    ? state.project.cuts.find((c) => c.id === state.activeCutId) ?? null
    : null;

  return (
    <ProjectContext.Provider
      value={{
        project: state.project,
        activeCutId: state.activeCutId,
        activeCut,
        dispatch,
        createProject,
        loadProject,
        unloadProject,
        canUndo: state.undoStack.length > 0,
        canRedo: state.redoStack.length > 0,
      }}
    >
      {children}
    </ProjectContext.Provider>
  );
}

export function useProject() {
  const ctx = useContext(ProjectContext);
  if (!ctx) throw new Error("useProject must be used within a ProjectProvider");
  return ctx;
}

export interface ProjectSummary {
  id: string;
  playId: string;
  playTitle: string;
  name?: string;
  updatedAt: string;
}

/** Load a full project from localStorage by ID */
export function loadProjectFromStorage(projectId: string): Project | null {
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${projectId}`);
    if (!raw) return null;
    return JSON.parse(raw) as Project;
  } catch {
    return null;
  }
}

/** List all project IDs stored in localStorage */
export function listStoredProjectIds(): string[] {
  try {
    return Object.keys(localStorage)
      .filter((k) => k.startsWith(STORAGE_PREFIX))
      .map((k) => k.slice(STORAGE_PREFIX.length));
  } catch {
    return [];
  }
}
