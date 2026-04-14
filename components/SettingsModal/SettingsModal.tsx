"use client";

import { useState, useEffect, useRef } from "react";
import type { Project } from "@/types/project";
import { useProject } from "@/lib/project/ProjectStore";
import { useTheme } from "@/lib/ui/ThemeContext";
import NewCutDialog from "@/components/CutSelector/NewCutDialog";

function SunIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="4"/>
      <line x1="12" y1="2" x2="12" y2="5"/>
      <line x1="12" y1="19" x2="12" y2="22"/>
      <line x1="4.22" y1="4.22" x2="6.34" y2="6.34"/>
      <line x1="17.66" y1="17.66" x2="19.78" y2="19.78"/>
      <line x1="2" y1="12" x2="5" y2="12"/>
      <line x1="19" y1="12" x2="22" y2="12"/>
      <line x1="4.22" y1="19.78" x2="6.34" y2="17.66"/>
      <line x1="17.66" y1="6.34" x2="19.78" y2="4.22"/>
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
    </svg>
  );
}

function MonitorIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="20" height="14" rx="2"/>
      <line x1="8" y1="21" x2="16" y2="21"/>
      <line x1="12" y1="17" x2="12" y2="21"/>
    </svg>
  );
}

function QuillIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M12 2 C 10 2, 4 6, 2 12 L 4 10 C 5 7, 8 5, 12 2Z" fill="currentColor" opacity="0.8"/>
      <path d="M2 12 L5 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="6" y1="10" x2="3" y2="13" stroke="currentColor" strokeWidth="1"/>
    </svg>
  );
}

const themeOptions = [
  { value: "light" as const, Icon: SunIcon, title: "Light" },
  { value: "dark" as const, Icon: MoonIcon, title: "Dark" },
  { value: "auto" as const, Icon: MonitorIcon, title: "Auto" },
  { value: "1602" as const, Icon: QuillIcon, title: "1602" },
] as const;

interface Props {
  project: Project;
  onSave: (updates: {
    name?: string;
    wordsPerMinute?: number;
    quickChangeThresholdMinutes?: number;
    rehearsalMinBlockMinutes?: number;
    rehearsalMaxBlockMinutes?: number;
    minActorStageTimeMinutes?: number;
  }) => void;
  onClose: () => void;
  onExportJson: () => void;
  onExportHtml: () => void;
  exportingHtml: boolean;
  onExportDocx: (viewMode: "clean" | "standard") => void;
  exportingDocx: boolean;
}

