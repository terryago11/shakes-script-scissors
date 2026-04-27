"use client";

import { createContext, useContext, useState } from "react";
import type { CastOption } from "@/types/project";

interface AuditionModeContextValue {
  on: boolean;
  setOn: (v: boolean) => void;
  draft: CastOption | null;
  setDraft: (d: CastOption | null) => void;
  dirty: boolean;
  setDirty: (v: boolean) => void;
  /** Non-null when an exit-confirmation is pending. Empty string = just exit; non-empty = exit + navigate to href. */
  pendingExitHref: string | null;
  setPendingExitHref: (href: string | null) => void;
}

const AuditionModeContext = createContext<AuditionModeContextValue>({
  on: false,
  setOn: () => {},
  draft: null,
  setDraft: () => {},
  dirty: false,
  setDirty: () => {},
  pendingExitHref: null,
  setPendingExitHref: () => {},
});

export function AuditionModeProvider({ children }: { children: React.ReactNode }) {
  const [on, setOn] = useState(false);
  const [draft, setDraft] = useState<CastOption | null>(null);
  const [dirty, setDirty] = useState(false);
  const [pendingExitHref, setPendingExitHref] = useState<string | null>(null);
  return (
    <AuditionModeContext.Provider value={{ on, setOn, draft, setDraft, dirty, setDirty, pendingExitHref, setPendingExitHref }}>
      {children}
    </AuditionModeContext.Provider>
  );
}

export function useAuditionMode() {
  return useContext(AuditionModeContext);
}
