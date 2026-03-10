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

export default function ExportMenu({ play, cut, actors, assignments }: Props) {
  const [selectedActorId, setSelectedActorId] = useState<string>(actors[0]?.id || "");

  const selectedActor = actors.find((a) => a.id === selectedActorId) || null;

  // Resolve the character names assigned to this actor for the PDF header
  const actorCharacterNames = assignments
    .filter((a) => a.actorId === selectedActorId)
    .map((a) => resolveCharacterName(a.characterId, cut.characterAliases, play.castList));

  const cueScript = selectedActor
    ? buildCueScript(play, cut, selectedActor, assignments, cut.characterAliases)
    : null;

  function handlePrint() {
    window.print();
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
      <div className="no-print px-6 py-4 border-b border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 flex items-center gap-4">
        <label className="text-sm font-medium text-stone-700 dark:text-stone-200 shrink-0">Actor Cue Script</label>
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

      {/* Cue script preview */}
      {cueScript ? (
        <CueScriptDocument cueScript={cueScript} characterNames={actorCharacterNames} />
      ) : (
        <div className="text-stone-400 dark:text-stone-400 text-sm p-6">Select an actor above.</div>
      )}
    </div>
  );
}
