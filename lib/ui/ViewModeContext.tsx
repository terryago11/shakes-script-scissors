"use client";

import { createContext, useContext, useState } from "react";

export type ViewMode = "standard" | "clean" | "diff";

const ViewModeContext = createContext<{
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  showLineNumbers: boolean;
  setShowLineNumbers: (v: boolean) => void;
}>({ viewMode: "standard", setViewMode: () => {}, showLineNumbers: true, setShowLineNumbers: () => {} });

export function ViewModeProvider({
  children,
  forceValue,
}: {
  children: React.ReactNode;
  /** When set, this value is used instead of internal state — useful for nested diff columns */
  forceValue?: ViewMode;
}) {
  const [viewMode, setViewMode] = useState<ViewMode>("standard");
  const [showLineNumbers, setShowLineNumbers] = useState(true);
  return (
    <ViewModeContext.Provider value={{ viewMode: forceValue ?? viewMode, setViewMode, showLineNumbers, setShowLineNumbers }}>
      {children}
    </ViewModeContext.Provider>
  );
}

export function useViewMode() {
  return useContext(ViewModeContext);
}
