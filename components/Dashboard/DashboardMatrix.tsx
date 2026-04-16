"use client";

import React, { useState } from "react";
import type { Act, Character, Scene } from "@/types/play";
import type { Actor, ActorAssignment } from "@/types/project";
import { resolveCharacterName } from "@/lib/project/projectUtils";
import type { CharacterStageTime } from "@/lib/cuts/StageTimeEngine";
import type { EffectiveSceneEntry } from "@/lib/cuts/SceneSubdivisionUtils";

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
  /** Which view to render — controlled by parent tab selection */
  viewType: "table" | "chart";
  /** Actual scene durations (wordsAfterCut / wpm) for correct row totals in time metric */
  sceneTimings?: Map<string, number>;
  actDescriptions?: Record<string, string>;
  sceneDescriptions?: Record<string, string>;
  /** When provided, replaces effectiveSceneOrder for columns — expands subdivided scenes to A/B/C sub-columns */
  columnEntries?: EffectiveSceneEntry[];
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
  characterAliases,
  viewType,
  sceneTimings,
  actDescriptions,
  sceneDescriptions,
  columnEntries,
}: Props) {
  // Row filter: scenes that contain at least one of these characters
  const [filterCharIds, setFilterCharIds] = useState<Set<string>>(new Set());
  // Column filter: only show characters present in this scene
  const [filterSceneId, setFilterSceneId] = useState<string | null>(null);
  const [showHelp, setShowHelp] = useState(false);

  // When columnEntries is provided (subdivisions exist), use virtual IDs as column/row keys
  const columnIds: string[] = columnEntries ? columnEntries.map((e) => e.id) : effectiveSceneOrder;
  const columnEntryMap = new Map(columnEntries?.map((e) => [e.id, e]) ?? []);

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
      <p className="text-sm text-stone-400 dark:text-stone-400 py-4">
        No character data found for any scene in the current cut.
      </p>
    );
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

  // Derived visible rows: scenes where any filterChar has presence
  const visibleSceneIds = filterCharIds.size > 0
    ? columnIds.filter((sceneId) =>
        [...filterCharIds].some((cid) => charHasPresence(cid, sceneId))
      )
    : columnIds;

  // Derived visible columns: characters present in filterSceneId (or all if no scene filter)
  const visibleCharIds = filterSceneId
    ? orderedCharIds.filter((cid) => charHasPresence(cid, filterSceneId))
    : orderedCharIds;

  const visibleCharIdSet = new Set(visibleCharIds);

  // Recompute group-start set for visible columns only
  const visibleGroupStartSet = new Set<string>();
  for (const group of colGroups) {
    const firstVisible = group.charIds.find((id) => visibleCharIdSet.has(id));
    if (firstVisible) visibleGroupStartSet.add(firstVisible);
  }

  /** Row total for time: use actual scene duration to avoid double-counting simultaneous chars */
  function getRowTotal(sceneId: string): number {
    if (metric === "time" && sceneTimings) {
      return sceneTimings.get(sceneId) ?? 0;
    }
    return visibleCharIds.reduce((sum, charId) => sum + getCellValue(charId, sceneId), 0);
  }

  function getColTotal(charId: string): number {
    return visibleSceneIds.reduce((sum, sceneId) => sum + getCellValue(charId, sceneId), 0);
  }

  const grandTotal = metric === "time" && sceneTimings
    ? visibleSceneIds.reduce((sum, sid) => sum + (sceneTimings.get(sid) ?? 0), 0)
    : visibleCharIds.reduce((sum, charId) => sum + getColTotal(charId), 0);

  // Chart data: per-character totals across all (unfiltered) columns, sorted descending
  const charTotals = orderedCharIds
    .map((charId) => ({
      charId,
      total: columnIds.reduce((sum, sid) => sum + getCellValue(charId, sid), 0),
      actor: charToActor.get(charId)
        ? actors.find((a) => a.id === charToActor.get(charId)) ?? null
        : null,
    }))
    .filter((d) => d.total > 0)
    .sort((a, b) => b.total - a.total);

  const maxTotal = charTotals.length > 0 ? charTotals[0].total : 1;

  // Handlers
  function handleColClick(charId: string) {
    setFilterCharIds((prev) => {
      const next = new Set(prev);
      if (next.has(charId)) next.delete(charId);
      else next.add(charId);
      return next;
    });
  }

  function handleActorHeaderClick(actorCharIds: string[]) {
    setFilterCharIds((prev) => {
      const allPresent = actorCharIds.every((id) => prev.has(id));
      const next = new Set(prev);
      if (allPresent) {
        actorCharIds.forEach((id) => next.delete(id));
      } else {
        actorCharIds.forEach((id) => next.add(id));
      }
      return next;
    });
  }

  function handleRowLabelClick(sceneId: string) {
    setFilterSceneId((prev) => (prev === sceneId ? null : sceneId));
  }

  function clearFilters() {
    setFilterCharIds(new Set());
    setFilterSceneId(null);
  }

  const hasFilter = filterCharIds.size > 0 || filterSceneId !== null;

  // ── Chart view ──────────────────────────────────────────────────────────────
  if (viewType === "chart") {
    return (
      <div className="max-w-2xl space-y-1.5">
        {charTotals.map(({ charId, total, actor }) => {
          const charDisplayName = resolveCharacterName(charId, characterAliases, characters);
          const barPct = (total / maxTotal) * 100;
          return (
            <div key={charId} className="flex items-center gap-3">
              <div
                className="text-xs font-medium text-right shrink-0 w-28 truncate"
                style={{ color: actor ? actor.color : "#78716c" }}
                title={charDisplayName}
              >
                {charDisplayName}
              </div>
              <div className="flex-1 h-5 bg-stone-100 dark:bg-stone-800 rounded overflow-hidden">
                <div
                  className="h-full rounded transition-all"
                  style={{
                    width: `${barPct}%`,
                    backgroundColor: actor ? actor.color + "80" : "#a8a29e80",
                  }}
                />
              </div>
              <div
                className="text-xs tabular-nums font-semibold shrink-0 w-14 text-right"
                style={{ color: actor ? actor.color : "#78716c" }}
              >
                {formatValue(total)}
              </div>
              <div className="text-xs text-stone-400 dark:text-stone-400 shrink-0 w-24 truncate">
                {actor ? actor.name : ""}
              </div>
            </div>
          );
        })}
        {charTotals.length === 0 && (
          <p className="text-sm text-stone-400 dark:text-stone-400 py-4">No data to display.</p>
        )}
      </div>
    );
  }

  // ── Table view ──────────────────────────────────────────────────────────────
  return (
    <div>
      {/* Toolbar: filter indicator + help */}
      <div className="flex items-center justify-between mb-3 gap-4 min-h-6">
        <div className="flex items-center gap-2 text-xs">
          {hasFilter ? (
            <>
              {filterCharIds.size > 0 && (
                <span className="text-stone-500 dark:text-stone-400">
                  Scenes with{" "}
                  <span className="font-medium">
                    {[...filterCharIds]
                      .map((id) => resolveCharacterName(id, characterAliases, characters))
                      .join(", ")}
                  </span>
                </span>
              )}
              {filterSceneId && (
                <span className="text-stone-500 dark:text-stone-400">
                  {filterCharIds.size > 0 ? " · " : ""}Characters in{" "}
                  <span className="font-medium">
                    {columnEntryMap.get(filterSceneId)?.title
                      ?? sceneById.get(filterSceneId)?.title
                      ?? filterSceneId}
                  </span>
                </span>
              )}
              <button
                onClick={clearFilters}
                className="text-stone-400 dark:text-stone-400 hover:text-stone-600 dark:hover:text-stone-300 underline ml-1"
              >
                Clear
              </button>
            </>
          ) : (
            <span className="text-stone-400 dark:text-stone-500 italic">
              Click columns or rows to filter
            </span>
          )}
        </div>

        {/* Help button */}
        <div className="relative shrink-0">
          <button
            onClick={() => setShowHelp((h) => !h)}
            className="text-xs text-stone-400 dark:text-stone-400 hover:text-stone-600 dark:hover:text-stone-300 w-5 h-5 rounded-full border border-stone-300 dark:border-stone-600 flex items-center justify-center font-medium"
            title="How filtering works"
            aria-label="How filtering works"
          >
            ?
          </button>
          {showHelp && (
            <div className="absolute right-0 top-7 z-50 w-72 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-lg shadow-lg p-3 text-xs text-stone-600 dark:text-stone-300 space-y-1.5">
              <p><span className="font-medium">Character column</span> — filter to scenes where that character appears</p>
              <p><span className="font-medium">Actor header</span> — filter to scenes for all of that actor&apos;s characters</p>
              <p><span className="font-medium">Scene row label</span> — filter columns to characters in that scene</p>
              <p className="text-stone-400 dark:text-stone-500 pt-0.5">Filters are additive (OR). Click again to remove.</p>
            </div>
          )}
        </div>
      </div>

      {/* Scrollable table wrapper — max-h enables sticky headers */}
      <div className="max-h-[70vh] overflow-auto">
        <table className="text-sm border-collapse w-full">
          <thead>
            {/* Row 1: Actor group spanning headers */}
            <tr>
              <th className="sticky left-0 top-0 z-40 bg-white dark:bg-stone-950 min-w-44 border-b border-stone-200 dark:border-stone-700 py-1" />
              {colGroups.map((group) => {
                const visibleCols = group.charIds.filter((id) => visibleCharIdSet.has(id));
                if (visibleCols.length === 0) return null;
                return group.actor ? (
                  <th
                    key={group.actor.id}
                    colSpan={visibleCols.length}
                    className="sticky top-0 z-30 bg-white dark:bg-stone-950 py-1 px-2 text-xs font-semibold text-left border-l border-b border-stone-200 dark:border-stone-700 cursor-pointer hover:bg-stone-50 dark:hover:bg-stone-800/50 select-none"
                    style={{ color: group.actor.color }}
                    onClick={() => handleActorHeaderClick(group.charIds)}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleActorHeaderClick(group.charIds); } }}
                    tabIndex={0}
                    role="button"
                    aria-label={`Filter to ${group.actor.name}'s scenes`}
                    title={`Click to filter to ${group.actor.name}'s scenes`}
                  >
                    <div className="flex items-center justify-start gap-1">
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: group.actor.color }}
                        aria-hidden="true"
                      />
                      <span className="truncate max-w-24" title={group.actor.name}>{group.actor.name}</span>
                    </div>
                  </th>
                ) : (
                  <th
                    key="uncast"
                    colSpan={visibleCols.length}
                    className="sticky top-0 z-30 bg-white dark:bg-stone-950 py-1 px-2 text-xs font-semibold text-left text-stone-400 dark:text-stone-400 border-l border-b border-stone-200 dark:border-stone-700"
                  >
                    Uncast
                  </th>
                );
              })}
              <th className="sticky top-0 z-30 bg-white dark:bg-stone-950 py-1 px-2 text-xs font-semibold text-left text-stone-400 dark:text-stone-400 border-l border-b border-stone-200 dark:border-stone-700">
                Total
              </th>
            </tr>

            {/* Row 2: Character headers (clickable to filter rows) */}
            <tr className="border-b-2 border-stone-200 dark:border-stone-700">
              <th className="sticky left-0 top-7 z-40 bg-white dark:bg-stone-950 py-1.5 text-left text-xs font-semibold text-stone-500 dark:text-stone-400 uppercase tracking-wider pr-4 min-w-44">
                Scene
              </th>
              {visibleCharIds.map((charId) => {
                const charDisplayName = resolveCharacterName(charId, characterAliases, characters);
                const actorId = charToActor.get(charId);
                const actor = actorId ? actors.find((a) => a.id === actorId) : null;
                const isFiltered = filterCharIds.has(charId);
                const isGroupStart = visibleGroupStartSet.has(charId);
                return (
                  <th
                    key={charId}
                    className={`sticky top-7 z-20 py-1.5 px-2 text-xs font-medium text-center min-w-20 max-w-28 cursor-pointer select-none transition-colors ${
                      isGroupStart ? "border-l border-stone-200 dark:border-stone-700" : ""
                    } ${
                      isFiltered
                        ? "bg-amber-50 dark:bg-amber-950/50"
                        : "bg-white dark:bg-stone-950 hover:bg-stone-50 dark:hover:bg-stone-800/50"
                    }`}
                    style={{ color: actor ? actor.color : "#a8a29e" }}
                    onClick={() => handleColClick(charId)}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleColClick(charId); } }}
                    tabIndex={0}
                    role="button"
                    aria-label={`Filter to scenes with ${charDisplayName}`}
                    title={`Click to filter to scenes with ${charDisplayName}`}
                  >
                    <div className="flex flex-col items-center gap-0.5">
                      <span className="truncate block max-w-24" title={charDisplayName}>{charDisplayName}</span>
                      {isFiltered && (
                        <span className="text-amber-500 text-xs leading-none">▼</span>
                      )}
                    </div>
                  </th>
                );
              })}
              <th className="sticky top-7 z-20 bg-white dark:bg-stone-950 py-1.5 px-2 text-xs font-semibold text-center text-stone-500 dark:text-stone-400 border-l border-stone-200 dark:border-stone-700 min-w-20">
                Total
              </th>
            </tr>
          </thead>

          <tbody>
            {visibleSceneIds.map((sceneId) => {
              const entry = columnEntryMap.get(sceneId);
              const realSceneId = entry?.realSceneId ?? sceneId;
              const scene = sceneById.get(realSceneId);
              const act = sceneActMap.get(realSceneId);
              if (!scene || !act) return null;

              const subLabel = entry?.label ?? "";
              const isCut = cutSceneIds.has(sceneId);
              const pauseKey = `after:${sceneId}`;
              const pause = pauses?.[pauseKey];
              const rowTotal = getRowTotal(sceneId);
              const isSceneFiltered = filterSceneId === sceneId;

              return (
                <React.Fragment key={sceneId}>
                  <tr
                    className={`border-b border-stone-100 dark:border-stone-800 transition-colors ${
                      isCut ? "opacity-30" : "hover:bg-stone-50/70 dark:hover:bg-stone-800/50"
                    }`}
                  >
                    {/* Scene row label — clickable to filter columns */}
                    <td
                      className={`py-1.5 pr-4 sticky left-0 cursor-pointer select-none transition-colors ${
                        isSceneFiltered
                          ? "bg-amber-50 dark:bg-amber-950/50"
                          : "bg-white dark:bg-stone-950 hover:bg-stone-50 dark:hover:bg-stone-800"
                      }`}
                      onClick={() => handleRowLabelClick(sceneId)}
                      title="Click to filter columns to characters in this scene"
                    >
                      <div className="flex items-center gap-1.5 text-xs truncate max-w-40">
                        <span className="text-stone-400 dark:text-stone-400 shrink-0">{act.title}</span>
                        <span className="text-stone-300 dark:text-stone-600 shrink-0">·</span>
                        <span
                          className={`font-medium ${
                            isSceneFiltered
                              ? "text-amber-700 dark:text-amber-300"
                              : "text-stone-700 dark:text-stone-200"
                          }`}
                        >
                          {scene.title}
                        </span>
                        {subLabel && (
                          <span className="shrink-0 text-[10px] font-bold text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/40 px-1 py-0.5 rounded leading-none">
                            {subLabel}
                          </span>
                        )}
                      </div>
                      {(() => {
                        const note = sceneDescriptions?.[realSceneId] || actDescriptions?.[act.id];
                        return note ? (
                          <div className="text-[10px] text-stone-400 dark:text-stone-500 truncate max-w-40 italic mt-0.5">{note}</div>
                        ) : null;
                      })()}
                    </td>
                    {visibleCharIds.map((charId) => {
                      const actorId = charToActor.get(charId);
                      const actor = actorId ? actors.find((a) => a.id === actorId) : null;
                      const isGroupStart = visibleGroupStartSet.has(charId);
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
                      <td colSpan={visibleCharIds.length + 2} className="py-1 px-3">
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
              {visibleCharIds.map((charId) => {
                const actorId = charToActor.get(charId);
                const actor = actorId ? actors.find((a) => a.id === actorId) : null;
                const isGroupStart = visibleGroupStartSet.has(charId);
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
    </div>
  );
}
