"use client";

import { createContext, useContext, useRef, useState } from "react";

interface EditNavContextValue {
  /** Ordered list of unitIds for the current active tool's edits. */
  editIndex: string[];
  /** 0-based index of the currently highlighted edit. */
  editIndexIdx: number;
  /** Generation counter — increments only on explicit navigate calls (not on index reset). Used by ScriptEditor to trigger scroll. */
  editNavGeneration: number;
  /** Replace the full index (resets idx to 0, does NOT increment generation). */
  setEditIndex: (ids: string[]) => void;
  /** Move to the next (+1) or previous (−1) edit. Wraps. Increments generation to trigger scroll. */
  navigateEdit: (dir: 1 | -1) => void;
}

const EditNavContext = createContext<EditNavContextValue>({
  editIndex: [],
  editIndexIdx: 0,
  editNavGeneration: 0,
  setEditIndex: () => {},
  navigateEdit: () => {},
});

export function EditNavProvider({ children }: { children: React.ReactNode }) {
  const [editIndex, setEditIndexState] = useState<string[]>([]);
  const [editIndexIdx, setEditIndexIdx] = useState(0);
  const [editNavGeneration, setEditNavGeneration] = useState(0);
  const editIndexRef = useRef<string[]>([]);

  function setEditIndex(ids: string[]) {
    editIndexRef.current = ids;
    setEditIndexState(ids);
    setEditIndexIdx(0);
    // Do NOT increment generation — this is an index reset, not user navigation.
  }

  function navigateEdit(dir: 1 | -1) {
    const len = editIndexRef.current.length;
    if (len === 0) return;
    setEditIndexIdx((prev) => (prev + dir + len) % len);
    setEditNavGeneration((g) => g + 1);
  }

  return (
    <EditNavContext.Provider value={{ editIndex, editIndexIdx, editNavGeneration, setEditIndex, navigateEdit }}>
      {children}
    </EditNavContext.Provider>
  );
}

export function useEditNav() {
  return useContext(EditNavContext);
}
