"use client";

import React, { createContext, useContext, useReducer, useEffect, useCallback, useRef, useState } from "react";
import type { Project, Actor, ActorAssignment, Cut } from "@/types/project";
import { generateId, defaultColors } from "./projectUtils";

const CURRENT_VERSION = 1;

// --- State and actions ---

interface ProjectState {
  project: Project | null;
  activeCutId: string | null;
}

type ProjectAction =
  | { type: "LOAD"; project: Project }
  | { type: "UNLOAD" }
  | { type: "SET_ACTIVE_CUT"; cutId: string }
  | { type: "TOGGLE_UNIT"; unitId: string }
  | { type: "SET_UNIT_STATUS"; unitId: string; status: "cut" | "kept" }
  | { type: "ADD_CUT"; name: string; cloneFromId?: string }
  | { type: "RENAME_CUT"; cutId: string; name: string }
  | { type: "DELETE_CUT"; cutId: string }
  | { type: "ADD_ACTOR"; name: string }
  | { type: "UPDATE_ACTOR"; actorId: string; name: string; color: string }
  | { type: "DELETE_ACTOR"; actorId: string }
  | { type: "ASSIGN_CHARACTER"; characterId: string; actorId: string | null }
  | { type: "REPLACE_PROJECT"; project: Project };

function reducer(state: ProjectState, action: ProjectAction): ProjectState {
  if (!state.project && action.type !== "LOAD" && action.type !== "REPLACE_PROJECT") {
    return state;
  }

  switch (action.type) {
    case "LOAD":
    case "REPLACE_PROJECT": {
      const activeCutId = action.project.activeCutId ||
        action.project.cuts[0]?.id || null;
      return { project: action.project, activeCutId };
    }

    case "UNLOAD":
      return { project: null, activeCutId: null };

    case "SET_ACTIVE_CUT":
      return {
        ...state,
        activeCutId: action.cutId,
        project: state.project
          ? { ...state.project, activeCutId: action.cutId, updatedAt: now() }
          : null,
      };

    case "TOGGLE_UNIT": {
      const p = state.project!;
      const cut = p.cuts.find((c) => c.id === state.activeCutId);
      if (!cut) return state;
      const current = cut.cutMap[action.unitId];
      const newStatus = current === "cut" ? "kept" : "cut";
      return updateActiveCut(state, (c) => ({
        ...c,
        cutMap: { ...c.cutMap, [action.unitId]: newStatus },
      }));
    }

    case "SET_UNIT_STATUS":
      return updateActiveCut(state, (c) => ({
        ...c,
        cutMap: { ...c.cutMap, [action.unitId]: action.status },
      }));

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
      };
      const newProject = {
        ...p,
        cuts: [...p.cuts, newCut],
        activeCutId: newCut.id,
        updatedAt: now(),
      };
      return { project: newProject, activeCutId: newCut.id };
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

    default:
      return state;
  }
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
  saveError: string | null;
  createProject: (playId: string, playTitle: string) => Promise<Project>;
  loadProject: (project: Project) => void;
  unloadProject: () => void;
}

const ProjectContext = createContext<ProjectContextValue | null>(null);

export function ProjectProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, { project: null, activeCutId: null });
  const [saveError, setSaveError] = useState<string | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced save — 800ms after last mutation
  useEffect(() => {
    if (!state.project) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    const snapshot = state.project;
    saveTimerRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/projects/${snapshot.id}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            "X-Expected-Updated-At": snapshot.updatedAt,
          },
          body: JSON.stringify(snapshot),
        });
        if (res.status === 409) {
          setSaveError("conflict");
        } else if (!res.ok) {
          setSaveError(`Save failed (${res.status})`);
        } else {
          setSaveError(null);
        }
      } catch {
        setSaveError("Network error — changes not saved");
      }
    }, 800);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [state.project]);

  const createProject = useCallback(async (playId: string, playTitle: string): Promise<Project> => {
    const id = generateId();
    const firstCutId = generateId();
    const project: Project = {
      version: CURRENT_VERSION,
      id,
      playId,
      playTitle,
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
    // Immediate POST — new record must exist in DB before navigation
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(project),
      });
      if (!res.ok) setSaveError("Failed to create project on server");
    } catch {
      setSaveError("Network error — project not saved to server");
    }
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
        saveError,
        createProject,
        loadProject,
        unloadProject,
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
  updatedAt: string;
}

/** Load a full project from the API by ID */
export async function loadProjectFromApi(projectId: string): Promise<Project | null> {
  try {
    const res = await fetch(`/api/projects/${projectId}`);
    if (!res.ok) return null;
    return (await res.json()) as Project;
  } catch {
    return null;
  }
}

/** List all project summaries from the API */
export async function listProjectsFromApi(): Promise<ProjectSummary[]> {
  try {
    const res = await fetch("/api/projects");
    if (!res.ok) return [];
    return (await res.json()) as ProjectSummary[];
  } catch {
    return [];
  }
}
