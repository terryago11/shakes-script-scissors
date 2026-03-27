"use client";

import { useState } from "react";
import type { Play } from "@/types/play";
import type { Actor, ActorAssignment, ProjectSettings } from "@/types/project";
import type { LineCounts } from "@/types/cut";
import type { StageTimeResult } from "@/lib/cuts/StageTimeEngine";
import { useMetric } from "@/lib/ui/MetricContext";
import { useViewMode } from "@/lib/ui/ViewModeContext";
import { resolveCharacterName } from "@/lib/project/projectUtils";
import CharacterRow from "./CharacterRow";
import ActorRow from "./ActorRow";


type FilterState = { type: "character"; id: string } | { type: "actor"; id: string } | null;

interface Props {
  play: Play;
  lineCounts: LineCounts;
  actors: Actor[];
  assignments: ActorAssignment[];
  filter?: FilterState;
  onFilterCharacter?: (characterId: string | null) => void;
  onFilterActor?: (actorId: string | null) => void;
  stageTime?: StageTimeResult;
  settings?: ProjectSettings;
  /** When true, lineCounts is scoped to a focused scene — show a label */
  isFocused?: boolean;
  /** Cut-level character display-name aliases */
  characterAliases?: Record<string, string>;
}

function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export default function LineCountPanel({
  play, lineCounts, actors, assignments, filter, onFilterCharacter, onFilterActor,
  stageTime, settings, isFocused, characterAliases,
}: Props) {
  const { metric, setMetric } = useMetric();
  const { viewMode } = useViewMode();
  const isClean = viewMode === "clean";
  // Local tab state — "time" only available when stageTime is provided
  const [panelTab, setPanelTab] = useState<"lines" | "words" | "time">("lines");

  function handleTabClick(tab: "lines" | "words" | "time") {
    setPanelTab(tab);
    setMetric(tab);
  }

  const { total, byCharacter, byActor } = lineCounts;
  const wordTotal = lineCounts.words.total;
  const wordByCharacter = lineCounts.words.byCharacter;
  const wordByActor = lineCounts.words.byActor;

  const activeCounts = metric === "lines"
    ? { total, byCharacter, byActor }
    : { total: wordTotal, byCharacter: wordByCharacter, byActor: wordByActor };

  const pct = activeCounts.total.original > 0
    ? Math.round((1 - activeCounts.total.afterCut / activeCounts.total.original) * 100)
    : 0;

  function handleCharacterClick(characterId: string) {
    onFilterCharacter?.(filter?.type === "character" && filter.id === characterId ? null : characterId);
  }

  function handleActorClick(actorId: string) {
    onFilterActor?.(filter?.type === "actor" && filter.id === actorId ? null : actorId);
  }

  // Tab row (shared across both view states)
  const tabRow = (
    <div className="flex gap-1 mb-5 p-0.5 bg-stone-100 dark:bg-stone-800 rounded-md" title={isFocused ? "Showing counts for focused scene only" : undefined}>
      <button
        onClick={() => handleTabClick("lines")}
        className={`flex-1 text-xs py-1 px-2 rounded transition-colors font-medium ${
          panelTab === "lines" ? "bg-white dark:bg-stone-900 text-stone-700 dark:text-stone-200 shadow-sm" : "text-stone-400 dark:text-stone-400 hover:text-stone-600 dark:hover:text-stone-300"
        }`}
      >
        Lines
      </button>
      <button
        onClick={() => handleTabClick("words")}
        className={`flex-1 text-xs py-1 px-2 rounded transition-colors font-medium ${
          panelTab === "words" ? "bg-white dark:bg-stone-900 text-stone-700 dark:text-stone-200 shadow-sm" : "text-stone-400 dark:text-stone-400 hover:text-stone-600 dark:hover:text-stone-300"
        }`}
      >
        Words
      </button>
      {stageTime && (
        <button
          onClick={() => handleTabClick("time")}
          className={`flex-1 text-xs py-1 px-2 rounded transition-colors font-medium ${
            panelTab === "time" ? "bg-white dark:bg-stone-900 text-stone-700 dark:text-stone-200 shadow-sm" : "text-stone-400 dark:text-stone-400 hover:text-stone-600 dark:hover:text-stone-300"
          }`}
        >
          Time
        </button>
      )}
    </div>
  );

  // ── Time tab ────────────────────────────────────────────────────────────────
  if (panelTab === "time" && stageTime) {
    const byCharList = Object.values(stageTime.byCharacter)
      .sort((a, b) => b.minutes - a.minutes);
    // Use the max of cut or original for bar scaling (cut can exceed original if chars were added)
    const maxMinutesForBar = Math.max(
      byCharList[0]?.minutes ?? 0,
      byCharList[0]?.originalMinutes ?? 0,
      1
    );
    const hasCuts = stageTime.totalMinutes < stageTime.originalTotalMinutes - 0.01;

    // ── Build by-actor time totals ──────────────────────────────────────────
    type ActorTime = { actorId: string; minutes: number; originalMinutes: number; charIds: string[] };
    const actorTimeMap = new Map<string, ActorTime>();
    for (const actor of actors) {
      actorTimeMap.set(actor.id, { actorId: actor.id, minutes: 0, originalMinutes: 0, charIds: [] });
    }
    for (const asgn of assignments) {
      const actorEntry = actorTimeMap.get(asgn.actorId);
      const charTime = stageTime.byCharacter[asgn.characterId];
      if (actorEntry && charTime) {
        actorEntry.minutes += charTime.minutes;
        actorEntry.originalMinutes += charTime.originalMinutes;
        actorEntry.charIds.push(asgn.characterId);
      }
    }
    const byActorTimeList = Array.from(actorTimeMap.values())
      .filter((a) => a.minutes > 0 || a.originalMinutes > 0)
      .sort((a, b) => b.minutes - a.minutes);
    const maxActorMinutes = Math.max(
      byActorTimeList[0]?.minutes ?? 0,
      byActorTimeList[0]?.originalMinutes ?? 0,
      1
    );

    return (
      <div className="p-4">
        {tabRow}
        {isFocused && (
          <div className="mb-4 text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 rounded px-2 py-1">
            Scene focus — counts scoped to this scene
          </div>
        )}

        {/* Running time total */}
        <div className="mb-5">
          <div className="text-xs font-semibold text-stone-400 dark:text-stone-400 uppercase tracking-wider mb-2">
            Running Time
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-stone-800 dark:text-stone-100">
              {formatMinutes(stageTime.totalMinutes)}
            </span>
            {!isClean && hasCuts && (
              <span className="text-sm text-stone-400 dark:text-stone-400">
                / {formatMinutes(stageTime.originalTotalMinutes)}
              </span>
            )}
          </div>
          {!isClean && hasCuts && (
            <div className="mt-1 text-xs text-red-500 font-medium">
              −{Math.round((1 - stageTime.totalMinutes / stageTime.originalTotalMinutes) * 100)}% cut
            </div>
          )}
          {settings?.wordsPerMinute && (
            <div className="text-xs text-stone-400 dark:text-stone-400 mt-1">
              at {settings.wordsPerMinute} wpm
            </div>
          )}
        </div>

        {/* By Actor */}
        {byActorTimeList.length > 0 && (
          <div className="mb-5">
            <div className="text-xs font-semibold text-stone-400 dark:text-stone-400 uppercase tracking-wider mb-2">
              On Stage By Actor
            </div>
            <div className="space-y-2">
              {byActorTimeList.map(({ actorId, minutes, originalMinutes, charIds }) => {
                const actor = actors.find((a) => a.id === actorId);
                const pctBar = (minutes / maxActorMinutes) * 100;
                const origPctBar = (originalMinutes / maxActorMinutes) * 100;
                const actorHasCuts = minutes < originalMinutes - 0.01;
                const actorHasAdded = minutes > originalMinutes + 0.01;
                const charNames = charIds
                  .map((id) => resolveCharacterName(id, characterAliases, play.castList))
                  .join(", ");
                const cutPct = originalMinutes > 0.01
                  ? Math.round((1 - minutes / originalMinutes) * 100)
                  : null;
                const addPct = originalMinutes > 0.01
                  ? Math.round((minutes / originalMinutes - 1) * 100)
                  : null;
                return (
                  <div key={actorId}>
                    <div className="flex items-baseline justify-between text-xs mb-0.5">
                      <div className="flex items-center gap-1.5 min-w-0 mr-2">
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: actor?.color ?? "#d1d5db" }}
                        />
                        <span className="text-stone-600 dark:text-stone-300 truncate">{actor?.name ?? actorId}</span>
                      </div>
                      <span className="text-stone-400 dark:text-stone-400 shrink-0 tabular-nums">
                        {formatMinutes(minutes)}
                        {!isClean && (actorHasCuts || actorHasAdded) && (
                          <span className="text-stone-300 dark:text-stone-600"> / {formatMinutes(originalMinutes)}</span>
                        )}
                        {!isClean && actorHasCuts && cutPct !== null && cutPct > 0 && (
                          <span className="text-red-500 ml-1">−{cutPct}%</span>
                        )}
                        {!isClean && actorHasAdded && addPct !== null && addPct > 0 && (
                          <span className="text-green-500 ml-1">+{addPct}%</span>
                        )}
                      </span>
                    </div>
                    <div className="h-1 bg-stone-100 dark:bg-stone-800 rounded-full overflow-hidden relative">
                      {!isClean && (actorHasCuts || actorHasAdded) && (
                        <div
                          className="absolute h-full bg-stone-200 dark:bg-stone-700 rounded-full"
                          style={{ width: `${origPctBar}%` }}
                        />
                      )}
                      <div
                        className="absolute h-full rounded-full transition-all"
                        style={{ width: `${pctBar}%`, backgroundColor: actor?.color ?? "#f59e0b" }}
                      />
                    </div>
                    {charNames && (
                      <div className="text-xs text-stone-300 dark:text-stone-600 mt-0.5 truncate">{charNames}</div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* By Character */}
        <div>
          <div className="text-xs font-semibold text-stone-400 dark:text-stone-400 uppercase tracking-wider mb-2">
            On Stage By Character
          </div>
          <div className="space-y-2">
            {byCharList.map(({ characterId, minutes, originalMinutes }) => {
              const charName = resolveCharacterName(characterId, characterAliases, play.castList);
              const pctBar = (minutes / maxMinutesForBar) * 100;
              const origPctBar = (originalMinutes / maxMinutesForBar) * 100;
              const charHasCuts = minutes < originalMinutes - 0.01;
              const charHasAdded = minutes > originalMinutes + 0.01;
              const cutPct = originalMinutes > 0.01
                ? Math.round((1 - minutes / originalMinutes) * 100)
                : null;
              const addPct = originalMinutes > 0.01
                ? Math.round((minutes / originalMinutes - 1) * 100)
                : null;
              const barColor = charHasAdded ? "bg-green-500" : charHasCuts ? "bg-red-400" : "bg-amber-400";
              return (
                <div key={characterId}>
                  <div className="flex items-baseline justify-between text-xs mb-0.5">
                    <span className="text-stone-600 dark:text-stone-300 truncate mr-2">{charName}</span>
                    <span className="text-stone-400 dark:text-stone-400 shrink-0 tabular-nums">
                      {formatMinutes(minutes)}
                      {!isClean && (charHasCuts || charHasAdded) && (
                        <span className="text-stone-300 dark:text-stone-600"> / {formatMinutes(originalMinutes)}</span>
                      )}
                      {!isClean && charHasCuts && cutPct !== null && cutPct > 0 && (
                        <span className="text-red-500 ml-1">−{cutPct}%</span>
                      )}
                      {!isClean && charHasAdded && addPct !== null && addPct > 0 && (
                        <span className="text-green-500 ml-1">+{addPct}%</span>
                      )}
                    </span>
                  </div>
                  <div className="h-1 bg-stone-100 dark:bg-stone-800 rounded-full overflow-hidden relative">
                    {!isClean && (charHasCuts || charHasAdded) && (
                      <div
                        className="absolute h-full bg-stone-200 dark:bg-stone-700 rounded-full"
                        style={{ width: `${origPctBar}%` }}
                      />
                    )}
                    <div
                      className={`absolute h-full rounded-full transition-all ${barColor}`}
                      style={{ width: `${pctBar}%` }}
                    />
                  </div>
                </div>
              );
            })}
            {byCharList.length === 0 && (
              <p className="text-xs text-stone-400 dark:text-stone-400">No stage time data yet.</p>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Lines / Words tabs ──────────────────────────────────────────────────────
  return (
    <div className="p-4">
      {tabRow}
      {isFocused && (
        <div className="mb-4 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
          Scene focus — counts scoped to this scene
        </div>
      )}

      {/* Total */}
      <div className="mb-5">
        <div className="text-xs font-semibold text-stone-400 uppercase tracking-wider mb-2">
          Total {metric === "lines" ? "Lines" : "Words"}
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-bold text-stone-800 dark:text-stone-100">{activeCounts.total.afterCut.toLocaleString()}</span>
          {!isClean && (
            <span className="text-sm text-stone-400 dark:text-stone-400">/ {activeCounts.total.original.toLocaleString()}</span>
          )}
        </div>
        {!isClean && pct > 0 && (
          <div className="mt-1 text-xs text-amber-600 font-medium">{pct}% cut</div>
        )}
        <div className="mt-2 h-1.5 bg-stone-100 dark:bg-stone-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-amber-400 rounded-full transition-all"
            style={{ width: `${activeCounts.total.original > 0 ? (activeCounts.total.afterCut / activeCounts.total.original) * 100 : 100}%` }}
          />
        </div>
      </div>

      {/* By Actor */}
      {actors.length > 0 && (
        <div className="mb-5">
          <div className="text-xs font-semibold text-stone-400 dark:text-stone-400 uppercase tracking-wider mb-2">
            By Actor
            {filter?.type === "actor" && (
              <button onClick={() => onFilterActor?.(null)} className="ml-2 normal-case font-normal text-amber-500 hover:text-amber-700">
                Clear filter
              </button>
            )}
          </div>
          <div className="space-y-2">
            {actors.map((actor) => {
              const isFiltered = filter?.type === "actor" && filter.id === actor.id;
              return (
                <ActorRow
                  key={actor.id}
                  actor={actor}
                  counts={activeCounts.byActor[actor.id] || { characters: [], original: 0, afterCut: 0 }}
                  play={play}
                  isFiltered={isFiltered}
                  onClick={onFilterActor ? () => handleActorClick(actor.id) : undefined}
                  hideOriginal={isClean}
                />
              );
            })}
          </div>
        </div>
      )}

      {/* By Character */}
      <div>
        <div className="text-xs font-semibold text-stone-400 uppercase tracking-wider mb-2">
          By Character
          {filter?.type === "character" && (
            <button onClick={() => onFilterCharacter?.(null)} className="ml-2 normal-case font-normal text-amber-500 hover:text-amber-700">
              Clear filter
            </button>
          )}
        </div>
        <div className="space-y-1">
          {play.castList
            .filter((c) => (activeCounts.byCharacter[c.id]?.original ?? 0) > 0)
            .sort((a, b) => (activeCounts.byCharacter[b.id]?.original ?? 0) - (activeCounts.byCharacter[a.id]?.original ?? 0))
            .map((char) => (
              <CharacterRow
                key={char.id}
                character={char}
                counts={activeCounts.byCharacter[char.id] || { original: 0, afterCut: 0 }}
                isFiltered={filter?.type === "character" && filter.id === char.id}
                onClick={onFilterCharacter ? () => handleCharacterClick(char.id) : undefined}
                displayName={resolveCharacterName(char.id, characterAliases, play.castList)}
                hideOriginal={isClean}
              />
            ))}
        </div>
      </div>
    </div>
  );
}
