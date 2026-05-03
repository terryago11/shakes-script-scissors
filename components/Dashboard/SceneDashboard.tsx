"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import type { Play, Act, Scene } from "@/types/play";
import type { Project, Cut, Actor, ActorAssignment } from "@/types/project";
export interface SongDanceItem {
  id: string;
  /** Display label shown in the scene list row */
  label: string;
  isSong: boolean;
  isDance: boolean;
}
import type { StageTimeResult } from "@/lib/cuts/StageTimeEngine";
import { computeCuts } from "@/lib/cuts/CutEngine";
import { runCountIntegrityCheck } from "@/lib/cuts/countIntegrityCheck";
import type { LineCounts } from "@/types/cut";
import { computeStageTime } from "@/lib/cuts/StageTimeEngine";
import { buildSceneEntries, type EffectiveSceneEntry } from "@/lib/cuts/SceneSubdivisionUtils";
import { useProject } from "@/lib/project/ProjectStore";
import { useMetric } from "@/lib/ui/MetricContext";
import DashboardMatrix from "./DashboardMatrix";
import type { CharSceneData } from "./DashboardMatrix";
import PresenceChart from "./PresenceChart";
import SceneList from "./SceneList";
import RehearsalGroupings from "./RehearsalGroupings";
import IntegrityChecks, { PropsTab } from "./IntegrityChecks";

const DEFAULT_WPM = 135;

interface Props {
  play: Play;
  project: Project;
  activeCut: Cut;
}

type Tab = "scenes" | "matrix" | "chart" | "rehearsal" | "props" | "integrity";

/** Build character × scene matrix by re-bucketing CutEngine's per-unit counts onto column
 *  entry IDs. CutEngine is the only place that interprets cutMap / lineCutMap / speechEdits /
 *  speechReassignments — this function is purely a re-bucketing pass. Columns may use virtual
 *  sub-scene IDs when scenes are subdivided. */
function buildCharSceneMatrix(
  byUnit: LineCounts["byUnit"],
  columnEntries: EffectiveSceneEntry[],
): Map<string, Map<string, CharSceneData>> {
  const matrix = new Map<string, Map<string, CharSceneData>>();

  function ensureEntry(charId: string, sceneKey: string): CharSceneData {
    if (!matrix.has(charId)) matrix.set(charId, new Map());
    const charMap = matrix.get(charId)!;
    if (!charMap.has(sceneKey)) charMap.set(sceneKey, { linesOrig: 0, linesAfterCut: 0, wordsOrig: 0, wordsAfterCut: 0 });
    return charMap.get(sceneKey)!;
  }

  for (const entry of columnEntries) {
    for (const unit of entry.units) {
      if (unit.type !== "speech") continue;
      const u = byUnit[unit.id];
      if (!u) continue;

      for (const charId of u.originalSpeakers) {
        const data = ensureEntry(charId, entry.id);
        data.linesOrig += u.lines.original;
        data.wordsOrig += u.words.original;
      }
      for (const charId of u.effectiveSpeakers) {
        const data = ensureEntry(charId, entry.id);
        data.linesAfterCut += u.lines.afterCut;
        data.wordsAfterCut += u.words.afterCut;
      }
    }
  }

  return matrix;
}

/** Build actor × scene time matrix — used by SceneList for actor presence strips */
function buildActorSceneMatrix(
  stageTime: StageTimeResult,
  actors: Actor[],
  assignments: ActorAssignment[],
): Map<string, Map<string, { minutes: number; originalMinutes: number }>> {
  const charToActor = new Map(assignments.map((a) => [a.characterId, a.actorId]));
  const matrix = new Map<string, Map<string, { minutes: number; originalMinutes: number }>>();
  for (const actor of actors) {
    matrix.set(actor.id, new Map());
  }
  for (const charTime of Object.values(stageTime.byCharacter)) {
    const actorId = charToActor.get(charTime.characterId);
    if (!actorId) continue;
    const actorMap = matrix.get(actorId);
    if (!actorMap) continue;
    for (const scene of charTime.scenes) {
      const existing = actorMap.get(scene.sceneId) ?? { minutes: 0, originalMinutes: 0 };
      actorMap.set(scene.sceneId, {
        minutes: existing.minutes + scene.minutes,
        originalMinutes: existing.originalMinutes + scene.originalMinutes,
      });
    }
  }
  return matrix;
}

