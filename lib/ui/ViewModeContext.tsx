"use client";

import { createContext, useContext, useState } from "react";

export type ViewMode = "standard" | "clean" | "diff";

const ViewModeContext = createContext<{
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
}>({ viewMode: "standard", setViewMode: () => {} });

export function ViewModeProvider({ children }: { children: React.ReactNode }) {
  const [viewMode, setViewMode] = useState<ViewMode>("standard");
  return (
    <ViewModeContext.Provider value={{ viewMode, setViewMode }}>
      {children}
    </ViewModeContext.Provider>
  );
}

export function useViewMode() {
  return useContext(ViewModeContext);
}
