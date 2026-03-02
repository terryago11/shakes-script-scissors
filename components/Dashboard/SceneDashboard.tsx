"use client";

import { useState, useEffect } from "react";
import type { Play, Act, Scene } from "@/types/play";
import type { Project, Cut, Actor, ActorAssignment } from "@/types/project";
import type { StageTimeResult } from "@/lib/cuts/StageTimeEngine";
import { computeCuts } from "@/lib/cuts/CutEngine";
import { computeStageTime } from "@/lib/cuts/StageTimeEngine";
import { useProject } from "@/lib/project/ProjectStore";
import { useMetric } from "@/lib/ui/MetricContext";
import DashboardMatrix from "./DashboardMatrix";
import type { CharSceneData } from "./DashboardMatrix";
import SceneList from "./SceneList";
import RehearsalGroupings from "./RehearsalGroupings";

const DEFAULT_WPM = 135;

interface Props {
  play: Play;
  project: Project;
  activeCut: Cut;
}

type Tab = "scenes" | "matrix" | "rehearsal";

/** Count words in a string (matches CutEngine logic) */
function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/** Build character × scene matrix with line and word counts */
function buildCharSceneMatrix(
  play: Play,
  cut: Cut,
  effectiveSceneOrder: string[],
): Map<string, Map<string, CharSceneData>> {
  const matrix = new Map<string, Map<string, CharSceneData>>();

  const sceneById = new Map<string, Scene>();
  for (const act of play.acts) {
    for (const scene of act.scenes) sceneById.set(scene.id, scene);
  }

  for (const sceneId of effectiveSceneOrder) {
    const scene = sceneById.get(sceneId);
    if (!scene) continue;

    for (const unit of scene.units) {
      if (unit.type !== "speech") continue;
      const charId = unit.characterId;

      if (!matrix.has(charId)) matrix.set(charId, new Map());
      const charMap = matrix.get(charId)!;
      const existing = charMap.get(sceneId) ?? {
        linesOrig: 0,
        linesAfterCut: 0,
        wordsOrig: 0,
        wordsAfterCut: 0,
      };

      const origLines = unit.lineCount;
      const origWords = unit.lines.reduce((sum, l) => sum + countWords(l.text), 0);

      const isKept = (cut.cutMap[unit.id] ?? "kept") === "kept";
      let keptLines = 0;
      let keptWords = 0;
      if (isKept) {
        for (const line of unit.lines) {
          if (cut.lineCutMap?.[line.id] === "cut") continue;
          keptLines++;
          keptWords += countWords(line.text);
        }
      }

      charMap.set(sceneId, {
        linesOrig: existing.linesOrig + origLines,
        linesAfterCut: existing.linesAfterCut + keptLines,
        wordsOrig: existing.wordsOrig + origWords,
        wordsAfterCut: existing.wordsAfterCut + keptWords,
      });
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
  const [tab, setTab] = useState<Tab>("scenes");

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

  const { lineCounts } = computeCuts(play, activeCut, project.assignments, project.actors);
  const stageTime = computeStageTime(play, activeCut, project.settings);
  const charSceneMatrix = buildCharSceneMatrix(play, activeCut, effectiveSceneOrder);
  const actorSceneMatrix = buildActorSceneMatrix(stageTime, project.actors, project.assignments);

  // Fully-cut scenes: had lines originally but afterCut = 0
  const cutSceneIds = new Set<string>(
    effectiveSceneOrder.filter((id) => {
      const sc = lineCounts.byScene[id];
      return sc && sc.lines.original > 0 && sc.lines.afterCut === 0;
    })
  );

  function handleSetPause(afterSceneId: string, name: string, minutes: number) {
    dispatch({ type: "SET_PAUSE", afterSceneId, name, minutes });
  }

  function handleRemovePause(afterSceneId: string) {
    dispatch({ type: "REMOVE_PAUSE", afterSceneId });
  }

  function handleSetSceneOrder(newOrder: string[]) {
    dispatch({ type: "SET_SCENE_ORDER", sceneOrder: newOrder });
  }

  const hasPauses = activeCut.pauses && Object.keys(activeCut.pauses).length > 0;
  const pauseTotal = stageTime.pauseMinutes;
  const hasCuts = stageTime.totalMinutes < stageTime.originalTotalMinutes - 0.01;

  const tabs: Array<{ key: Tab; label: string }> = [
    { key: "scenes", label: "Scenes & Pauses" },
    { key: "matrix", label: "Matrix" },
    { key: "rehearsal", label: "Rehearsal" },
  ];

  return (
    <div className="max-w-screen-xl mx-auto px-6 py-8">
      {/* Header row: title · metric toggle · running time */}
      <div className="flex items-center justify-between mb-4 gap-6">
        <div className="shrink-0">
          <h1 className="text-2xl font-bold text-stone-800 mb-1">Scene Dashboard</h1>
          <p className="text-stone-500 text-sm">
            {effectiveSceneOrder.length} scenes · {project.actors.length} actors
          </p>
        </div>

        {/* Metric tabs — inline with header */}
        <div className="flex gap-1 p-0.5 bg-stone-100 rounded-md">
          {(["lines", "words", "time"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMetric(m)}
              className={`text-xs py-1 px-3 rounded transition-colors font-medium capitalize ${
                metric === m
                  ? "bg-white text-stone-700 shadow-sm"
                  : "text-stone-400 hover:text-stone-600"
              }`}
            >
              {m === "time" ? "Time" : m === "lines" ? "Lines" : "Words"}
            </button>
          ))}
        </div>

        {/* Running time summary */}
        <div className="text-right shrink-0">
          <div className="text-2xl font-bold text-stone-800 tabular-nums">
            {formatMinutes(stageTime.totalMinutes)}
          </div>
          {hasCuts && (
            <div className="text-sm text-stone-400">
              / {formatMinutes(stageTime.originalTotalMinutes)} original
            </div>
          )}
          {hasPauses && pauseTotal > 0 && (
            <div className="text-xs text-amber-600 mt-0.5">
              incl. {formatMinutes(pauseTotal)} pauses
            </div>
          )}
        </div>
      </div>

      {/* Subtabs row */}
      <div className="flex mb-6">
        <div className="flex border border-stone-200 rounded-md overflow-hidden">
          {tabs.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`text-xs py-1.5 px-4 transition-colors font-medium border-r border-stone-200 last:border-r-0 ${
                tab === key
                  ? "bg-stone-700 text-white"
                  : "bg-white text-stone-500 hover:bg-stone-50 hover:text-stone-700"
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
          />
        </div>
      )}

      {/* Tab: Matrix */}
      {tab === "matrix" && (
        <DashboardMatrix
          effectiveSceneOrder={effectiveSceneOrder}
          sceneById={sceneById}
          sceneActMap={sceneActMap}
          characters={play.castList}
          actors={project.actors}
          assignments={project.assignments}
          charSceneMatrix={charSceneMatrix}
          stageTimeByChar={stageTime.byCharacter}
          pauses={activeCut.pauses}
          metric={metric}
          cutSceneIds={cutSceneIds}
        />
      )}

      {/* Tab: Rehearsal */}
      {tab === "rehearsal" && (
        <RehearsalGroupings
          play={play}
          effectiveSceneOrder={effectiveSceneOrder}
          sceneById={sceneById}
          sceneActMap={sceneActMap}
          actors={project.actors}
          assignments={project.assignments}
          charSceneMatrix={charSceneMatrix}
          stageTimeByChar={stageTime.byCharacter}
          lineCounts={lineCounts}
          metric={metric}
          wpm={wpm}
        />
      )}
    </div>
  );
}
