"use client";

import { createContext, useContext, useState } from "react";

interface CutModeContextValue {
  cutModeActive: boolean;
  setCutModeActive: (active: boolean) => void;
}

const CutModeContext = createContext<CutModeContextValue>({
  cutModeActive: false,
  setCutModeActive: () => {},
});

export function CutModeProvider({ children }: { children: React.ReactNode }) {
  const [cutModeActive, setCutModeActive] = useState(false);
  return (
    <CutModeContext.Provider value={{ cutModeActive, setCutModeActive }}>
      {children}
    </CutModeContext.Provider>
  );
}

export function useCutMode() {
  return useContext(CutModeContext);
}
