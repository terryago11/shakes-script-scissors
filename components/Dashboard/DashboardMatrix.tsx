"use client";

import React, { useState } from "react";
import type { Act, Character, Scene } from "@/types/play";
import type { Actor, ActorAssignment } from "@/types/project";
import type { CharacterStageTime } from "@/lib/cuts/StageTimeEngine";

export interface CharSceneData {
  linesOrig: number;
  linesAfterCut: number;
  wordsOrig: number;
  wordsAfterCut: number;
}

interface Props {
  effectiveSceneOrder: string[];
  sceneById: Map<string, Scene>;
  sceneActMap: Map<string, Act>;
  /** Full cast list from the play */
  characters: Character[];
  actors: Actor[];
  assignments: ActorAssignment[];
  /** Character × scene line/word data */
  charSceneMatrix: Map<string, Map<string, CharSceneData>>;
  /** Per-character stage-time data (for Time metric) */
  stageTimeByChar: Record<string, CharacterStageTime>;
  pauses?: Record<string, { name: string; minutes: number }>;
  metric: "lines" | "words" | "time";
  /** Scene IDs where all speeches are cut (dim these rows) */
  cutSceneIds: Set<string>;
}

function fmtMins(m: number): string {
  if (m <= 0) return "";
  if (m < 1) return `${Math.round(m * 60)}s`;
  const mins = Math.floor(m);
  const secs = Math.round((m - mins) * 60);
  return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
}

