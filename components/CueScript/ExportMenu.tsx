"use client";

import { useState } from "react";
import type { Play } from "@/types/play";
import type { Actor, ActorAssignment, Cut } from "@/types/project";
import { buildCueScript } from "@/lib/cuts/CueScriptBuilder";
import { resolveCharacterName } from "@/lib/project/projectUtils";
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

  const selectedActor = actors.find((a) => a.id === selectedActorId) || null;

  const actorCharacterNames = assignments
    .filter((a) => a.actorId === selectedActorId)
    .map((a) => resolveCharacterName(a.characterId, cut.characterAliases, play.castList));

  const cueScript = selectedActor
    ? buildCueScript(play, cut, selectedActor, assignments, cut.characterAliases)
    : null;

  function handlePrint() {
    window.print();
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
        {/* Row 1: actor selector + print */}
        <div className="flex items-center gap-4">
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
          <button
            onClick={handlePrint}
            className="ml-auto px-4 py-2 bg-stone-700 text-white text-sm rounded-lg hover:bg-stone-800 shrink-0"
          >
            Print / Save PDF
          </button>
        </div>

        {/* Row 2: batch download button */}
        <div className="flex items-center gap-3 mt-3 pt-3 border-t border-stone-100 dark:border-stone-800">
          <span className="text-xs text-stone-400 dark:text-stone-500 shrink-0">All actors:</span>
          <button
            onClick={handleZipDownload}
            disabled={zipLoading}
            className="px-3 py-1.5 text-xs rounded border border-stone-300 dark:border-stone-600 bg-white dark:bg-stone-800 text-stone-700 dark:text-stone-200 hover:bg-stone-50 dark:hover:bg-stone-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {zipLoading ? "Generating…" : "Download All as ZIP"}
          </button>
          <button
            onClick={handleLineBuddyDownload}
            disabled={lineBuddyLoading}
            className="px-3 py-1.5 text-xs rounded border border-stone-300 dark:border-stone-600 bg-white dark:bg-stone-800 text-stone-700 dark:text-stone-200 hover:bg-stone-50 dark:hover:bg-stone-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {lineBuddyLoading ? "Generating…" : "Line Buddy (HTML)"}
          </button>
          <span className="text-xs text-stone-400 dark:text-stone-500 ml-auto">
            Export full script as Word: open ⚙ Settings
          </span>
        </div>

        {/* Error display */}
        {exportError && (
          <p className="mt-2 text-xs text-red-600 dark:text-red-400">{exportError}</p>
        )}
      </div>

      {/* Cue script preview */}
      {cueScript ? (
        <CueScriptDocument cueScript={cueScript} characterNames={actorCharacterNames} />
      ) : (
        <div className="text-stone-400 dark:text-stone-400 text-sm p-6">Select an actor above.</div>
      )}
    </div>
  );
}
