"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";

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
  const [showLineNumbers, setShowLineNumbersState] = useState(() => {
    if (typeof window === "undefined") return true;
    return localStorage.getItem("showLineNumbers") !== "false";
  });

  const setShowLineNumbers = useCallback((v: boolean) => {
    localStorage.setItem("showLineNumbers", String(v));
    setShowLineNumbersState(v);
  }, []);

  const value = useMemo(
    () => ({ viewMode: forceValue ?? viewMode, setViewMode, showLineNumbers, setShowLineNumbers }),
    [forceValue, viewMode, showLineNumbers, setViewMode, setShowLineNumbers]
  );

  return (
    <ViewModeContext.Provider value={value}>
      {children}
    </ViewModeContext.Provider>
  );
}

export function useViewMode() {
  return useContext(ViewModeContext);
}
