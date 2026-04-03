"use client";

import { createContext, useContext, useState } from "react";

export type EditTool = "none" | "cut" | "insert" | "restore" | "edit-sds" | "reassign" | "split" | "song-dance";

interface EditModeContextValue {
  activeTool: EditTool;
  setActiveTool: (tool: EditTool) => void;
}

const EditModeContext = createContext<EditModeContextValue>({
  activeTool: "none",
  setActiveTool: () => {},
});

export function EditModeProvider({ children }: { children: React.ReactNode }) {
  const [activeTool, setActiveTool] = useState<EditTool>("none");
  return (
    <EditModeContext.Provider value={{ activeTool, setActiveTool }}>
      {children}
    </EditModeContext.Provider>
  );
}

export function useEditMode() {
  return useContext(EditModeContext);
}