export default function DashboardMatrix({
  effectiveSceneOrder,
  sceneById,
  sceneActMap,
  characters,
  actors,
  assignments,
  charSceneMatrix,
  stageTimeByChar,
  pauses,
  metric,
  cutSceneIds,
}: Props) {
  const [filterCharId, setFilterCharId] = useState<string | null>(null);

  // Build lookup maps
  const actorToChars = new Map<string, string[]>();
  const charToActor = new Map<string, string>();
  for (const a of assignments) {
    charToActor.set(a.characterId, a.actorId);
    if (!actorToChars.has(a.actorId)) actorToChars.set(a.actorId, []);
    actorToChars.get(a.actorId)!.push(a.characterId);
  }

  const charById = new Map(characters.map((c) => [c.id, c]));
  const castCharIds = new Set(assignments.map((a) => a.characterId));

  // Determine which characters appear in at least one scene
  const activeCharIds = new Set<string>();
  for (const [charId, sceneMap] of charSceneMatrix) {
    for (const data of sceneMap.values()) {
      if (data.linesOrig > 0) {
        activeCharIds.add(charId);
        break;
      }
    }
  }
  for (const [charId, ct] of Object.entries(stageTimeByChar)) {
    if (ct.originalMinutes > 0) activeCharIds.add(charId);
  }

  // Build column groups: cast characters grouped by actor, then uncast
  const colGroups: Array<{ actor: Actor | null; charIds: string[] }> = [];
  for (const actor of actors) {
    const charIds = (actorToChars.get(actor.id) ?? []).filter(
      (id) => activeCharIds.has(id) && charById.has(id)
    );
    if (charIds.length > 0) colGroups.push({ actor, charIds });
  }
  const uncastCharIds = characters
    .filter((c) => activeCharIds.has(c.id) && !castCharIds.has(c.id))
    .map((c) => c.id);
  if (uncastCharIds.length > 0) colGroups.push({ actor: null, charIds: uncastCharIds });

  const orderedCharIds = colGroups.flatMap((g) => g.charIds);

  if (orderedCharIds.length === 0) {
    return (
      <p className="text-sm text-stone-400 py-4">
        No character data found for any scene in the current cut.
      </p>
    );
  }

  // Character-to-group-start lookup (whether this char starts a new actor group)
  const groupStartSet = new Set<string>();
  for (const group of colGroups) {
    if (group.charIds.length > 0) groupStartSet.add(group.charIds[0]);
  }

  function handleColClick(charId: string) {
    setFilterCharId((prev) => (prev === charId ? null : charId));
  }

  function charHasPresence(charId: string, sceneId: string): boolean {
    if (metric === "time") {
      const entry = stageTimeByChar[charId];
      return (entry?.scenes.find((s) => s.sceneId === sceneId)?.minutes ?? 0) > 0;
    }
    const data = charSceneMatrix.get(charId)?.get(sceneId);
    if (!data) return false;
    return metric === "words" ? data.wordsAfterCut > 0 : data.linesAfterCut > 0;
  }

  const visibleSceneIds = filterCharId
    ? effectiveSceneOrder.filter((sceneId) => charHasPresence(filterCharId, sceneId))
    : effectiveSceneOrder;

  return (
    <div className="overflow-x-auto">
      {filterCharId && (
        <div className="mb-2 flex items-center gap-2">
          <span className="text-xs text-stone-500">
            Filtering to scenes with{" "}
            <span className="font-medium">{charById.get(filterCharId)?.name ?? filterCharId}</span>
          </span>
          <button
            onClick={() => setFilterCharId(null)}
            className="text-xs text-stone-400 hover:text-stone-600 underline"
          >
            Clear filter
          </button>
        </div>
      )}
      <table className="text-sm border-collapse w-full">
        <thead>
          {/* Row 1: Actor group spanning headers */}
          <tr>
            <th className="sticky left-0 bg-white min-w-44 border-b border-stone-200 py-1" />
            {colGroups.map((group) =>
              group.actor ? (
                <th
                  key={group.actor.id}
                  colSpan={group.charIds.length}
                  className="py-1 px-2 text-xs font-semibold text-center border-l border-b border-stone-200"
                  style={{ color: group.actor.color }}
                >
                  <div className="flex items-center justify-center gap-1">
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: group.actor.color }}
                    />
                    <span className="truncate max-w-24">{group.actor.name}</span>
                  </div>
                </th>
              ) : (
                <th
                  key="uncast"
                  colSpan={group.charIds.length}
                  className="py-1 px-2 text-xs font-semibold text-center text-stone-400 border-l border-b border-stone-200"
                >
                  Uncast
                </th>
              )
            )}
          </tr>

          {/* Row 2: Character headers (clickable to filter) */}
          <tr className="border-b-2 border-stone-200">
            <th className="sticky left-0 bg-white py-1.5 text-left text-xs font-semibold text-stone-500 uppercase tracking-wider pr-4 min-w-44">
              Scene
            </th>
            {orderedCharIds.map((charId) => {
              const char = charById.get(charId);
              const actorId = charToActor.get(charId);
              const actor = actorId ? actors.find((a) => a.id === actorId) : null;
              const isFiltered = filterCharId === charId;
              const isGroupStart = groupStartSet.has(charId);
              return (
                <th
                  key={charId}
                  className={`py-1.5 px-2 text-xs font-medium text-center min-w-20 max-w-28 cursor-pointer select-none transition-colors ${
                    isGroupStart ? "border-l border-stone-200" : ""
                  } ${isFiltered ? "bg-amber-50" : "hover:bg-stone-50"}`}
                  style={{ color: actor ? actor.color : "#a8a29e" }}
                  onClick={() => handleColClick(charId)}
                  title={`Click to filter to scenes with ${char?.name ?? charId}`}
                >
                  <div className="flex flex-col items-center gap-0.5">
                    <span className="truncate block max-w-24">{char?.name ?? charId}</span>
                    {isFiltered && (
                      <span className="text-amber-500 text-xs leading-none">▼</span>
                    )}
                  </div>
                </th>
              );
            })}
          </tr>
        </thead>

        <tbody>
          {visibleSceneIds.map((sceneId) => {
            const scene = sceneById.get(sceneId);
            const act = sceneActMap.get(sceneId);
            if (!scene || !act) return null;

            const isCut = cutSceneIds.has(sceneId);
            const pauseKey = `after:${sceneId}`;
            const pause = pauses?.[pauseKey];

            return (
              <React.Fragment key={sceneId}>
                <tr
                  className={`border-b border-stone-100 transition-colors ${
                    isCut ? "opacity-30" : "hover:bg-stone-50/70"
                  }`}
                >
                  <td className="py-1.5 pr-4 sticky left-0 bg-white">
                    <div className="text-xs truncate max-w-40">
                      <span className="text-stone-400">{act.title}</span>
                      <span className="text-stone-300 mx-1">·</span>
                      <span className="font-medium text-stone-700">{scene.title}</span>
                    </div>
                  </td>
                  {orderedCharIds.map((charId) => {
                    const actorId = charToActor.get(charId);
                    const actor = actorId ? actors.find((a) => a.id === actorId) : null;
                    const isGroupStart = groupStartSet.has(charId);

                    let display = "";
                    let present = false;

                    if (metric === "time") {
                      const entry = stageTimeByChar[charId];
                      const mins =
                        entry?.scenes.find((s) => s.sceneId === sceneId)?.minutes ?? 0;
                      present = mins > 0;
                      display = present ? fmtMins(mins) : "";
                    } else {
                      const data = charSceneMatrix.get(charId)?.get(sceneId);
                      const val =
                        metric === "words"
                          ? (data?.wordsAfterCut ?? 0)
                          : (data?.linesAfterCut ?? 0);
                      present = val > 0;
                      display = present ? val.toLocaleString() : "";
                    }

                    return (
                      <td
                        key={charId}
                        className={`py-1.5 px-2 text-center border-r border-stone-50 ${
                          isGroupStart ? "border-l border-stone-100" : ""
                        }`}
                        title={
                          present
                            ? `${charById.get(charId)?.name ?? charId}: ${display}${metric === "time" ? " on stage" : ` ${metric}`}`
                            : undefined
                        }
                      >
                        {present ? (
                          <span
                            className="text-xs tabular-nums font-medium px-1.5 py-0.5 rounded"
                            style={{
                              backgroundColor: actor ? actor.color + "20" : "#a8a29e20",
                              color: actor ? actor.color : "#78716c",
                            }}
                          >
                            {display}
                          </span>
                        ) : (
                          <span className="text-stone-200 text-xs">·</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
                {pause && (
                  <tr>
                    <td colSpan={orderedCharIds.length + 1} className="py-1 px-3">
                      <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-1">
                        <span>⏸</span>
                        <span className="font-medium">{pause.name}</span>
                        <span className="text-amber-500">{pause.minutes} min</span>
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