function formatMinutes(m: number): string {
  if (m < 60) return `${Math.round(m)} min`;
  const h = Math.floor(m / 60);
  const rem = Math.round(m % 60);
  return rem > 0 ? `${h}h ${rem}m` : `${h}h`;
}

export default function SceneDashboard({ play, project, activeCut }: Props) {
  const { dispatch } = useProject();
  const { metric, setMetric, wpm, setWpm } = useMetric();
  const searchParams = useSearchParams();
  const initialTab = (searchParams.get("tab") as Tab | null) ?? "scenes";
  const [tab, setTab] = useState<Tab>(initialTab);
  const [chartMode, setChartMode] = useState<"bar" | "presence">("bar");

  useEffect(() => {
    setWpm(project.settings?.wordsPerMinute ?? DEFAULT_WPM);
  }, [project.settings?.wordsPerMinute, setWpm]);

  const defaultSceneOrder = play.acts.flatMap((act) => act.scenes.map((s) => s.id));
  const effectiveSceneOrder = activeCut.sceneOrder ?? defaultSceneOrder;

  const sceneById = new Map<string, Scene>();
  const sceneActMap = new Map<string, Act>();
  for (const act of play.acts) {
    for (const scene of act.scenes) {
      sceneById.set(scene.id, scene);
      sceneActMap.set(scene.id, act);
    }
  }

  // Build column entries — expand subdivided scenes into virtual A/B/C sub-columns
  const columnEntries: EffectiveSceneEntry[] = effectiveSceneOrder.flatMap((sceneId) => {
    const scene = sceneById.get(sceneId);
    if (!scene) return [];
    return buildSceneEntries(scene, activeCut, play);
  });

  const { lineCounts } = computeCuts(play, activeCut, project.assignments, project.actors);
  const integrityReport = runCountIntegrityCheck(lineCounts);
  if (!integrityReport.ok) {
    // Should never fire — engine is the sole source of truth. Logged (not thrown) so a
    // future regression surfaces in the console without crashing the dashboard for users.
    console.error("[CountIntegrity]", integrityReport);
  }
  const stageTime = computeStageTime(play, activeCut, project.settings);
  const cellMatrix = buildCharSceneMatrix(lineCounts.byUnit, columnEntries);
  const actorSceneMatrix = buildActorSceneMatrix(stageTime, project.actors, project.assignments);

  // Actual scene durations (words / wpm) — includes virtual sub-scene IDs when subdivided
  const sceneTimings = new Map<string, number>();
  const sceneLineTotals = new Map<string, number>();
  const sceneWordTotals = new Map<string, number>();
  for (const [sceneKey, sc] of Object.entries(lineCounts.byScene)) {
    sceneTimings.set(sceneKey, sc.words.afterCut / wpm);
    sceneLineTotals.set(sceneKey, sc.lines.afterCut);
    sceneWordTotals.set(sceneKey, sc.words.afterCut);
  }

  // Fully-cut scenes: had lines originally but afterCut = 0
  // Uses columnEntries so virtual sub-scene IDs are correctly checked
  const cutSceneIds = new Set<string>(
    columnEntries
      .map((e) => e.id)
      .filter((id) => {
        const sc = lineCounts.byScene[id];
        return sc && sc.lines.original > 0 && sc.lines.afterCut === 0;
      })
  );

  // Build a map of sceneId → song/dance items (speeches with <lg> stanzas + song/dance SDs + line overrides)
  // Also build lineId → { sceneId, charName, text } for line song overrides lookup
  const lineSceneMap = new Map<string, { sceneId: string; charName: string; text: string }>();
  for (const [sceneId, scene] of sceneById) {
    for (const unit of scene.units) {
      if (unit.type === "speech") {
        for (const line of unit.lines) {
          lineSceneMap.set(line.id, { sceneId, charName: unit.characterName, text: line.text });
        }
      }
    }
  }

  const sceneSongDanceItems = new Map<string, SongDanceItem[]>();
  for (const [sceneId, scene] of sceneById) {
    const items: SongDanceItem[] = [];
    for (const unit of scene.units) {
      if (unit.type === "speech" && unit.isSong) {
        // Song speech — show the first *sung* line, not the first line (which may be prose preamble)
        const firstSungLine = unit.lines.find((l) => l.isSong) ?? unit.lines[0];
        const firstLine = firstSungLine?.text ?? "";
        const preview = firstLine.length > 35 ? firstLine.slice(0, 33) + "…" : firstLine;
        items.push({ id: unit.id, label: `${unit.characterName}: "${preview}"`, isSong: true, isDance: false });
      } else if (unit.type === "stage") {
        // Apply sdFlagOverrides on top of TEI values
        const flagOverride = activeCut.sdFlagOverrides?.[unit.id];
        const isSong = flagOverride?.isSong ?? unit.isSong ?? false;
        const isDance = flagOverride?.isDance ?? unit.isDance ?? false;
        if (isSong || isDance) {
          items.push({ id: unit.id, label: unit.text, isSong, isDance });
        }
      }
    }
    if (items.length > 0) sceneSongDanceItems.set(sceneId, items);
  }

  // Add director-marked song lines (lineSongOverrides = true) to sceneSongDanceItems
  const lineSongOverrides = activeCut.lineSongOverrides ?? {};
  for (const [lineId, isSong] of Object.entries(lineSongOverrides)) {
    if (!isSong) continue;
    const info = lineSceneMap.get(lineId);
    if (!info) continue;
    const existing = sceneSongDanceItems.get(info.sceneId) ?? [];
    const preview = info.text.length > 35 ? info.text.slice(0, 33) + "…" : info.text;
    existing.push({ id: lineId, label: `${info.charName}: "${preview}"`, isSong: true, isDance: false });
    sceneSongDanceItems.set(info.sceneId, existing);
  }

  function handleAddSceneSplit(realSceneId: string, afterUnitId: string) {
    dispatch({ type: "ADD_SCENE_SPLIT", realSceneId, afterUnitId });
  }

  function handleRemoveSceneSplit(realSceneId: string, splitId: string) {
    dispatch({ type: "REMOVE_SCENE_SPLIT", realSceneId, splitId });
  }

  function handleSetPause(afterSceneId: string, name: string, minutes: number) {
    dispatch({ type: "SET_PAUSE", afterSceneId, name, minutes });
  }

  function handleRemovePause(afterSceneId: string) {
    dispatch({ type: "REMOVE_PAUSE", afterSceneId });
  }

  function handleSetSceneOrder(newOrder: string[]) {
    dispatch({ type: "SET_SCENE_ORDER", sceneOrder: newOrder });
  }

  function handleSetStageDuration(stageId: string, minutes: number) {
    dispatch({ type: "SET_STAGE_DURATION", stageId, minutes });
  }

  function handleClearStageDuration(stageId: string) {
    dispatch({ type: "CLEAR_STAGE_DURATION", stageId });
  }

  function handleSetActDescription(actId: string, description: string | null) {
    dispatch({ type: "SET_ACT_DESCRIPTION", actId, description });
  }

  function handleSetSceneDescription(sceneId: string, description: string | null) {
    dispatch({ type: "SET_SCENE_DESCRIPTION", sceneId, description });
  }

  const hasPauses = activeCut.pauses && Object.keys(activeCut.pauses).length > 0;
  const pauseTotal = stageTime.pauseMinutes;
  const hasCuts = stageTime.totalMinutes < stageTime.originalTotalMinutes - 0.01;

  const integrityWarnings = stageTime.warnings;

  const tabs: Array<{ key: Tab; label: string }> = [
    { key: "scenes", label: "Scenes & Pauses" },
    { key: "matrix", label: "Matrix" },
    { key: "chart", label: "Charts" },
    { key: "rehearsal", label: "Rehearsal" },
    { key: "props", label: "Props" },
    { key: "integrity", label: integrityWarnings.length > 0 ? `Integrity ⚠ ${integrityWarnings.length}` : "Integrity" },
  ];

  return (
    <div className="max-w-screen-xl mx-auto px-4 md:px-6 py-8">
      {/* Header row: title · metric toggle · running time */}
      <div className="flex flex-wrap items-center justify-between mb-4 gap-3 md:gap-6">
        <div className="shrink-0">
          <h1 className="text-2xl font-bold text-stone-800 dark:text-stone-100 mb-1">Production Dashboard</h1>
          <p className="text-stone-500 dark:text-stone-400 text-sm">
            {play.acts.length} acts · {effectiveSceneOrder.length} scenes · {play.castList.length} characters · {project.actors.length} actors
          </p>
        </div>

        {/* Metric tabs — inline with header */}
        <div className="flex gap-1 p-0.5 bg-stone-100 dark:bg-stone-800 rounded-md">
          {(["lines", "words", "time"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMetric(m)}
              className={`text-xs py-1 px-3 rounded transition-colors font-medium capitalize ${
                metric === m
                  ? "bg-white dark:bg-stone-900 text-stone-700 dark:text-stone-200 shadow-sm"
                  : "text-stone-400 dark:text-stone-400 hover:text-stone-600 dark:hover:text-stone-300"
              }`}
            >
              {m === "time" ? "Time" : m === "words" ? "Words" : (
                <span className="flex items-center gap-0.5">
                  Lines
                  <span className="relative group/linetip" onClick={(e) => e.stopPropagation()}>
                    <span className="text-[9px] opacity-40 cursor-help border border-current rounded-full w-3 h-3 inline-flex items-center justify-center leading-none">?</span>
                    <span className="absolute bottom-full right-0 mb-1 hidden group-hover/linetip:block w-52 max-w-[min(13rem,calc(100vw-1rem))] bg-stone-800 text-white text-[10px] leading-snug rounded px-2 py-1.5 whitespace-normal z-50 shadow-lg pointer-events-none text-left font-normal normal-case tracking-normal">
                      Each kept line counts as 1. Partial lines (e.g. half-lines shared between characters) each count as 1 full line.
                    </span>
                  </span>
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Running time summary */}
        <div className="text-right shrink-0">
          <div className="text-2xl font-bold text-stone-800 dark:text-stone-100 tabular-nums">
            {formatMinutes(stageTime.totalMinutes)}
          </div>
          {hasCuts && (
            <div className="text-sm text-stone-400 dark:text-stone-400">
              / {formatMinutes(stageTime.originalTotalMinutes)} original
            </div>
          )}
          {hasPauses && pauseTotal > 0 && (
            <div className="text-xs text-amber-600 mt-0.5">
              incl. {formatMinutes(pauseTotal)} pauses
            </div>
          )}
          <div className="text-xs text-stone-400 dark:text-stone-500 mt-0.5">
            @ {project.settings?.wordsPerMinute ?? DEFAULT_WPM} wpm
          </div>
        </div>
      </div>

      {/* Subtabs row */}
      <div className="overflow-x-auto mb-6">
        <div className="flex min-w-max border border-stone-200 dark:border-stone-700 rounded-md overflow-hidden">
          {tabs.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`text-xs py-1.5 px-4 transition-colors font-medium border-r border-stone-200 dark:border-stone-700 last:border-r-0 ${
                tab === key
                  ? "bg-stone-700 dark:bg-stone-600 text-white"
                  : "bg-white dark:bg-stone-900 text-stone-500 dark:text-stone-400 hover:bg-stone-50 dark:hover:bg-stone-800 hover:text-stone-700 dark:hover:text-stone-200"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab: Scenes & Pauses */}
      {tab === "scenes" && (
        <div className="max-w-xl">
          <SceneList
            effectiveSceneOrder={effectiveSceneOrder}
            sceneById={sceneById}
            sceneActMap={sceneActMap}
            actors={project.actors}
            actorSceneMatrix={actorSceneMatrix}
            lineCounts={lineCounts}
            stageTime={stageTime}
            pauses={activeCut.pauses}
            onSetPause={handleSetPause}
            onRemovePause={handleRemovePause}
            onSetSceneOrder={handleSetSceneOrder}
            metric={metric}
            wpm={wpm}
            sceneSongDanceSDs={sceneSongDanceItems}
            stageDurations={activeCut.stageDurations}
            onSetStageDuration={handleSetStageDuration}
            onClearStageDuration={handleClearStageDuration}
            actDescriptions={project.actDescriptions}
            sceneDescriptions={project.sceneDescriptions}
            onSetActDescription={handleSetActDescription}
            onSetSceneDescription={handleSetSceneDescription}
            activeCut={activeCut}
            play={play}
            onAddSceneSplit={handleAddSceneSplit}
            onRemoveSceneSplit={handleRemoveSceneSplit}
            columnEntries={columnEntries}
          />
        </div>
      )}

      {/* Tab: Matrix */}
      {tab === "matrix" && (
        <DashboardMatrix
          effectiveSceneOrder={effectiveSceneOrder}
          columnEntries={columnEntries}
          sceneById={sceneById}
          sceneActMap={sceneActMap}
          characters={play.castList}
          actors={project.actors}
          assignments={project.assignments}
          cellMatrix={cellMatrix}
          stageTimeByChar={stageTime.byCharacter}
          pauses={activeCut.pauses}
          metric={metric}
          cutSceneIds={cutSceneIds}
          characterAliases={activeCut.characterAliases}
          viewType="table"
          sceneTimings={sceneTimings}
          sceneLineTotals={sceneLineTotals}
          sceneWordTotals={sceneWordTotals}
          actDescriptions={project.actDescriptions}
          sceneDescriptions={project.sceneDescriptions}
        />
      )}

      {/* Tab: Chart */}
      {tab === "chart" && (
        <div>
          {/* Bar | Presence toggle */}
          <div className="flex gap-1 p-0.5 bg-stone-100 dark:bg-stone-800 rounded-md w-fit mb-5">
            {(["bar", "presence"] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setChartMode(mode)}
                className={`text-xs py-1 px-3 rounded transition-colors font-medium ${
                  chartMode === mode
                    ? "bg-white dark:bg-stone-900 text-stone-700 dark:text-stone-200 shadow-sm"
                    : "text-stone-400 dark:text-stone-400 hover:text-stone-600 dark:hover:text-stone-300"
                }`}
              >
                {mode === "bar" ? "Bar" : "Presence"}
              </button>
            ))}
          </div>

          {chartMode === "bar" && (
            <DashboardMatrix
              effectiveSceneOrder={effectiveSceneOrder}
              columnEntries={columnEntries}
              sceneById={sceneById}
              sceneActMap={sceneActMap}
              characters={play.castList}
              actors={project.actors}
              assignments={project.assignments}
              cellMatrix={cellMatrix}
              stageTimeByChar={stageTime.byCharacter}
              pauses={activeCut.pauses}
              metric={metric}
              cutSceneIds={cutSceneIds}
              characterAliases={activeCut.characterAliases}
              viewType="chart"
              sceneTimings={sceneTimings}
              sceneLineTotals={sceneLineTotals}
              sceneWordTotals={sceneWordTotals}
              actDescriptions={project.actDescriptions}
              sceneDescriptions={project.sceneDescriptions}
            />
          )}

          {chartMode === "presence" && (
            <PresenceChart
              play={play}
              activeCut={activeCut}
              effectiveSceneOrder={effectiveSceneOrder}
              columnEntries={columnEntries}
              actors={project.actors}
              assignments={project.assignments}
              characters={play.castList}
              characterAliases={activeCut.characterAliases}
            />
          )}
        </div>
      )}

      {/* Tab: Rehearsal */}
      {tab === "rehearsal" && (
        <RehearsalGroupings
          play={play}
          effectiveSceneOrder={effectiveSceneOrder}
          columnEntries={columnEntries}
          sceneById={sceneById}
          sceneActMap={sceneActMap}
          actors={project.actors}
          assignments={project.assignments}
          cellMatrix={cellMatrix}
          stageTimeByChar={stageTime.byCharacter}
          lineCounts={lineCounts}
          metric={metric}
          wpm={wpm}
          characterAliases={activeCut.characterAliases}
          minBlockMinutes={project.settings?.rehearsalMinBlockMinutes ?? 5}
          maxBlockMinutes={project.settings?.rehearsalMaxBlockMinutes ?? 60}
          activeCut={activeCut}
          actDescriptions={project.actDescriptions}
          sceneDescriptions={project.sceneDescriptions}
        />
      )}

      {/* Tab: Props */}
      {tab === "props" && (
        <PropsTab play={play} activeCut={activeCut} />
      )}

      {/* Tab: Integrity */}
      {tab === "integrity" && (
        <IntegrityChecks
          play={play}
          activeCut={activeCut}
          stageTime={stageTime}
          characterAliases={activeCut.characterAliases}
          onToggleMarkedForRemoval={(characterId) =>
            dispatch({ type: "TOGGLE_MARK_FOR_REMOVAL", characterId })
          }
        />
      )}
    </div>
  );
}
