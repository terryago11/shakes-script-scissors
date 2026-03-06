"use client";

import { useState, useEffect, useRef } from "react";
import type { Project } from "@/types/project";

interface Props {
  project: Project;
  onSave: (updates: {
    name?: string;
    wordsPerMinute?: number;
    quickChangeThresholdMinutes?: number;
  }) => void;
  onClose: () => void;
}

export default function SettingsModal({ project, onSave, onClose }: Props) {
  const [name, setName] = useState(project.name ?? "");
  const [wpm, setWpm] = useState(String(project.settings?.wordsPerMinute ?? 135));
  const [threshold, setThreshold] = useState(
    String(project.settings?.quickChangeThresholdMinutes ?? 2.0)
  );
  const [wpmError, setWpmError] = useState("");
  const [thresholdError, setThresholdError] = useState("");
  const overlayRef = useRef<HTMLDivElement>(null);

  // Close on Escape
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  function validate(): boolean {
    let ok = true;
    const wpmNum = Number(wpm);
    if (!wpm || isNaN(wpmNum) || wpmNum < 50 || wpmNum > 500) {
      setWpmError("Enter a number between 50 and 500");
      ok = false;
    } else {
      setWpmError("");
    }
    const tNum = Number(threshold);
    if (!threshold || isNaN(tNum) || tNum < 0 || tNum > 30) {
      setThresholdError("Enter a number between 0 and 30");
      ok = false;
    } else {
      setThresholdError("");
    }
    return ok;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    onSave({
      name: name.trim() || undefined,
      wordsPerMinute: Number(wpm),
      quickChangeThresholdMinutes: Number(threshold),
    });
    onClose();
  }

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 bg-black/30 flex items-center justify-center z-50"
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
    >
      <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-sm mx-4">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-stone-800 font-semibold text-base">Project Settings</h2>
          <button
            onClick={onClose}
            className="text-stone-400 hover:text-stone-600 text-lg leading-none"
            aria-label="Close settings"
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Project name */}
          <div>
            <label className="block text-xs font-medium text-stone-500 uppercase tracking-wider mb-1.5">
              Project name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={project.playTitle}
              className="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
            <p className="mt-1 text-xs text-stone-400">
              Play: {project.playTitle}
            </p>
          </div>

          {/* WPM */}
          <div>
            <label className="block text-xs font-medium text-stone-500 uppercase tracking-wider mb-1.5">
              Words per minute
            </label>
            <input
              type="number"
              value={wpm}
              onChange={(e) => setWpm(e.target.value)}
              min={50}
              max={500}
              className="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
            {wpmError ? (
              <p className="mt-1 text-xs text-red-500">{wpmError}</p>
            ) : (
              <p className="mt-1 text-xs text-stone-400">
                Used to estimate running time. Typical spoken delivery: 120–150 wpm.
              </p>
            )}
          </div>

          {/* Quick-change threshold */}
          <div>
            <label className="block text-xs font-medium text-stone-500 uppercase tracking-wider mb-1.5">
              Quick-change threshold (minutes)
            </label>
            <input
              type="number"
              value={threshold}
              onChange={(e) => setThreshold(e.target.value)}
              min={0}
              max={30}
              step={0.5}
              className="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
            {thresholdError ? (
              <p className="mt-1 text-xs text-red-500">{thresholdError}</p>
            ) : (
              <p className="mt-1 text-xs text-stone-400">
                Costume changes shorter than this are flagged as warnings in Casting.
              </p>
            )}
          </div>

          <div className="flex gap-2 justify-end pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-stone-500 hover:text-stone-700 hover:bg-stone-100 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-sm font-medium bg-amber-500 text-white hover:bg-amber-600 rounded-lg transition-colors"
            >
              Save
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
