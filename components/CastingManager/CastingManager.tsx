"use client";

import { useEffect, useState } from "react";
import type { Play } from "@/types/play";
import { useProject } from "@/lib/project/ProjectStore";
import CharacterCard from "./CharacterCard";

interface Props {
  playId: string;
}

export default function CastingManager({ playId }: Props) {
  const { project, dispatch } = useProject();
  const [play, setPlay] = useState<Play | null>(null);
  const [newActorName, setNewActorName] = useState("");

  useEffect(() => {
    fetch(`/api/play/${playId}`)
      .then((r) => r.json())
      .then(setPlay);
  }, [playId]);

  if (!project || !play) {
    return <div className="text-stone-400 text-sm p-6">Loading…</div>;
  }

  function handleAddActor() {
    const name = newActorName.trim();
    if (!name) return;
    dispatch({ type: "ADD_ACTOR", name });
    setNewActorName("");
  }

  // Build character → actor lookup
  const charToActor: Record<string, string> = {};
  for (const a of project.assignments) {
    charToActor[a.characterId] = a.actorId;
  }

  // Only show characters that have at least one line
  const speakingCharIds = new Set<string>();
  for (const act of play.acts) {
    for (const scene of act.scenes) {
      for (const unit of scene.units) {
        if (unit.type === "speech") speakingCharIds.add(unit.characterId);
      }
    }
  }
  const speakingChars = play.castList.filter((c) => speakingCharIds.has(c.id));

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      <h1 className="text-2xl font-bold text-stone-800 mb-2">Casting</h1>
      <p className="text-stone-500 text-sm mb-8">
        Assign actors to characters. One actor can play multiple characters (double-casting).
      </p>

      {/* Actor management */}
      <div className="mb-8">
        <h2 className="text-sm font-semibold text-stone-500 uppercase tracking-wider mb-3">
          Actors
        </h2>
        <div className="flex gap-2 mb-3">
          <input
            type="text"
            placeholder="Actor name…"
            value={newActorName}
            onChange={(e) => setNewActorName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAddActor()}
            className="flex-1 border border-stone-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
          />
          <button
            onClick={handleAddActor}
            disabled={!newActorName.trim()}
            className="px-4 py-2 text-sm bg-amber-500 text-white rounded-lg hover:bg-amber-600 disabled:opacity-50"
          >
            Add Actor
          </button>
        </div>

        {project.actors.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {project.actors.map((actor) => (
              <div
                key={actor.id}
                className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-stone-200 bg-white text-sm"
              >
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: actor.color }}
                />
                <span className="text-stone-700">{actor.name}</span>
                <button
                  onClick={() => dispatch({ type: "DELETE_ACTOR", actorId: actor.id })}
                  className="text-stone-300 hover:text-red-400 ml-1 text-xs"
                  title="Remove actor"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Character assignments */}
      <h2 className="text-sm font-semibold text-stone-500 uppercase tracking-wider mb-3">
        Characters
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {speakingChars.map((char) => (
          <CharacterCard
            key={char.id}
            character={char}
            assignedActorId={charToActor[char.id] || null}
            actors={project.actors}
            onAssign={(actorId) =>
              dispatch({ type: "ASSIGN_CHARACTER", characterId: char.id, actorId })
            }
          />
        ))}
      </div>
    </div>
  );
}
