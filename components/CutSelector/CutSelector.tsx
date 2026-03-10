"use client";

import { useState } from "react";
import { useProject } from "@/lib/project/ProjectStore";
import NewCutDialog from "./NewCutDialog";

export default function CutSelector() {
  const { project, activeCutId, dispatch } = useProject();
  const [showNew, setShowNew] = useState(false);

  if (!project) return null;

  return (
    <div className="flex items-center gap-2">
      <label className="text-xs text-stone-400 dark:text-stone-400 font-medium">Cut:</label>
      <select
        value={activeCutId || ""}
        onChange={(e) => dispatch({ type: "SET_ACTIVE_CUT", cutId: e.target.value })}
        className="text-sm border border-stone-300 dark:border-stone-600 rounded px-2 py-1 bg-white dark:bg-stone-800 text-stone-700 dark:text-stone-200 max-w-[180px] truncate focus:outline-none focus:ring-2 focus:ring-amber-400"
      >
        {project.cuts.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      <button
        onClick={() => setShowNew(true)}
        className="text-xs px-2 py-1 rounded border border-stone-300 dark:border-stone-600 text-stone-500 dark:text-stone-400 hover:bg-stone-50 dark:hover:bg-stone-800"
        title="New cut"
      >
        +
      </button>
      {showNew && <NewCutDialog onClose={() => setShowNew(false)} />}
    </div>
  );
}
