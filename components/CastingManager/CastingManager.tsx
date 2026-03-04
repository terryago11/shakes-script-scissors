"use client";

import { useEffect, useState } from "react";
import type { Play, StageDirection } from "@/types/play";
import { useProject } from "@/lib/project/ProjectStore";
import { computeQuickChanges } from "@/lib/cuts/QuickChangeEngine";
import { computeCuts } from "@/lib/cuts/CutEngine";
import { computeStageTime } from "@/lib/cuts/StageTimeEngine";
import { characterIdToName } from "@/lib/folger/TeiParser";
import { suggestMinimumCast, buildForbiddenPairs } from "@/lib/cuts/CastingUtils";
import { defaultColors, generateId } from "@/lib/project/projectUtils";
import type { Actor, ActorAssignment } from "@/types/project";
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
  const [editingActorId, setEditingActorId] = useState<string | null>(null);
  const [editingActorName, setEditingActorName] = useState("");
  const [confirmDeleteActorId, setConfirmDeleteActorId] = useState<string | null>(null);
  // Suggest minimum cast
  type SuggestedGroup = { actorIndex: number; charIds: string[] };
  const [suggestedGroups, setSuggestedGroups] = useState<SuggestedGroup[] | null>(null);
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

  function handleSuggest() {
    if (!activeCut) return;

    const activeChars = speakingChars.filter((c) => !fullyCutCharIds.has(c.id));
    const activeCharIds = activeChars.map((c) => c.id);

    // Resolve display name for a character (alias → castList → TEI fallback)
    function displayName(id: string): string {
      return (
        activeCut?.characterAliases?.[id] ??
        speakingChars.find((c) => c.id === id)?.name ??
        characterIdToName(id)
      );
    }

    // ── sameActorPairs: characters that share the same display name ────────
    // These are either genuine TEI duplicates (e.g., two IDs both named
    // "First Player") or play-within-a-play roles tied to a frame character.
    // Characters with identical names and no simultaneous constraint must
    // always be played by the same actor.
    const nameGroups = new Map<string, string[]>();
    for (const c of activeChars) {
      const n = displayName(c.id);
      if (!nameGroups.has(n)) nameGroups.set(n, []);
      nameGroups.get(n)!.push(c.id);
    }
    const sameActorPairs: Array<[string, string]> = [];
    for (const group of nameGroups.values()) {
      if (group.length < 2) continue;
      // Only merge if they are NOT simultaneously on stage (which would be a
      // data error, but guard against it anyway).
      for (let i = 1; i < group.length; i++) {
        const simSet = simultaneousMap.get(group[0]) ?? new Set();
        if (!simSet.has(group[i])) {
          sameActorPairs.push([group[0], group[i]]);
        }
      }
    }

    // ── forbiddenPairs: quick-change conflicts between characters ──────────
    const forbiddenPairs = buildForbiddenPairs(play!, activeCut, project?.settings);

    // ── lineCounts: afterCut lines per character ───────────────────────────
    const lineCountsForSuggest: Record<string, number> = {};
    for (const c of activeChars) {
      lineCountsForSuggest[c.id] = lineCounts?.byCharacter[c.id]?.afterCut ?? 0;
    }

    const result = suggestMinimumCast(activeCharIds, simultaneousMap, {
      lineCounts: lineCountsForSuggest,
      forbiddenPairs,
      sameActorPairs,
    });

    const groups = new Map<number, string[]>();
    for (const { charId, actorIndex } of result) {
      if (!groups.has(actorIndex)) groups.set(actorIndex, []);
      groups.get(actorIndex)!.push(charId);
    }
    setSuggestedGroups(
      Array.from(groups.entries())
        .sort(([a], [b]) => a - b)
        .map(([actorIndex, charIds]) => ({ actorIndex, charIds }))
    );
  }

  function handleApplySuggestion() {
    if (!suggestedGroups) return;
    const newActors: Actor[] = suggestedGroups.map((g, i) => ({
      id: generateId(),
      name: `Actor ${g.actorIndex + 1}`,
      color: defaultColors[i % defaultColors.length],
    }));
    const newAssignments: ActorAssignment[] = [];
    for (let i = 0; i < suggestedGroups.length; i++) {
      const actorId = newActors[i].id;
      for (const charId of suggestedGroups[i].charIds) {
        newAssignments.push({ characterId: charId, actorId });
      }
    }
    dispatch({ type: "BULK_SET_CAST", actors: newActors, assignments: newAssignments });
    setSuggestedGroups(null);
  }

  // Build character → actor lookup
  const charToActor: Record<string, string> = {};
  for (const a of project.assignments) {
    charToActor[a.characterId] = a.actorId;
  }

  // Only show characters that have at least one line
  const speakingCharIds = new Set<string>();
  const allSpeeches: Array<{ id: string; characterId: string }> = [];
  // Collect entrance/exit SDs per character (using effective character list)
  const sdsByChar = new Map<string, Array<{ id: string }>>();
  for (const act of play.acts) {
    for (const scene of act.scenes) {
      for (const unit of scene.units) {
        if (unit.type === "speech") {
          speakingCharIds.add(unit.characterId);
          allSpeeches.push({ id: unit.id, characterId: unit.characterId });
        } else if (unit.type === "stage" && (unit.stageType === "entrance" || unit.stageType === "exit")) {
          for (const charId of getEffectiveChars(unit, activeCut?.stageDirectionEdits)) {
            if (!sdsByChar.has(charId)) sdsByChar.set(charId, []);
            sdsByChar.get(charId)!.push({ id: unit.id });
          }
        }
      }
    }
  }
  const speakingChars = play.castList.filter((c) => speakingCharIds.has(c.id));

  // Fully-cut: all speeches AND all entrance/exit SDs for the character must be cut
  const fullyCutCharIds = new Set<string>(
    [...speakingCharIds].filter((charId) => {
      const speeches = allSpeeches.filter((s) => s.characterId === charId);
      const sds = sdsByChar.get(charId) ?? [];
      const allSpeechesCut = speeches.length > 0 && speeches.every((s) => activeCut?.cutMap[s.id] === "cut");
      const allSdsCut = sds.every((sd) => activeCut?.cutMap[sd.id] === "cut");
      return allSpeechesCut && allSdsCut;
    })
  );

  // Compute line/word/time counts for each character in this cut
  const { lineCounts } = activeCut
    ? computeCuts(play, activeCut, project.assignments, project.actors)
    : { lineCounts: { byCharacter: {}, words: { byCharacter: {} } } as never };
  const stageTime = activeCut ? computeStageTime(play, activeCut, project.settings) : null;

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
          <button
            onClick={handleSuggest}
            className="px-4 py-2 text-sm border border-stone-300 text-stone-600 rounded-lg hover:bg-stone-50 transition-colors"
            title="Suggest the minimum number of actors needed (greedy doubling algorithm)"
          >
            Suggest
          </button>
        </div>

        {/* Minimum cast suggestion preview */}
        {suggestedGroups && (
          <div className="mb-4 rounded-lg border border-stone-200 bg-stone-50 px-4 py-3">
            <div className="flex items-center gap-3 mb-2">
              <span className="text-sm font-medium text-stone-700">
                Suggested minimum: {suggestedGroups.length} actor{suggestedGroups.length !== 1 ? "s" : ""}
              </span>
              <div className="ml-auto flex gap-2">
                <button
                  onClick={handleApplySuggestion}
                  className="text-xs px-3 py-1.5 bg-amber-500 text-white rounded-lg hover:bg-amber-600"
                >
                  Apply
                </button>
                <button
                  onClick={() => setSuggestedGroups(null)}
                  className="text-xs px-3 py-1.5 border border-stone-300 text-stone-600 rounded-lg hover:bg-white"
                >
                  Dismiss
                </button>
              </div>
            </div>
            <div className="space-y-1">
              {suggestedGroups.map((g) => (
                <div key={g.actorIndex} className="flex items-start gap-2 text-xs">
                  <span
                    className="w-3 h-3 rounded-full mt-0.5 shrink-0"
                    style={{ backgroundColor: defaultColors[g.actorIndex % defaultColors.length] }}
                  />
                  <span className="text-stone-500 shrink-0">Actor {g.actorIndex + 1}:</span>
                  <span className="text-stone-700">
                    {[
                      ...new Set(
                        g.charIds.map(
                          (id) =>
                            activeCut?.characterAliases?.[id] ??
                            speakingChars.find((c) => c.id === id)?.name ??
                            characterIdToName(id)
                        )
                      ),
                    ].join(", ")}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {project.actors.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {project.actors.map((actor) => {
              const isEditing = editingActorId === actor.id;
              const isConfirmingDelete = confirmDeleteActorId === actor.id;
              const assignedCharIds = project.assignments
                .filter((a) => a.actorId === actor.id)
                .map((a) => a.characterId);
              const assignedCount = assignedCharIds.length;

              // Resolve display names for assigned characters (deduplicated)
              const assignedCharNames = [
                ...new Set(
                  assignedCharIds.map(
                    (id) =>
                      activeCut?.characterAliases?.[id] ??
                      play?.castList.find((c) => c.id === id)?.name ??
                      characterIdToName(id)
                  )
                ),
              ];

              if (isConfirmingDelete) {
                return (
                  <div
                    key={actor.id}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-red-300 bg-red-50 text-sm"
                  >
                    <span className="text-red-700 text-xs">
                      Remove {actor.name}
                      {assignedCount > 0 ? ` (${assignedCount} assigned char${assignedCount > 1 ? "s" : ""})` : ""}?
                    </span>
                    <button
                      onClick={() => {
                        dispatch({ type: "DELETE_ACTOR", actorId: actor.id });
                        setConfirmDeleteActorId(null);
                      }}
                      className="text-xs text-red-600 font-medium hover:text-red-800"
                    >
                      Yes
                    </button>
                    <button
                      onClick={() => setConfirmDeleteActorId(null)}
                      className="text-xs text-stone-400 hover:text-stone-600"
                    >
                      Cancel
                    </button>
                  </div>
                );
              }

              return (
                <div
                  key={actor.id}
                  className="group/chip flex items-start gap-2 px-3 py-2 rounded-lg border border-stone-200 bg-white text-sm"
                >
                  <label
                    className="w-3 h-3 rounded-full cursor-pointer shrink-0 mt-0.5 hover:ring-2 hover:ring-offset-1 hover:ring-stone-400 transition-shadow"
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
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1">
                      {isEditing ? (
                        <input
                          autoFocus
                          type="text"
                          value={editingActorName}
                          onChange={(e) => setEditingActorName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && editingActorName.trim()) {
                              dispatch({ type: "UPDATE_ACTOR", actorId: actor.id, name: editingActorName.trim(), color: actor.color });
                              setEditingActorId(null);
                            } else if (e.key === "Escape") {
                              setEditingActorId(null);
                            }
                          }}
                          onBlur={() => {
                            if (editingActorName.trim()) {
                              dispatch({ type: "UPDATE_ACTOR", actorId: actor.id, name: editingActorName.trim(), color: actor.color });
                            }
                            setEditingActorId(null);
                          }}
                          className="text-stone-700 bg-transparent border-b border-stone-400 focus:outline-none focus:border-amber-500 w-24 text-sm"
                        />
                      ) : (
                        <span
                          className="group/name flex items-center gap-1 cursor-text"
                          title="Click to rename"
                          onClick={() => {
                            setEditingActorId(actor.id);
                            setEditingActorName(actor.name);
                          }}
                        >
                          <span className="text-stone-700 hover:text-stone-900">{actor.name}</span>
                          <span className="text-stone-300 opacity-0 group-hover/name:opacity-100 transition-opacity text-xs select-none" aria-hidden>✎</span>
                        </span>
                      )}
                      <button
                        onClick={() => {
                          if (assignedCount > 0) {
                            setConfirmDeleteActorId(actor.id);
                          } else {
                            dispatch({ type: "DELETE_ACTOR", actorId: actor.id });
                          }
                        }}
                        className="text-stone-300 hover:text-red-400 ml-1 text-xs"
                        title="Remove actor"
                      >
                        ✕
                      </button>
                    </div>
                    {assignedCharNames.length > 0 && (
                      <div className="text-xs text-stone-400 mt-0.5 leading-snug">
                        {assignedCharNames.join(", ")}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
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
            isFullyCut={fullyCutCharIds.has(char.id)}
            lineCounts={lineCounts?.byCharacter[char.id] ?? { original: 0, afterCut: 0 }}
            wordCounts={lineCounts?.words.byCharacter[char.id] ?? { original: 0, afterCut: 0 }}
            stageMinutes={stageTime?.byCharacter[char.id]?.minutes}
            alias={activeCut?.characterAliases?.[char.id]}
            onSetAlias={(alias) =>
              dispatch({ type: "SET_CHARACTER_ALIAS", characterId: char.id, alias })
            }
          />
        ))}
      </div>
    </div>
  );
}
