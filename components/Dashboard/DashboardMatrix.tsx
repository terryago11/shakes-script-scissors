"use client";

import React, { useState } from "react";
import type { Act, Character, Scene } from "@/types/play";
import type { Actor, ActorAssignment } from "@/types/project";
import { resolveCharacterName } from "@/lib/project/projectUtils";
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
  /** Cut-level character display-name aliases */
  characterAliases?: Record<string, string>;
}

function fmtMins(m: number): string {
  if (m <= 0) return "";
  if (m < 1) return `${Math.round(m * 60)}s`;
  const mins = Math.floor(m);
  const secs = Math.round((m - mins) * 60);
  return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
}

type ViewType = "table" | "chart";

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
  characterAliases,
}: Props) {
  const [filterCharId, setFilterCharId] = useState<string | null>(null);
  const [viewType, setViewType] = useState<ViewType>("table");

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
      <p className="text-sm text-stone-400 dark:text-stone-500 py-4">
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

  /** Get the cut-only numeric value for a character in a scene */
  function getCellValue(charId: string, sceneId: string): number {
    if (metric === "time") {
      const entry = stageTimeByChar[charId];
      return entry?.scenes.find((s) => s.sceneId === sceneId)?.minutes ?? 0;
    }
    const data = charSceneMatrix.get(charId)?.get(sceneId);
    if (!data) return 0;
    return metric === "words" ? data.wordsAfterCut : data.linesAfterCut;
  }

  function formatValue(val: number): string {
    if (val <= 0) return "";
    if (metric === "time") return fmtMins(val);
    return val.toLocaleString();
  }

  const visibleSceneIds = filterCharId
    ? effectiveSceneOrder.filter((sceneId) => charHasPresence(filterCharId, sceneId))
    : effectiveSceneOrder;

  /** Row total: sum across all characters for one scene */
  function getRowTotal(sceneId: string): number {
    return orderedCharIds.reduce((sum, charId) => sum + getCellValue(charId, sceneId), 0);
  }

  /** Column total: sum across all visible scenes for one character */
  function getColTotal(charId: string): number {
    return visibleSceneIds.reduce((sum, sceneId) => sum + getCellValue(charId, sceneId), 0);
  }

  const grandTotal = orderedCharIds.reduce((sum, charId) => sum + getColTotal(charId), 0);

  // Chart data: per-character totals, sorted descending
  const charTotals = orderedCharIds
    .map((charId) => ({
      charId,
      total: getColTotal(charId),
      actor: charToActor.get(charId)
        ? actors.find((a) => a.id === charToActor.get(charId)) ?? null
        : null,
    }))
    .filter((d) => d.total > 0)
    .sort((a, b) => b.total - a.total);

  const maxTotal = charTotals.length > 0 ? charTotals[0].total : 1;

  return (
    <div>
      {/* Toolbar: view toggle + filter indicator */}
      <div className="flex items-center justify-between mb-3 gap-4">
        {/* Table / Chart toggle */}
        <div className="flex gap-1 p-0.5 bg-stone-100 dark:bg-stone-800 rounded-md w-fit">
          {(["table", "chart"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setViewType(v)}
              className={`text-xs py-1 px-3 rounded transition-colors font-medium ${
                viewType === v
                  ? "bg-white dark:bg-stone-900 text-stone-700 dark:text-stone-200 shadow-sm"
                  : "text-stone-400 dark:text-stone-500 hover:text-stone-600 dark:hover:text-stone-300"
              }`}
            >
              {v === "table" ? "Table" : "Chart"}
            </button>
          ))}
        </div>

        {/* Filter indicator */}
        {filterCharId && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-stone-500 dark:text-stone-400">
              Filtering to scenes with{" "}
              <span className="font-medium">{resolveCharacterName(filterCharId, characterAliases, characters)}</span>
            </span>
            <button
              onClick={() => setFilterCharId(null)}
              className="text-xs text-stone-400 dark:text-stone-500 hover:text-stone-600 dark:hover:text-stone-300 underline"
            >
              Clear filter
            </button>
          </div>
        )}
      </div>

      {viewType === "chart" ? (
        /* ── Chart view ── */
        <div className="max-w-2xl space-y-1.5">
          {charTotals.map(({ charId, total, actor }) => {
            const charDisplayName = resolveCharacterName(charId, characterAliases, characters);
            const barPct = (total / maxTotal) * 100;
            return (
              <div key={charId} className="flex items-center gap-3">
                {/* Character name */}
                <div
                  className="text-xs font-medium text-right shrink-0 w-28 truncate"
                  style={{ color: actor ? actor.color : "#78716c" }}
                  title={charDisplayName}
                >
                  {charDisplayName}
                </div>
                {/* Bar */}
                <div className="flex-1 h-5 bg-stone-100 dark:bg-stone-800 rounded overflow-hidden">
                  <div
                    className="h-full rounded transition-all"
                    style={{
                      width: `${barPct}%`,
                      backgroundColor: actor ? actor.color + "80" : "#a8a29e80",
                    }}
                  />
                </div>
                {/* Value */}
                <div
                  className="text-xs tabular-nums font-semibold shrink-0 w-14 text-right"
                  style={{ color: actor ? actor.color : "#78716c" }}
                >
                  {formatValue(total)}
                </div>
                {/* Actor name — always fixed-width so counts stay in the same column */}
                <div className="text-xs text-stone-400 dark:text-stone-500 shrink-0 w-24 truncate">
                  {actor ? actor.name : ""}
                </div>
              </div>
            );
          })}
          {charTotals.length === 0 && (
            <p className="text-sm text-stone-400 dark:text-stone-500 py-4">No data to display.</p>
          )}
        </div>
      ) : (
        /* ── Table view ── */
        <div className="overflow-x-auto">
          <table className="text-sm border-collapse w-full">
            <thead>
              {/* Row 1: Actor group spanning headers — left-aligned */}
              <tr>
                <th className="sticky left-0 bg-white dark:bg-stone-950 min-w-44 border-b border-stone-200 dark:border-stone-700 py-1" />
                {colGroups.map((group) =>
                  group.actor ? (
                    <th
                      key={group.actor.id}
                      colSpan={group.charIds.length}
                      className="py-1 px-2 text-xs font-semibold text-left border-l border-b border-stone-200 dark:border-stone-700"
                      style={{ color: group.actor.color }}
                    >
                      <div className="flex items-center justify-start gap-1">
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
                      className="py-1 px-2 text-xs font-semibold text-left text-stone-400 dark:text-stone-500 border-l border-b border-stone-200 dark:border-stone-700"
                    >
                      Uncast
                    </th>
                  )
                )}
                {/* "Total" header for the totals column — spans actor row */}
                <th className="py-1 px-2 text-xs font-semibold text-left text-stone-400 dark:text-stone-500 border-l border-b border-stone-200 dark:border-stone-700">
                  Total
                </th>
              </tr>

              {/* Row 2: Character headers (clickable to filter) */}
              <tr className="border-b-2 border-stone-200 dark:border-stone-700">
                <th className="sticky left-0 bg-white dark:bg-stone-950 py-1.5 text-left text-xs font-semibold text-stone-500 dark:text-stone-400 uppercase tracking-wider pr-4 min-w-44">
                  Scene
                </th>
                {orderedCharIds.map((charId) => {
                  const charDisplayName = resolveCharacterName(charId, characterAliases, characters);
                  const actorId = charToActor.get(charId);
                  const actor = actorId ? actors.find((a) => a.id === actorId) : null;
                  const isFiltered = filterCharId === charId;
                  const isGroupStart = groupStartSet.has(charId);
                  return (
                    <th
                      key={charId}
                      className={`py-1.5 px-2 text-xs font-medium text-center min-w-20 max-w-28 cursor-pointer select-none transition-colors ${
                        isGroupStart ? "border-l border-stone-200 dark:border-stone-700" : ""
                      } ${isFiltered ? "bg-amber-50 dark:bg-amber-950/50" : "hover:bg-stone-50 dark:hover:bg-stone-800/50"}`}
                      style={{ color: actor ? actor.color : "#a8a29e" }}
                      onClick={() => handleColClick(charId)}
                      title={`Click to filter to scenes with ${charDisplayName}`}
                    >
                      <div className="flex flex-col items-center gap-0.5">
                        <span className="truncate block max-w-24">{charDisplayName}</span>
                        {isFiltered && (
                          <span className="text-amber-500 text-xs leading-none">▼</span>
                        )}
                      </div>
                    </th>
                  );
                })}
                {/* "Total" header for totals column */}
                <th className="py-1.5 px-2 text-xs font-semibold text-center text-stone-500 dark:text-stone-400 border-l border-stone-200 dark:border-stone-700 min-w-20">
                  Total
                </th>
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
                const rowTotal = getRowTotal(sceneId);

                return (
                  <React.Fragment key={sceneId}>
                    <tr
                      className={`border-b border-stone-100 dark:border-stone-800 transition-colors ${
                        isCut ? "opacity-30" : "hover:bg-stone-50/70 dark:hover:bg-stone-800/50"
                      }`}
                    >
                      <td className="py-1.5 pr-4 sticky left-0 bg-white dark:bg-stone-950">
                        <div className="text-xs truncate max-w-40">
                          <span className="text-stone-400 dark:text-stone-500">{act.title}</span>
                          <span className="text-stone-300 dark:text-stone-600 mx-1">·</span>
                          <span className="font-medium text-stone-700 dark:text-stone-200">{scene.title}</span>
                        </div>
                      </td>
                      {orderedCharIds.map((charId) => {
                        const actorId = charToActor.get(charId);
                        const actor = actorId ? actors.find((a) => a.id === actorId) : null;
                        const isGroupStart = groupStartSet.has(charId);
                        const val = getCellValue(charId, sceneId);
                        const present = val > 0;
                        const display = formatValue(val);

                        return (
                          <td
                            key={charId}
                            className={`py-1.5 px-2 text-center border-r border-stone-50 dark:border-stone-900 ${
                              isGroupStart ? "border-l border-stone-100 dark:border-stone-800" : ""
                            }`}
                            title={
                              present
                                ? `${resolveCharacterName(charId, characterAliases, characters)}: ${display}${metric === "time" ? " on stage" : ` ${metric}`}`
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
                              <span className="text-stone-200 dark:text-stone-700 text-xs">·</span>
                            )}
                          </td>
                        );
                      })}
                      {/* Row total */}
                      <td className="py-1.5 px-2 text-center border-l border-stone-100 dark:border-stone-800">
                        {rowTotal > 0 ? (
                          <span className="text-xs tabular-nums font-semibold text-stone-500 dark:text-stone-400">
                            {formatValue(rowTotal)}
                          </span>
                        ) : (
                          <span className="text-stone-200 dark:text-stone-700 text-xs">·</span>
                        )}
                      </td>
                    </tr>
                    {pause && (
                      <tr>
                        <td colSpan={orderedCharIds.length + 2} className="py-1 px-3">
                          <div className="flex items-center gap-2 text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 rounded px-3 py-1">
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

            {/* Totals footer row */}
            <tfoot>
              <tr className="border-t-2 border-stone-200 dark:border-stone-700 bg-stone-50/80 dark:bg-stone-900/80">
                <td className="py-1.5 pr-4 sticky left-0 bg-stone-50 dark:bg-stone-900 text-xs font-semibold text-stone-500 dark:text-stone-400 uppercase tracking-wider">
                  Total
                </td>
                {orderedCharIds.map((charId) => {
                  const actorId = charToActor.get(charId);
                  const actor = actorId ? actors.find((a) => a.id === actorId) : null;
                  const isGroupStart = groupStartSet.has(charId);
                  const total = getColTotal(charId);

                  return (
                    <td
                      key={charId}
                      className={`py-1.5 px-2 text-center border-r border-stone-100 dark:border-stone-800 ${
                        isGroupStart ? "border-l border-stone-200 dark:border-stone-700" : ""
                      }`}
                    >
                      {total > 0 ? (
                        <span
                          className="text-xs tabular-nums font-semibold px-1.5 py-0.5 rounded"
                          style={{
                            backgroundColor: actor ? actor.color + "20" : "#a8a29e20",
                            color: actor ? actor.color : "#78716c",
                          }}
                        >
                          {formatValue(total)}
                        </span>
                      ) : (
                        <span className="text-stone-300 dark:text-stone-600 text-xs">—</span>
                      )}
                    </td>
                  );
                })}
                {/* Grand total */}
                <td className="py-1.5 px-2 text-center border-l border-stone-200 dark:border-stone-700">
                  <span className="text-xs tabular-nums font-bold text-stone-600 dark:text-stone-300">
                    {formatValue(grandTotal)}
                  </span>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
