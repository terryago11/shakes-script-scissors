"use client";

import { createContext, useContext, useState, useCallback } from "react";

export interface SceneOption {
  id: string;
  label: string; // e.g. "Act 1 · Scene 1"
}

interface SceneJumpContextValue {
  scenes: SceneOption[];
  setScenes: (scenes: SceneOption[]) => void;
  activeSceneId: string;
  setActiveSceneId: (id: string) => void;
  jumpToScene: (sceneId: string) => void;
}

const SceneJumpContext = createContext<SceneJumpContextValue>({
  scenes: [],
  setScenes: () => {},
  activeSceneId: "",
  setActiveSceneId: () => {},
  jumpToScene: () => {},
});

export function SceneJumpProvider({ children }: { children: React.ReactNode }) {
  const [scenes, setScenes] = useState<SceneOption[]>([]);
  const [activeSceneId, setActiveSceneId] = useState("");

  const jumpToScene = useCallback((sceneId: string) => {
    const el = document.getElementById(`scene-${sceneId}`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  return (
    <SceneJumpContext.Provider value={{ scenes, setScenes, activeSceneId, setActiveSceneId, jumpToScene }}>
      {children}
    </SceneJumpContext.Provider>
  );
}

export function useSceneJump() {
  return useContext(SceneJumpContext);
}