export default function SettingsModal({
  project,
  onSave,
  onClose,
  onExportJson,
  onExportHtml,
  exportingHtml,
  onExportDocx,
  exportingDocx,
}: Props) {
  const { activeCutId, dispatch } = useProject();
  const { theme, setTheme } = useTheme();
  const [showNewCut, setShowNewCut] = useState(false);
  const [docxPanelOpen, setDocxPanelOpen] = useState(false);
  const [docxViewMode, setDocxViewMode] = useState<"clean" | "standard">("clean");

  const [name, setName] = useState(project.name ?? "");
  const [wpm, setWpm] = useState(String(project.settings?.wordsPerMinute ?? 135));
  const [threshold, setThreshold] = useState(
    String(project.settings?.quickChangeThresholdMinutes ?? 2.0)
  );
  const [minBlock, setMinBlock] = useState(String(project.settings?.rehearsalMinBlockMinutes ?? 5));
  const [maxBlock, setMaxBlock] = useState(String(project.settings?.rehearsalMaxBlockMinutes ?? 60));
  const [minActorTime, setMinActorTime] = useState(String(project.settings?.minActorStageTimeMinutes ?? 10));
  const [wpmError, setWpmError] = useState("");
  const [thresholdError, setThresholdError] = useState("");
  const overlayRef = useRef<HTMLDivElement>(null);

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
      rehearsalMinBlockMinutes: Number(minBlock) || 5,
      rehearsalMaxBlockMinutes: Number(maxBlock) || 60,
      minActorStageTimeMinutes: Number(minActorTime) || 10,
    });
    onClose();
  }

  const sectionLabel = "block text-xs font-semibold text-stone-400 dark:text-stone-400 uppercase tracking-wider mb-2";

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 bg-black/30 flex items-center justify-center z-50"
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
    >
      <div className="bg-white dark:bg-stone-900 rounded-xl shadow-xl w-full max-w-sm mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-stone-100 dark:border-stone-800">
          <h2 className="text-stone-800 dark:text-stone-100 font-semibold text-base">Settings</h2>
          <button
            onClick={onClose}
            className="text-stone-400 dark:text-stone-400 hover:text-stone-600 dark:hover:text-stone-200 text-lg leading-none"
            aria-label="Close settings"
          >
            ×
          </button>
        </div>

        <div className="px-6 py-4 space-y-5 max-h-[80vh] overflow-y-auto">

          {/* Draft */}
          <div>
            <label className={sectionLabel}>Draft</label>
            <div className="flex items-center gap-2">
              <select
                value={activeCutId || ""}
                onChange={(e) => dispatch({ type: "SET_ACTIVE_CUT", cutId: e.target.value })}
                className="flex-1 text-sm border border-stone-300 dark:border-stone-600 rounded px-2 py-1.5 bg-white dark:bg-stone-800 text-stone-700 dark:text-stone-200 focus:outline-none focus:ring-2 focus:ring-amber-400"
              >
                {project.cuts.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <button
                onClick={() => setShowNewCut(true)}
                className="text-xs px-2.5 py-1.5 rounded border border-stone-300 dark:border-stone-600 text-stone-500 dark:text-stone-400 hover:bg-stone-50 dark:hover:bg-stone-800 transition-colors"
                title="New draft"
              >
                + New
              </button>
            </div>
          </div>

          {/* Theme */}
          <div>
            <label className={sectionLabel}>Theme</label>
            <div className="flex items-center gap-1">
              {themeOptions.map(({ value, Icon, title }) => (
                <button
                  key={value}
                  onClick={() => setTheme(value)}
                  title={title}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded border text-sm transition-colors ${
                    theme === value
                      ? "bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-900/50 dark:text-amber-300 dark:border-amber-700"
                      : "text-stone-500 border-stone-200 hover:bg-stone-50 dark:text-stone-400 dark:border-stone-700 dark:hover:bg-stone-800"
                  }`}
                >
                  <Icon />
                  <span>{title}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Save & Export */}
          <div>
            <label className={sectionLabel}>Save & Export</label>
            <div className="flex gap-2">
              <button
                onClick={() => { onExportJson(); onClose(); }}
                className="flex-1 text-sm px-3 py-2 rounded border border-stone-300 dark:border-stone-600 text-stone-600 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-800 transition-colors text-left flex items-center gap-2"
              >
                <span className="text-stone-400">↓</span>
                Save as JSON
              </button>
              <button
                onClick={() => { onExportHtml(); onClose(); }}
                disabled={!activeCutId || exportingHtml}
                className="flex-1 text-sm px-3 py-2 rounded border border-stone-300 dark:border-stone-600 text-stone-600 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-800 transition-colors text-left flex items-center gap-2 disabled:opacity-40"
              >
                <span className="text-stone-400">⊞</span>
                {exportingHtml ? "Exporting…" : "Export as HTML"}
              </button>
              <button
                onClick={() => setDocxPanelOpen((v) => !v)}
                disabled={!activeCutId || exportingDocx}
                className="flex-1 text-sm px-3 py-2 rounded border border-stone-300 dark:border-stone-600 text-stone-600 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-800 transition-colors text-left flex items-center gap-2 disabled:opacity-40"
              >
                <span className="text-stone-400">⊟</span>
                {exportingDocx ? "Exporting…" : "Export as Word"}
              </button>
            </div>

            {/* DOCX warning + mode selector */}
            {docxPanelOpen && (
              <div className="mt-2 p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg text-xs space-y-2">
                <p className="text-amber-800 dark:text-amber-300 font-medium">⚠ One-way export</p>
                <p className="text-amber-700 dark:text-amber-400">
                  This .docx cannot be re-imported into Shakespeare Script Scissors. Formatting may differ from the script view.
                </p>
                <div className="flex items-center gap-3">
                  <span className="text-stone-500 dark:text-stone-400 font-medium">View mode:</span>
                  <label className="flex items-center gap-1 cursor-pointer text-stone-600 dark:text-stone-300">
                    <input
                      type="radio"
                      name="docxViewMode"
                      value="clean"
                      checked={docxViewMode === "clean"}
                      onChange={() => setDocxViewMode("clean")}
                      className="accent-amber-500"
                    />
                    Clean
                  </label>
                  <label className="flex items-center gap-1 cursor-pointer text-stone-600 dark:text-stone-300">
                    <input
                      type="radio"
                      name="docxViewMode"
                      value="standard"
                      checked={docxViewMode === "standard"}
                      onChange={() => setDocxViewMode("standard")}
                      className="accent-amber-500"
                    />
                    Standard
                  </label>
                </div>
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => {
                      onExportDocx(docxViewMode);
                      setDocxPanelOpen(false);
                      onClose();
                    }}
                    disabled={exportingDocx}
                    className="flex-1 text-xs px-3 py-1.5 rounded bg-amber-600 hover:bg-amber-700 text-white font-medium transition-colors disabled:opacity-50"
                  >
                    Download Anyway
                  </button>
                  <button
                    onClick={() => setDocxPanelOpen(false)}
                    className="flex-1 text-xs px-3 py-1.5 rounded border border-stone-300 dark:border-stone-600 text-stone-600 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-800 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="border-t border-stone-100 dark:border-stone-800" />

          {/* Project settings */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className={sectionLabel}>Project name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={project.playTitle}
                className="w-full px-3 py-2 border border-stone-300 dark:border-stone-600 rounded-lg text-sm bg-white dark:bg-stone-800 text-stone-800 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-amber-400"
              />
              <p className="mt-1 text-xs text-stone-400">Play: {project.playTitle}</p>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className={sectionLabel}>Words per minute</label>
                <span className="text-sm font-semibold text-stone-700 dark:text-stone-200 tabular-nums">{wpm} wpm</span>
              </div>
              <input
                type="range"
                min={80}
                max={220}
                step={5}
                value={Number(wpm) || 135}
                onChange={(e) => setWpm(e.target.value)}
                className="w-full accent-amber-500 mb-2"
              />
              <div className="flex gap-1 flex-wrap">
                {([
                  { v: 100, label: "Slow" },
                  { v: 130, label: "Amateur" },
                  { v: 135, label: "Default" },
                  { v: 150, label: "Experienced" },
                  { v: 180, label: "Professional" },
                ] as const).map(({ v, label }) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setWpm(String(v))}
                    className={`text-xs px-2 py-1 rounded border transition-colors ${
                      Number(wpm) === v
                        ? "bg-amber-100 border-amber-300 text-amber-700 dark:bg-amber-900/50 dark:border-amber-700 dark:text-amber-300"
                        : "border-stone-200 dark:border-stone-700 text-stone-500 dark:text-stone-400 hover:bg-stone-50 dark:hover:bg-stone-800"
                    }`}
                  >
                    {label} <span className="opacity-60">{v}</span>
                  </button>
                ))}
              </div>
              {wpmError && <p className="mt-1 text-xs text-red-500">{wpmError}</p>}
            </div>

            <div>
              <label className={sectionLabel}>Quick-change threshold (minutes)</label>
              <input
                type="number"
                value={threshold}
                onChange={(e) => setThreshold(e.target.value)}
                min={0}
                max={30}
                step={0.5}
                className="w-full px-3 py-2 border border-stone-300 dark:border-stone-600 rounded-lg text-sm bg-white dark:bg-stone-800 text-stone-800 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-amber-400"
              />
              {thresholdError ? (
                <p className="mt-1 text-xs text-red-500">{thresholdError}</p>
              ) : (
                <p className="mt-1 text-xs text-stone-400">Changes shorter than this are flagged in Casting.</p>
              )}
            </div>

            <div>
              <label className={sectionLabel}>Rehearsal block duration (minutes)</label>
              <div className="flex items-center gap-2">
                <div className="flex-1">
                  <label className="text-xs text-stone-400 mb-1 block">Min</label>
                  <input
                    type="number"
                    value={minBlock}
                    onChange={(e) => setMinBlock(e.target.value)}
                    min={1}
                    max={30}
                    step={1}
                    className="w-full px-3 py-2 border border-stone-300 dark:border-stone-600 rounded-lg text-sm bg-white dark:bg-stone-800 text-stone-800 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-amber-400"
                  />
                </div>
                <div className="flex-1">
                  <label className="text-xs text-stone-400 mb-1 block">Max</label>
                  <input
                    type="number"
                    value={maxBlock}
                    onChange={(e) => setMaxBlock(e.target.value)}
                    min={10}
                    max={180}
                    step={5}
                    className="w-full px-3 py-2 border border-stone-300 dark:border-stone-600 rounded-lg text-sm bg-white dark:bg-stone-800 text-stone-800 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-amber-400"
                  />
                </div>
              </div>
              <p className="mt-1 text-xs text-stone-400">Filters suggested rehearsal blocks in the Dashboard.</p>
            </div>

            <div>
              <label className={sectionLabel}>Min actor stage time (minutes)</label>
              <input
                type="number"
                value={minActorTime}
                onChange={(e) => setMinActorTime(e.target.value)}
                min={0}
                max={60}
                step={1}
                className="w-full px-3 py-2 border border-stone-300 dark:border-stone-600 rounded-lg text-sm bg-white dark:bg-stone-800 text-stone-800 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-amber-400"
              />
              <p className="mt-1 text-xs text-stone-400">Actors with less stage time than this are flagged in Casting.</p>
            </div>

            <div className="flex gap-2 justify-end pt-1">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm text-stone-500 dark:text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 rounded-lg transition-colors"
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

          <div className="border-t border-stone-100 dark:border-stone-800 pt-4 mt-2">
            <label className={sectionLabel}>About & Copyright</label>
            <div className="text-xs text-stone-400 dark:text-stone-500 space-y-1.5 leading-relaxed">
              <p>
                Shakespeare texts (37 plays) from{" "}
                <a href="https://dracor.org/shake" target="_blank" rel="noopener noreferrer" className="underline">DraCor</a>.{" "}
                <em>The Two Noble Kinsmen</em> from{" "}
                <a href="https://www.folger.edu/explore/shakespeares-works/" target="_blank" rel="noopener noreferrer" className="underline">Folger Digital Texts</a>.
                Folger Shakespeare editions ed. Mowat, Werstine, Poston &amp; Niles.
                Licensed{" "}
                <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noopener noreferrer" className="underline">CC BY-SA 4.0</a>{" "}
                (DraCor) and{" "}
                <a href="https://creativecommons.org/licenses/by-nc/3.0/" target="_blank" rel="noopener noreferrer" className="underline">CC BY-NC 3.0</a>{" "}
                (Folger Digital Texts).
              </p>
              <p>
                ShakesScriptScissors © Natan Skop.
                Licensed{" "}
                <a href="https://creativecommons.org/licenses/by-nc-sa/4.0/" target="_blank" rel="noopener noreferrer" className="underline">CC BY-NC-SA 4.0</a>.
                Non-commercial use only. Share-alike required.
                {process.env.NEXT_PUBLIC_COMMIT_DATE ? ` · v5.18 · updated ${process.env.NEXT_PUBLIC_COMMIT_DATE}` : " · v5.18"}
              </p>
            </div>
          </div>
        </div>
      </div>

      {showNewCut && <NewCutDialog onClose={() => setShowNewCut(false)} />}
    </div>
  );
}
