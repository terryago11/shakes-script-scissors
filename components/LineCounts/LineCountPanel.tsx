"use client";

import { useState } from "react";
import type { Play } from "@/types/play";
import type { Actor, ActorAssignment, ProjectSettings } from "@/types/project";
import type { LineCounts } from "@/types/cut";
import type { StageTimeResult } from "@/lib/cuts/StageTimeEngine";
import { useMetric } from "@/lib/ui/MetricContext";
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
}

function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export default function LineCountPanel({
  play, lineCounts, actors, filter, onFilterCharacter, onFilterActor,
  stageTime, settings,
}: Props) {
  const { metric, setMetric } = useMetric();
  // Local tab state — "time" only available when stageTime is provided
  const [panelTab, setPanelTab] = useState<"lines" | "words" | "time">("lines");

  function handleTabClick(tab: "lines" | "words" | "time") {
    setPanelTab(tab);
    if (tab === "lines" || tab === "words") setMetric(tab);
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
    <div className="flex gap-1 mb-5 p-0.5 bg-stone-100 rounded-md">
      <button
        onClick={() => handleTabClick("lines")}
        className={`flex-1 text-xs py-1 px-2 rounded transition-colors font-medium ${
          panelTab === "lines" ? "bg-white text-stone-700 shadow-sm" : "text-stone-400 hover:text-stone-600"
        }`}
      >
        Lines
      </button>
      <button
        onClick={() => handleTabClick("words")}
        className={`flex-1 text-xs py-1 px-2 rounded transition-colors font-medium ${
          panelTab === "words" ? "bg-white text-stone-700 shadow-sm" : "text-stone-400 hover:text-stone-600"
        }`}
      >
        Words
      </button>
      {stageTime && (
        <button
          onClick={() => handleTabClick("time")}
          className={`flex-1 text-xs py-1 px-2 rounded transition-colors font-medium ${
            panelTab === "time" ? "bg-white text-stone-700 shadow-sm" : "text-stone-400 hover:text-stone-600"
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
    const maxMinutes = byCharList[0]?.minutes ?? 1;

    return (
      <div className="p-4">
        {tabRow}

        <div className="mb-5">
          <div className="text-xs font-semibold text-stone-400 uppercase tracking-wider mb-2">
            Running Time
          </div>
          <div className="text-2xl font-bold text-stone-800">
            {formatMinutes(stageTime.totalMinutes)}
          </div>
          {settings?.wordsPerMinute && (
            <div className="text-xs text-stone-400 mt-1">
              at {settings.wordsPerMinute} wpm
            </div>
          )}
        </div>

        <div>
          <div className="text-xs font-semibold text-stone-400 uppercase tracking-wider mb-2">
            On Stage By Character
          </div>
          <div className="space-y-2">
            {byCharList.map(({ characterId, minutes }) => {
              const char = play.castList.find((c) => c.id === characterId);
              const pctBar = maxMinutes > 0 ? (minutes / maxMinutes) * 100 : 0;
              return (
                <div key={characterId}>
                  <div className="flex items-baseline justify-between text-xs mb-0.5">
                    <span className="text-stone-600 truncate mr-2">{char?.name ?? characterId}</span>
                    <span className="text-stone-400 shrink-0 tabular-nums">{formatMinutes(minutes)}</span>
                  </div>
                  <div className="h-1 bg-stone-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-amber-400 rounded-full transition-all"
                      style={{ width: `${pctBar}%` }}
                    />
                  </div>
                </div>
              );
            })}
            {byCharList.length === 0 && (
              <p className="text-xs text-stone-400">No stage time data yet.</p>
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

      {/* Total */}
      <div className="mb-5">
        <div className="text-xs font-semibold text-stone-400 uppercase tracking-wider mb-2">
          Total {metric === "lines" ? "Lines" : "Words"}
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-bold text-stone-800">{activeCounts.total.afterCut.toLocaleString()}</span>
          <span className="text-sm text-stone-400">/ {activeCounts.total.original.toLocaleString()}</span>
        </div>
        {pct > 0 && (
          <div className="mt-1 text-xs text-amber-600 font-medium">{pct}% cut</div>
        )}
        <div className="mt-2 h-1.5 bg-stone-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-amber-400 rounded-full transition-all"
            style={{ width: `${activeCounts.total.original > 0 ? (activeCounts.total.afterCut / activeCounts.total.original) * 100 : 100}%` }}
          />
        </div>
      </div>

      {/* By Actor */}
      {actors.length > 0 && (
        <div className="mb-5">
          <div className="text-xs font-semibold text-stone-400 uppercase tracking-wider mb-2">
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
              />
            ))}
        </div>
      </div>
    </div>
  );
}
