"use client";

import { useState } from "react";
import type { Play } from "@/types/play";
import type { Actor, ActorAssignment, Cut } from "@/types/project";
import { buildCueScript } from "@/lib/cuts/CueScriptBuilder";
import { exportScriptHtml } from "@/lib/project/projectIO";
import CueScriptDocument from "./CueScriptDocument";

interface Props {
  play: Play;
  cut: Cut;
  actors: Actor[];
  assignments: ActorAssignment[];
  projectName?: string;
}

export default function ExportMenu({ play, cut, actors, assignments, projectName }: Props) {
  const [selectedActorId, setSelectedActorId] = useState<string>(actors[0]?.id || "");

  const selectedActor = actors.find((a) => a.id === selectedActorId) || null;

  const cueScript = selectedActor
    ? buildCueScript(play, cut, selectedActor, assignments, cut.characterAliases)
    : null;

  function handlePrint() {
    window.print();
  }

  return (
    <div className="max-w-4xl mx-auto">
      {/* Controls (hidden when printing) */}
      <div className="no-print">
        {/* Full Script HTML Export */}
        <div className="px-6 py-4 border-b border-stone-200 bg-stone-50 flex items-center gap-4">
          <div className="flex-1">
            <div className="text-sm font-medium text-stone-700">Full Script</div>
            <div className="text-xs text-stone-400 mt-0.5">
              Self-contained HTML file — open in any browser, no server required
            </div>
          </div>
          <button
            onClick={() => exportScriptHtml(play, cut, projectName)}
            className="px-4 py-2 bg-amber-500 text-white text-sm rounded-lg hover:bg-amber-600 shrink-0"
          >
            Export as HTML
          </button>
        </div>

        {/* Actor Cue Script section */}
        {actors.length === 0 ? (
          <div className="px-6 py-4 border-b border-stone-200 text-stone-400 text-sm">
            No actors assigned yet.{" "}
            <a href="" className="text-amber-600 underline">
              Go to Casting to add actors.
            </a>
          </div>
        ) : (
          <div className="px-6 py-4 border-b border-stone-200 bg-white flex items-center gap-4">
            <div className="text-sm font-medium text-stone-700 shrink-0">Actor Cue Script</div>
            <select
              value={selectedActorId}
              onChange={(e) => setSelectedActorId(e.target.value)}
              className="border border-stone-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
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
        )}
      </div>

      {/* Cue script preview */}
      {cueScript ? (
        <CueScriptDocument cueScript={cueScript} />
      ) : actors.length > 0 ? (
        <div className="text-stone-400 text-sm p-6">Select an actor above.</div>
      ) : null}
    </div>
  );
}
