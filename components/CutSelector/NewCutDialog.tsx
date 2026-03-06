"use client";

import { useState } from "react";
import { useProject } from "@/lib/project/ProjectStore";

interface Props {
  onClose: () => void;
}

export default function NewCutDialog({ onClose }: Props) {
  const { project, activeCutId, dispatch } = useProject();
  const [name, setName] = useState("New Cut");
  const [cloneFrom, setCloneFrom] = useState<string>("blank");

  if (!project) return null;

  function handleCreate() {
    const trimmed = name.trim();
    if (!trimmed) return;
    dispatch({
      type: "ADD_CUT",
      name: trimmed,
      cloneFromId: cloneFrom === "blank" ? undefined : cloneFrom,
    });
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="bg-white dark:bg-stone-900 rounded-xl shadow-xl p-6 w-full max-w-sm">
        <h2 className="text-lg font-semibold text-stone-800 dark:text-stone-100 mb-4">New Cut</h2>

        <label className="block text-sm text-stone-600 dark:text-stone-400 mb-1">Name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full border border-stone-300 dark:border-stone-600 rounded px-3 py-2 text-sm mb-4 bg-white dark:bg-stone-800 text-stone-800 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-amber-400"
          autoFocus
          onKeyDown={(e) => e.key === "Enter" && handleCreate()}
        />

        <label className="block text-sm text-stone-600 dark:text-stone-400 mb-1">Start from</label>
        <select
          value={cloneFrom}
          onChange={(e) => setCloneFrom(e.target.value)}
          className="w-full border border-stone-300 dark:border-stone-600 rounded px-3 py-2 text-sm mb-6 bg-white dark:bg-stone-800 text-stone-800 dark:text-stone-100 focus:outline-none"
        >
          <option value="blank">Blank (no cuts)</option>
          {project.cuts.map((c) => (
            <option key={c.id} value={c.id}>
              Clone from: {c.name} {c.id === activeCutId ? "(current)" : ""}
            </option>
          ))}
        </select>

        <div className="flex gap-3 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-stone-600 dark:text-stone-400 hover:text-stone-800 dark:hover:text-stone-200"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={!name.trim()}
            className="px-4 py-2 text-sm bg-amber-500 text-white rounded-lg hover:bg-amber-600 disabled:opacity-50"
          >
            Create
          </button>
        </div>
      </div>
    </div>
  );
}
