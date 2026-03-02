"use client";

import { createContext, useContext, useState } from "react";

export type ViewMode = "standard" | "clean" | "diff";

const ViewModeContext = createContext<{
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
}>({ viewMode: "standard", setViewMode: () => {} });

export function ViewModeProvider({
  children,
  forceValue,
}: {
  children: React.ReactNode;
  /** When set, this value is used instead of internal state — useful for nested diff columns */
  forceValue?: ViewMode;
}) {
  const [viewMode, setViewMode] = useState<ViewMode>("standard");
  return (
    <ViewModeContext.Provider value={{ viewMode: forceValue ?? viewMode, setViewMode }}>
      {children}
    </ViewModeContext.Provider>
  );
}

export function useViewMode() {
  return useContext(ViewModeContext);
}
