"use client";

import { useState } from "react";
import type { Character } from "@/types/play";
import type { Insertion, InsertedLine } from "@/types/insertion";
import { generateId } from "@/lib/project/projectUtils";

interface Props {
  /** The unit after which this insertion will be placed */
  afterUnitId: string;
  castList: Character[];
  characterAliases?: Record<string, string>;
  onInsert: (insertion: Insertion) => void;
  onCancel: () => void;
}

export default function InsertionModal({
  afterUnitId,
  castList,
  onInsert,
  onCancel,
}: Props) {
  const [characterId, setCharacterId] = useState(castList[0]?.id ?? "");
  const [text, setText] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const rawLines = text.split("\n").filter((l) => l.trim().length > 0);
    if (rawLines.length === 0 || !characterId) return;

    const insertionId = generateId();
    const lines: InsertedLine[] = rawLines.map((lineText, idx) => ({
      id: `ins_${insertionId}_${idx}`,
      text: lineText.trim(),
    }));

    onInsert({
      id: insertionId,
      afterUnitId,
      characterId,
      lines,
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div className="bg-white dark:bg-stone-900 rounded-xl shadow-xl border border-stone-200 dark:border-stone-700 w-full max-w-md mx-4">
        <div className="flex items-center justify-between px-5 py-4 border-b border-stone-200 dark:border-stone-700">
          <h2 className="font-semibold text-stone-700 dark:text-stone-200 text-sm">Insert Text</h2>
          <button
            onClick={onCancel}
            className="text-stone-400 hover:text-stone-600 dark:hover:text-stone-200 text-lg leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-5 py-4 space-y-4">
          {/* Character selector */}
          <div>
            <label className="block text-xs font-medium text-stone-500 dark:text-stone-400 uppercase tracking-wider mb-1.5">
              Character
            </label>
            <select
              value={characterId}
              onChange={(e) => setCharacterId(e.target.value)}
              className="w-full text-sm border border-stone-300 dark:border-stone-600 rounded-lg px-3 py-2 bg-white dark:bg-stone-800 text-stone-700 dark:text-stone-200 focus:outline-none focus:ring-2 focus:ring-amber-400 dark:focus:ring-amber-600"
              required
            >
              {castList.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          {/* Text area — one line per line of verse/prose */}
          <div>
            <label className="block text-xs font-medium text-stone-500 dark:text-stone-400 uppercase tracking-wider mb-1.5">
              Lines <span className="normal-case font-normal">(one line per line of verse/prose)</span>
            </label>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={5}
              placeholder={"To be, or not to be—\nthat is the question."}
              className="w-full text-sm font-serif border border-stone-300 dark:border-stone-600 rounded-lg px-3 py-2 bg-white dark:bg-stone-800 text-stone-700 dark:text-stone-100 placeholder-stone-300 dark:placeholder-stone-600 focus:outline-none focus:ring-2 focus:ring-amber-400 dark:focus:ring-amber-600 resize-y"
              autoFocus
              required
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onCancel}
              className="text-sm px-4 py-2 rounded-lg border border-stone-300 dark:border-stone-600 text-stone-600 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!text.trim() || !characterId}
              className="text-sm px-4 py-2 rounded-lg bg-green-600 hover:bg-green-700 dark:bg-green-700 dark:hover:bg-green-600 text-white font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Insert
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
