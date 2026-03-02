"use client";

import { useEffect } from "react";
import type { Play, Act, Scene } from "@/types/play";
import type { Project, Cut, Actor, ActorAssignment } from "@/types/project";
import type { StageTimeResult } from "@/lib/cuts/StageTimeEngine";
import { computeCuts } from "@/lib/cuts/CutEngine";
import { computeStageTime } from "@/lib/cuts/StageTimeEngine";
import { useProject } from "@/lib/project/ProjectStore";
import { useMetric } from "@/lib/ui/MetricContext";
import DashboardMatrix from "./DashboardMatrix";
import SceneList from "./SceneList";

const DEFAULT_WPM = 135;

interface Props {
  play: Play;
  project: Project;
  activeCut: Cut;
}

/** Invert stageTime.byCharacter[charId].scenes through assignments → actor × scene matrix */
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

/** Walk play speeches per scene and sum line counts per actor */
function buildActorSceneLineMatrix(
  play: Play,
  cut: Cut,
  assignments: ActorAssignment[],
  effectiveSceneOrder: string[],
): Map<string, Map<string, { original: number; afterCut: number }>> {
  const charToActor = new Map(assignments.map((a) => [a.characterId, a.actorId]));
  const matrix = new Map<string, Map<string, { original: number; afterCut: number }>>();

  const sceneById = new Map<string, Scene>();
  for (const act of play.acts) {
    for (const scene of act.scenes) sceneById.set(scene.id, scene);
  }

  for (const sceneId of effectiveSceneOrder) {
    const scene = sceneById.get(sceneId);
    if (!scene) continue;

    for (const unit of scene.units) {
      if (unit.type !== "speech") continue;
      const actorId = charToActor.get(unit.characterId);
      if (!actorId) continue;

      if (!matrix.has(actorId)) matrix.set(actorId, new Map());
      const actorMap = matrix.get(actorId)!;
      const existing = actorMap.get(sceneId) ?? { original: 0, afterCut: 0 };

      const isKept = (cut.cutMap[unit.id] ?? "kept") === "kept";
      let keptLines = 0;
      if (isKept) {
        keptLines = unit.lineCount;
        if (cut.lineCutMap) {
          const cutCount = unit.lines.filter((l) => cut.lineCutMap![l.id] === "cut").length;
          keptLines = Math.max(0, unit.lineCount - cutCount);
        }
      }

      actorMap.set(sceneId, {
        original: existing.original + unit.lineCount,
        afterCut: existing.afterCut + keptLines,
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

  const actorSceneMatrix = buildActorSceneMatrix(stageTime, project.actors, project.assignments);
  const actorSceneLineMatrix = buildActorSceneLineMatrix(play, activeCut, project.assignments, effectiveSceneOrder);

  function handleSetPause(afterSceneId: string, name: string, minutes: number) {
    dispatch({ type: "SET_PAUSE", afterSceneId, name, minutes });
  }

  function handleRemovePause(afterSceneId: string) {
    dispatch({ type: "REMOVE_PAUSE", afterSceneId });
  }

  const hasPauses = activeCut.pauses && Object.keys(activeCut.pauses).length > 0;
  const pauseTotal = stageTime.pauseMinutes;
  const hasCuts = stageTime.totalMinutes < stageTime.originalTotalMinutes - 0.01;

  return (
    <div className="max-w-screen-xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-stone-800 mb-1">Scene Dashboard</h1>
          <p className="text-stone-500 text-sm">
            {effectiveSceneOrder.length} scenes · {project.actors.length} actors
          </p>
        </div>

        {/* Running time summary */}
        <div className="text-right">
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

      {/* Metric tabs */}
      <div className="flex gap-1 mb-6 p-0.5 bg-stone-100 rounded-md w-fit">
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

      <div className="flex gap-8 items-start">
        {/* Matrix — takes most of the width */}
        <div className="flex-1 min-w-0">
          <div className="text-xs font-semibold text-stone-400 uppercase tracking-wider mb-3">
            Scene × Actor
          </div>
          <DashboardMatrix
            effectiveSceneOrder={effectiveSceneOrder}
            sceneById={sceneById}
            sceneActMap={sceneActMap}
            actors={project.actors}
            actorSceneMatrix={actorSceneMatrix}
            actorSceneLineMatrix={actorSceneLineMatrix}
            pauses={activeCut.pauses}
            metric={metric}
          />
        </div>

        {/* Scene list with bars + pause editor — right column */}
        <div className="w-80 shrink-0">
          <div className="text-xs font-semibold text-stone-400 uppercase tracking-wider mb-3">
            Scenes
          </div>
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
            metric={metric}
            wpm={wpm}
          />
        </div>
      </div>
    </div>
  );
}
