"use client";

import { useState } from "react";
import type { Act, Scene } from "@/types/play";
import type { LineCounts } from "@/types/cut";
import type { StageTimeResult } from "@/lib/cuts/StageTimeEngine";
import type { Actor } from "@/types/project";
import PauseRow from "./PauseRow";

interface Props {
  effectiveSceneOrder: string[];
  sceneById: Map<string, Scene>;
  sceneActMap: Map<string, Act>;
  actors: Actor[];
  actorSceneMatrix: Map<string, Map<string, { minutes: number; originalMinutes: number }>>;
  lineCounts: LineCounts;
  stageTime: StageTimeResult;
  pauses?: Record<string, { name: string; minutes: number }>;
  onSetPause: (afterSceneId: string, name: string, minutes: number) => void;
  onRemovePause: (afterSceneId: string) => void;
  onSetSceneOrder?: (newOrder: string[]) => void;
  metric: "lines" | "words" | "time";
  wpm: number;
}

function formatMinutes(m: number): string {
  if (m < 1) return `${Math.round(m * 60)}s`;
  const mins = Math.floor(m);
  const secs = Math.round((m - mins) * 60);
  return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
}

export default function SceneList({
  effectiveSceneOrder,
  sceneById,
  sceneActMap,
  actors,
  actorSceneMatrix,
  lineCounts,
  pauses,
  onSetPause,
  onRemovePause,
  onSetSceneOrder,
  metric,
  wpm,
}: Props) {
  const [dragOverSceneId, setDragOverSceneId] = useState<string | null>(null);

  // Find max value for bar scaling across all scenes
  let maxVal = 1;
  for (const sceneId of effectiveSceneOrder) {
    const sc = lineCounts.byScene[sceneId];
    if (!sc) continue;
    const orig = metric === "time"
      ? sc.words.original / wpm
      : metric === "words" ? sc.words.original : sc.lines.original;
    if (orig > maxVal) maxVal = orig;
  }

  function handleDragStart(e: React.DragEvent, sceneId: string) {
    e.dataTransfer.setData("text/plain", sceneId);
    e.dataTransfer.effectAllowed = "move";
  }

  function handleDragOver(e: React.DragEvent, sceneId: string) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverSceneId(sceneId);
  }

  function handleDragLeave() {
    setDragOverSceneId(null);
  }

  function handleDrop(e: React.DragEvent, targetSceneId: string) {
    e.preventDefault();
    setDragOverSceneId(null);
    if (!onSetSceneOrder) return;
    const draggedId = e.dataTransfer.getData("text/plain");
    if (!draggedId || draggedId === targetSceneId) return;
    const newOrder = effectiveSceneOrder.filter((id) => id !== draggedId);
    const targetIndex = newOrder.indexOf(targetSceneId);
    if (targetIndex === -1) return;
    newOrder.splice(targetIndex, 0, draggedId);
    onSetSceneOrder(newOrder);
  }

  function handleDragEnd() {
    setDragOverSceneId(null);
  }

  const canReorder = !!onSetSceneOrder;

  return (
    <div className="space-y-0">
      {canReorder && (
        <p className="text-xs text-stone-400 dark:text-stone-400 mb-3 flex items-center gap-1">
          <span>⠿</span> Drag scenes to reorder
        </p>
      )}
      {effectiveSceneOrder.map((sceneId, idx) => {
        const scene = sceneById.get(sceneId);
        const act = sceneActMap.get(sceneId);
        if (!scene || !act) return null;

        const sc = lineCounts.byScene[sceneId];
        const original = sc
          ? metric === "time" ? sc.words.original / wpm
          : metric === "words" ? sc.words.original : sc.lines.original
          : 0;
        const afterCut = sc
          ? metric === "time" ? sc.words.afterCut / wpm
          : metric === "words" ? sc.words.afterCut : sc.lines.afterCut
          : 0;

        const pctKept = original > 0 ? (afterCut / original) * 100 : 100;
        const hasCuts = afterCut < original - (metric === "time" ? 0.01 : 0.5);

        const pauseKey = `after:${sceneId}`;
        const pause = pauses?.[pauseKey];

        // Actor presence strip: actors who are on stage in this scene
        const actorPresence = actors.filter((a) => {
          const cell = actorSceneMatrix.get(a.id)?.get(sceneId);
          return cell && (cell.minutes > 0 || cell.originalMinutes > 0);
        });

        const isDragOver = dragOverSceneId === sceneId;

        return (
          <div key={sceneId}>
            <div
              className={`relative py-3 border-b border-stone-100 dark:border-stone-800 transition-colors group ${
                canReorder ? "cursor-grab" : ""
              } ${isDragOver ? "bg-amber-50 dark:bg-amber-950/30" : "hover:bg-stone-50/60 dark:hover:bg-stone-800/40"}`}
              draggable={canReorder}
              onDragStart={canReorder ? (e) => handleDragStart(e, sceneId) : undefined}
              onDragOver={canReorder ? (e) => handleDragOver(e, sceneId) : undefined}
              onDragLeave={canReorder ? handleDragLeave : undefined}
              onDrop={canReorder ? (e) => handleDrop(e, sceneId) : undefined}
              onDragEnd={canReorder ? handleDragEnd : undefined}
            >
              {/* Drop indicator */}
              {isDragOver && (
                <div className="pointer-events-none absolute -top-0.5 left-0 right-0 h-0.5 bg-amber-400 rounded-full" />
              )}

              {/* Act label + scene title + drag handle */}
              <div className="flex items-baseline gap-2 mb-1.5">
                {canReorder && (
                  <span className="opacity-0 group-hover:opacity-100 text-stone-300 dark:text-stone-600 text-xs select-none shrink-0 transition-opacity cursor-grab">
                    ⠿
                  </span>
                )}
                <span className="text-xs text-stone-400 dark:text-stone-400 shrink-0">{act.title}</span>
                <span className="text-sm font-medium text-stone-700 dark:text-stone-200 truncate">{scene.title}</span>
                <span className="ml-auto text-xs tabular-nums text-stone-500 dark:text-stone-400 shrink-0">
                  {metric === "time"
                    ? formatMinutes(afterCut)
                    : afterCut.toLocaleString()}
                  {hasCuts && (
                    <span className="text-stone-300 dark:text-stone-600 ml-1">
                      / {metric === "time" ? formatMinutes(original) : original.toLocaleString()}
                    </span>
                  )}
                </span>
              </div>

              {/* Cut bar */}
              <div className="h-1.5 bg-stone-100 dark:bg-stone-800 rounded-full overflow-hidden mb-2">
                <div
                  className={`h-full rounded-full transition-all ${hasCuts ? "bg-amber-400" : "bg-stone-300"}`}
                  style={{ width: `${Math.min(100, pctKept)}%` }}
                />
              </div>

              {/* Actor presence strip */}
              {actorPresence.length > 0 && (
                <div className="flex gap-1 flex-wrap">
                  {actorPresence.map((actor) => {
                    const cell = actorSceneMatrix.get(actor.id)?.get(sceneId);
                    return (
                      <div
                        key={actor.id}
                        className="flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full border"
                        style={{
                          borderColor: actor.color + "60",
                          backgroundColor: actor.color + "18",
                          color: actor.color,
                        }}
                        title={`${actor.name}: ${cell ? formatMinutes(cell.minutes) : "0"} on stage`}
                      >
                        <span
                          className="w-1.5 h-1.5 rounded-full shrink-0"
                          style={{ backgroundColor: actor.color }}
                        />
                        <span className="text-stone-600" style={{ color: actor.color + "cc" }}>
                          {actor.name}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <PauseRow
              afterSceneId={sceneId}
              pause={pause}
              onSet={onSetPause}
              onRemove={onRemovePause}
            />

            {/* Spacer between items (except last) */}
            {idx < effectiveSceneOrder.length - 1 && pause && (
              <div className="h-1" />
            )}
          </div>
        );
      })}
    </div>
  );
}
