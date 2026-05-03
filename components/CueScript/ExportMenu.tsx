"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import type { Play } from "@/types/play";
import type { Actor, ActorAssignment, Cut } from "@/types/project";
import { buildCueScript } from "@/lib/cuts/CueScriptBuilder";
import { resolveCharacterName } from "@/lib/project/projectUtils";
import { exportLineBuddy, lineBuddyFileName } from "@/lib/cuts/LineBuddyExporter";
import CueScriptDocument from "./CueScriptDocument";

interface Props {
  play: Play;
  cut: Cut;
  actors: Actor[];
  assignments: ActorAssignment[];
  projectName?: string;
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function ExportMenu({ play, cut, actors, assignments }: Props) {
  const [selectedActorId, setSelectedActorId] = useState<string>(actors[0]?.id || "");
  const [zipLoading, setZipLoading] = useState(false);
  const [lineBuddyLoading, setLineBuddyLoading] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);

  const selectedActor = actors.find((a) => a.id === selectedActorId) || null;

  const actorCharacterNames = assignments
    .filter((a) => a.actorId === selectedActorId)
    .map((a) => resolveCharacterName(a.characterId, cut.characterAliases, play.castList));

  const cueScript = useMemo(
    () => selectedActor ? buildCueScript(play, cut, selectedActor, assignments, cut.characterAliases) : null,
    [play, cut, selectedActor, assignments]
  );

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "f") {
        e.preventDefault();
        setSearchOpen((o) => !o);
      } else if (e.key === "Escape" && searchOpen) {
        setSearchOpen(false);
        setSearchQuery("");
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    if (searchOpen) {
      setTimeout(() => searchInputRef.current?.focus(), 0);
    } else {
      setSearchQuery("");
    }
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [searchOpen]);

  function handlePrint() {
    window.print();
  }

  function handleLineBuddySingle() {
    if (!selectedActor || !cueScript) return;
    const html = exportLineBuddy(cueScript, selectedActor);
    const blob = new Blob([html], { type: "text/html" });
    triggerDownload(blob, lineBuddyFileName(selectedActor.name));
  }

  async function handleZipDownload() {
    setExportError(null);
    setZipLoading(true);
    try {
      const res = await fetch("/api/export/cue-scripts-zip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ play, cut, actors, assignments }),
      });
      if (!res.ok) throw new Error(`Server error: ${res.status}`);
      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const match = disposition.match(/filename\*?=(?:UTF-8'')?["']?([^;"'\n]+)/i);
      const filename = match ? decodeURIComponent(match[1]) : "cue_scripts.zip";
      triggerDownload(blob, filename);
    } catch (e) {
      setExportError(e instanceof Error ? e.message : "Download failed");
    } finally {
      setZipLoading(false);
    }
  }

  async function handleLineBuddyDownload() {
    setExportError(null);
    setLineBuddyLoading(true);
    try {
      const res = await fetch("/api/export/line-buddy-zip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ play, cut, actors, assignments }),
      });
      if (!res.ok) throw new Error(`Server error: ${res.status}`);
      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const match = disposition.match(/filename\*?=(?:UTF-8'')?["']?([^;"'\n]+)/i);
      const filename = match ? decodeURIComponent(match[1]) : "line_buddy.zip";
      triggerDownload(blob, filename);
    } catch (e) {
      setExportError(e instanceof Error ? e.message : "Download failed");
    } finally {
      setLineBuddyLoading(false);
    }
  }

  if (actors.length === 0) {
    return (
      <div className="max-w-4xl mx-auto px-6 py-12 text-stone-400 text-sm">
        No actors assigned yet.{" "}
        <a href="" className="text-amber-600 underline">
          Go to Casting to add actors.
        </a>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      {/* Controls — hidden when printing */}
      <div className="no-print px-6 py-4 border-b border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900">
        {/* Single control row: actor selector + per-actor actions + search + batch */}
        <div className="flex items-center gap-2 flex-wrap">
          <label className="text-sm font-medium text-stone-700 dark:text-stone-200 shrink-0">
            Actor Cue Script
          </label>
          <select
            value={selectedActorId}
            onChange={(e) => setSelectedActorId(e.target.value)}
            className="border border-stone-300 dark:border-stone-600 rounded px-3 py-1.5 text-sm bg-white dark:bg-stone-800 text-stone-700 dark:text-stone-200 focus:outline-none focus:ring-2 focus:ring-amber-400"
          >
            {actors.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>

          {/* Per-actor: Print and Line Buddy */}
          <button
            onClick={handlePrint}
            className="no-print px-3 py-1.5 text-sm rounded border border-stone-300 dark:border-stone-600 bg-white dark:bg-stone-800 text-stone-700 dark:text-stone-200 hover:bg-stone-50 dark:hover:bg-stone-700"
          >
            Print / Save PDF
          </button>
          <button
            onClick={handleLineBuddySingle}
            disabled={!selectedActor}
            className="px-3 py-1.5 text-sm rounded border border-stone-300 dark:border-stone-600 bg-white dark:bg-stone-800 text-stone-700 dark:text-stone-200 hover:bg-stone-50 dark:hover:bg-stone-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Export Line Buddy
          </button>

          {/* Search toggle */}
          <button
            onClick={() => setSearchOpen((o) => !o)}
            title="Find in cue script (Cmd+F / Ctrl+F)"
            className={`p-1.5 rounded border transition-colors ${
              searchOpen
                ? "bg-amber-100 border-amber-300 text-amber-700 dark:bg-amber-900/40 dark:border-amber-800 dark:text-amber-400"
                : "border-stone-200 dark:border-stone-700 text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 hover:border-stone-300 dark:hover:border-stone-600"
            }`}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"/>
              <line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
          </button>

          {/* Batch downloads — separated visually */}
          <div className="flex items-center gap-2 ml-auto border-l border-stone-200 dark:border-stone-700 pl-3">
            <button
              onClick={handleZipDownload}
              disabled={zipLoading}
              className="px-3 py-1.5 text-xs rounded border border-stone-300 dark:border-stone-600 bg-white dark:bg-stone-800 text-stone-700 dark:text-stone-200 hover:bg-stone-50 dark:hover:bg-stone-700 disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
            >
              {zipLoading ? "Generating…" : "Download All as ZIP"}
            </button>
            <button
              onClick={handleLineBuddyDownload}
              disabled={lineBuddyLoading}
              className="px-3 py-1.5 text-xs rounded border border-stone-300 dark:border-stone-600 bg-white dark:bg-stone-800 text-stone-700 dark:text-stone-200 hover:bg-stone-50 dark:hover:bg-stone-700 disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
            >
              {lineBuddyLoading ? "Generating…" : "All Line Buddies (ZIP)"}
            </button>
          </div>
        </div>

        {/* Search bar — shown when open */}
        {searchOpen && (
          <div className="flex items-center gap-2 mt-3 pt-3 border-t border-stone-100 dark:border-stone-800">
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Find in cue script…"
              className="flex-1 border border-stone-300 dark:border-stone-600 rounded px-3 py-1.5 text-sm bg-white dark:bg-stone-800 text-stone-700 dark:text-stone-200 focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
            <button
              onClick={() => { setSearchOpen(false); setSearchQuery(""); }}
              className="text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 text-sm px-2 py-1.5"
            >
              ✕
            </button>
          </div>
        )}

        {/* Error display */}
        {exportError && (
          <p className="mt-2 text-xs text-red-600 dark:text-red-400">{exportError}</p>
        )}
      </div>

      {/* Cue script preview */}
      {cueScript ? (
        <CueScriptDocument cueScript={cueScript} characterNames={actorCharacterNames} searchQuery={searchQuery || undefined} />
      ) : (
        <div className="text-stone-400 dark:text-stone-400 text-sm p-6">Select an actor above.</div>
      )}
    </div>
  );
}
