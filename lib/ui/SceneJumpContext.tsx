"use client";

import { createContext, useContext, useState, useCallback, useRef } from "react";

export interface SceneOption {
  id: string;
  label: string; // e.g. "1:1"
}

interface SceneJumpContextValue {
  scenes: SceneOption[];
  setScenes: (scenes: SceneOption[]) => void;
  activeSceneId: string;
  setActiveSceneId: (id: string) => void;
  jumpToScene: (sceneId: string) => void;
  /** True while a programmatic scroll is in progress — suppress observer updates */
  jumpingRef: React.RefObject<boolean>;
  /** Currently focused scene (show only this scene) */
  focusedSceneId: string | null;
  setFocusedSceneId: (id: string | null) => void;
}

const SceneJumpContext = createContext<SceneJumpContextValue>({
  scenes: [],
  setScenes: () => {},
  activeSceneId: "",
  setActiveSceneId: () => {},
  jumpToScene: () => {},
  jumpingRef: { current: false },
  focusedSceneId: null,
  setFocusedSceneId: () => {},
});

export function SceneJumpProvider({ children }: { children: React.ReactNode }) {
  const [scenes, setScenes] = useState<SceneOption[]>([]);
  const [activeSceneId, setActiveSceneId] = useState("");
  const [focusedSceneId, setFocusedSceneId] = useState<string | null>(null);
  const jumpingRef = useRef<boolean>(false);
  const jumpTimeout = useRef<ReturnType<typeof setTimeout>>(undefined);

  const jumpToScene = useCallback((sceneId: string) => {
    jumpingRef.current = true;
    clearTimeout(jumpTimeout.current);
    jumpTimeout.current = setTimeout(() => { jumpingRef.current = false; }, 900);
    const el = document.getElementById(`scene-${sceneId}`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  return (
    <SceneJumpContext.Provider value={{
      scenes, setScenes,
      activeSceneId, setActiveSceneId,
      jumpToScene,
      jumpingRef,
      focusedSceneId, setFocusedSceneId,
    }}>
      {children}
    </SceneJumpContext.Provider>
  );
}

export function useSceneJump() {
  return useContext(SceneJumpContext);
}
