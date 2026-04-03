"use client";

import { useState } from "react";
import type { Character } from "@/types/play";
import type { InsertedSD } from "@/types/insertedsd";
import { generateId } from "@/lib/project/projectUtils";

interface Props {
  afterUnitId: string;
  castList: Character[];
  /** When set, pre-fills from this SD (edit mode) */
  existing?: InsertedSD;
  onConfirm: (sd: InsertedSD) => void;
  onClose: () => void;
}

const SD_TYPES: Array<{ value: InsertedSD["stageType"]; label: string }> = [
  { value: "business", label: "Business" },
  { value: "entrance", label: "Entrance" },
  { value: "exit", label: "Exit" },
  { value: "delivery", label: "Delivery" },
];

export default function InsertedSDModal({ afterUnitId, castList, existing, onConfirm, onClose }: Props) {
  const [text, setText] = useState(existing?.text ?? "");
  const [stageType, setStageType] = useState<InsertedSD["stageType"]>(existing?.stageType ?? "business");
  const [selectedChars, setSelectedChars] = useState<string[]>(existing?.characters ?? []);

  const showChars = stageType === "entrance" || stageType === "exit";

  function toggleChar(charId: string) {
    setSelectedChars((prev) =>
      prev.includes(charId) ? prev.filter((c) => c !== charId) : [...prev, charId]
    );
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    const sd: InsertedSD = {
      id: existing?.id ?? generateId(),
      afterUnitId: existing?.afterUnitId ?? afterUnitId,
      text: text.trim(),
      characters: showChars ? selectedChars : [],
      stageType,
    };
    onConfirm(sd);
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white dark:bg-stone-900 rounded-xl shadow-xl border border-stone-200 dark:border-stone-700 w-full max-w-md mx-4">
        <div className="flex items-center justify-between px-5 py-4 border-b border-stone-200 dark:border-stone-700">
          <h2 className="font-semibold text-stone-700 dark:text-stone-200 text-sm">
            {existing ? "Edit Stage Direction" : "Insert Stage Direction"}
          </h2>
          <button
            onClick={onClose}
            className="text-stone-400 hover:text-stone-600 dark:hover:text-stone-200 text-lg leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-5 py-4 space-y-4">
          {/* SD text */}
          <div>
            <label className="block text-xs font-medium text-stone-500 dark:text-stone-400 uppercase tracking-wider mb-1.5">
              Stage Direction Text
            </label>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={3}
              placeholder="They dance together."
              className="w-full text-sm italic font-serif border border-stone-300 dark:border-stone-600 rounded-lg px-3 py-2 bg-white dark:bg-stone-800 text-stone-500 dark:text-stone-400 placeholder-stone-300 dark:placeholder-stone-600 focus:outline-none focus:ring-2 focus:ring-amber-400 dark:focus:ring-amber-600 resize-y"
              autoFocus
              required
            />
          </div>

          {/* Type */}
          <div>
            <label className="block text-xs font-medium text-stone-500 dark:text-stone-400 uppercase tracking-wider mb-1.5">
              Type
            </label>
            <div className="flex gap-2 flex-wrap">
              {SD_TYPES.map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setStageType(value)}
                  className={`text-xs px-3 py-1 rounded border transition-colors ${
                    stageType === value
                      ? "bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-700"
                      : "bg-stone-50 text-stone-500 border-stone-200 hover:border-stone-300 dark:bg-stone-800 dark:text-stone-400 dark:border-stone-700"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Characters (only for entrance/exit) */}
          {showChars && castList.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-stone-500 dark:text-stone-400 uppercase tracking-wider mb-1.5">
                Characters
              </label>
              <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
                {castList.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => toggleChar(c.id)}
                    className={`text-xs px-2 py-0.5 rounded border transition-colors ${
                      selectedChars.includes(c.id)
                        ? "bg-stone-700 text-stone-100 border-stone-600 dark:bg-stone-200 dark:text-stone-900 dark:border-stone-300"
                        : "bg-stone-50 text-stone-500 border-stone-200 hover:border-stone-400 dark:bg-stone-800 dark:text-stone-400 dark:border-stone-700"
                    }`}
                  >
                    {c.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="text-sm px-4 py-2 rounded-lg border border-stone-300 dark:border-stone-600 text-stone-600 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!text.trim()}
              className="text-sm px-4 py-2 rounded-lg bg-green-600 hover:bg-green-700 dark:bg-green-700 dark:hover:bg-green-600 text-white font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {existing ? "Save" : "Insert"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
