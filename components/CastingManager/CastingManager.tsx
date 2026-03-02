"use client";

import { useEffect, useState } from "react";
import type { Play, StageDirection } from "@/types/play";
import { useProject } from "@/lib/project/ProjectStore";
import { computeQuickChanges } from "@/lib/cuts/QuickChangeEngine";
import { characterIdToName } from "@/lib/folger/TeiParser";
import CharacterCard from "./CharacterCard";

interface Props {
  playId: string;
}

/** Returns the effective character list for an SD, applying any overrides. */
function getEffectiveChars(sd: StageDirection, edits?: Record<string, string[]>): string[] {
  return edits?.[sd.id] ?? sd.characters;
}

/**
 * Per-scene on-stage walk using entrance/exit SDs (mirrors StageTimeEngine logic).
 * Returns Map<characterId, Set<characterId>> of characters that were EVER simultaneously
 * on stage at the same moment (not just the same scene).
 */
function computeSimultaneousMap(
  play: Play,
  cutMap: Record<string, "cut" | "kept">,
  edits?: Record<string, string[]>
): Map<string, Set<string>> {
  const simMap = new Map<string, Set<string>>();

  function recordPairs(onStage: Set<string>) {
    const list = Array.from(onStage);
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i];
        const b = list[j];
        if (!simMap.has(a)) simMap.set(a, new Set());
        if (!simMap.has(b)) simMap.set(b, new Set());
        simMap.get(a)!.add(b);
        simMap.get(b)!.add(a);
      }
    }
  }

  for (const act of play.acts) {
    for (const scene of act.scenes) {
      // On-stage set — populated ONLY by entrance/exit SDs (no speech fallback)
      const onStage = new Set<string>();

      // Walk units — after each entrance, snapshot simultaneous pairs
      for (const unit of scene.units) {
        if (unit.type === "stage") {
          if (unit.stageType === "entrance") {
            for (const charId of getEffectiveChars(unit, edits)) {
              onStage.add(charId);
            }
            recordPairs(onStage);
          } else if (unit.stageType === "exit") {
            for (const charId of getEffectiveChars(unit, edits)) {
              onStage.delete(charId);
            }
          }
        }
      }
    }
  }

  return simMap;
}

export default function CastingManager({ playId }: Props) {
  const { project, activeCut, dispatch } = useProject();
  const [play, setPlay] = useState<Play | null>(null);
  const [newActorName, setNewActorName] = useState("");
  const threshold = project?.settings?.quickChangeThresholdMinutes ?? 2.0;

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

  // Build simultaneous map (chars that are ever on stage at the same moment in the cut)
  const simultaneousMap = computeSimultaneousMap(
    play,
    activeCut?.cutMap ?? {},
    activeCut?.stageDirectionEdits
  );

  // Quick-change warnings
  const quickChangeResult = activeCut
    ? computeQuickChanges(play, activeCut, project.assignments, project.settings)
    : null;

  // For each character: count how many of its simultaneous partners share its assigned actor
  const conflictsPerChar = new Map<string, number>();
  for (const [charId, simSet] of simultaneousMap) {
    const myActor = charToActor[charId];
    if (!myActor) continue;
    let count = 0;
    for (const otherCharId of simSet) {
      if (charToActor[otherCharId] === myActor) count++;
    }
    if (count > 0) conflictsPerChar.set(charId, count);
  }

  // For each character: the set of actor IDs that would cause a doubling conflict
  // (already assigned to a character simultaneously on stage with this one)
  function getConflictingActorIds(charId: string): Set<string> {
    const simSet = simultaneousMap.get(charId) ?? new Set<string>();
    const conflicting = new Set<string>();
    for (const otherCharId of simSet) {
      const actorId = charToActor[otherCharId];
      if (actorId) conflicting.add(actorId);
    }
    return conflicting;
  }

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
                <label
                  className="w-3 h-3 rounded-full cursor-pointer shrink-0 hover:ring-2 hover:ring-offset-1 hover:ring-stone-400 transition-shadow"
                  style={{ backgroundColor: actor.color }}
                  title="Click to change color"
                >
                  <input
                    type="color"
                    value={actor.color}
                    onChange={(e) =>
                      dispatch({ type: "UPDATE_ACTOR", actorId: actor.id, name: actor.name, color: e.target.value })
                    }
                    className="sr-only"
                  />
                </label>
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

      {/* Quick-change warnings */}
      {quickChangeResult && (
        <div className="mb-8">
          <div className="flex items-center gap-4 mb-3">
            <h2 className="text-sm font-semibold text-stone-500 uppercase tracking-wider">
              Quick-change Warnings
            </h2>
            <div className="flex items-center gap-1.5 text-xs text-stone-400 ml-auto">
              <span>Flag gaps under</span>
              <input
                type="number"
                min={0.5}
                max={30}
                step={0.5}
                value={threshold}
                onChange={(e) =>
                  dispatch({
                    type: "UPDATE_SETTINGS",
                    settings: { quickChangeThresholdMinutes: Number(e.target.value) },
                  })
                }
                className="w-14 border border-stone-200 rounded px-1.5 py-0.5 text-stone-600 focus:outline-none focus:ring-1 focus:ring-amber-400 text-center"
              />
              <span>min</span>
            </div>
          </div>

          {quickChangeResult.warnings.length === 0 ? (
            <p className="text-sm text-stone-400">
              No quick changes detected below {threshold} min.
            </p>
          ) : (
            <div className="space-y-2">
              {quickChangeResult.warnings.map((w, i) => {
                const actor = project.actors.find((a) => a.id === w.actorId);
                const exitChar = play.castList.find((c) => c.id === w.exitCharacterId);
                const enterChar = play.castList.find((c) => c.id === w.enterCharacterId);
                const exitName = exitChar?.name ?? characterIdToName(w.exitCharacterId);
                const enterName = enterChar?.name ?? characterIdToName(w.enterCharacterId);
                const mins = Math.floor(w.gapMinutes);
                const secs = Math.round((w.gapMinutes - mins) * 60);
                const gapLabel = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
                return (
                  <div
                    key={i}
                    className="flex items-center gap-3 px-4 py-2.5 rounded border border-amber-200 bg-amber-50 text-sm"
                  >
                    <span className="text-amber-500 shrink-0">⚡</span>
                    <div className="flex items-center gap-1.5 min-w-0">
                      {actor && (
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: actor.color }}
                        />
                      )}
                      <span className="font-medium text-stone-700 shrink-0">
                        {actor?.name ?? w.actorId}
                      </span>
                    </div>
                    <span className="text-stone-500 truncate min-w-0">
                      {exitName} → {enterName}
                    </span>
                    <span className="ml-auto shrink-0 font-medium text-amber-700 tabular-nums">
                      {gapLabel} gap
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

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
            conflictCount={conflictsPerChar.get(char.id) ?? 0}
            conflictingActorIds={getConflictingActorIds(char.id)}
          />
        ))}
      </div>
    </div>
  );
}
