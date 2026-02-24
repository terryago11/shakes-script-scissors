"use client";

import { useState } from "react";
import type { Act } from "@/types/play";
import type { Actor, ActorAssignment } from "@/types/project";
import type { ScriptUnitWithStatus, LineCounts } from "@/types/cut";
import type { SpeechEdit } from "@/types/edit";
import { useMetric } from "@/lib/ui/MetricContext";
import SceneBlock from "./SceneBlock";

interface Props {
  act: Act;
  unitsByScene: Map<string, ScriptUnitWithStatus[]>;
  assignments: ActorAssignment[];
  actors: Actor[];
  onToggle: ((unitId: string) => void) | null;
  speechEdits?: Record<string, SpeechEdit>;
  onClearEdits?: (unitId: string) => void;
  filteredCharacterIds?: Set<string>;
  cutModeActive?: boolean;
  lineCounts?: LineCounts;
  sceneOrder: string[];
  focusedSceneId: string | null;
  onFocusScene: (sceneId: string) => void;
  onSceneReorder: (newOrder: string[]) => void;
}

export default function ActBlock({
  act, unitsByScene, assignments, actors, onToggle, speechEdits, onClearEdits,
  filteredCharacterIds, cutModeActive, lineCounts,
  sceneOrder, focusedSceneId, onFocusScene, onSceneReorder,
}: Props) {
  const [collapsed, setCollapsed] = useState(false);
  // Generation increments each time act collapses → SceneBlocks remount in collapsed state
  const [generation, setGeneration] = useState(0);
  const [dragOverSceneId, setDragOverSceneId] = useState<string | null>(null);
  const { metric } = useMetric();

  // If a scene is focused and it's not in this act, hide the entire act
  if (focusedSceneId && !act.scenes.some((s) => s.id === focusedSceneId)) {
    return null;
  }

  function handleToggle() {
    if (!collapsed) {
      setGeneration((g) => g + 1);
    }
    setCollapsed((c) => !c);
  }

  const actCounts = lineCounts?.byAct[act.id];
  const counts = actCounts
    ? metric === "lines" ? actCounts.lines : actCounts.words
    : null;
  const pctCut = counts && counts.original > 0
    ? Math.round((1 - counts.afterCut / counts.original) * 100)
    : 0;

  // Sort act's scenes by sceneOrder; scenes absent from sceneOrder go at end
  const sortedScenes = [...act.scenes].sort((a, b) => {
    const ai = sceneOrder.indexOf(a.id);
    const bi = sceneOrder.indexOf(b.id);
    const aPos = ai === -1 ? Infinity : ai;
    const bPos = bi === -1 ? Infinity : bi;
    return aPos - bPos;
  });

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
    const draggedId = e.dataTransfer.getData("text/plain");
    if (!draggedId || draggedId === targetSceneId) return;

    // Build new order: move draggedId to just before targetSceneId
    // Start from current full sceneOrder (all scenes across all acts)
    const newOrder = sceneOrder.filter((id) => id !== draggedId);
    const targetIndex = newOrder.indexOf(targetSceneId);
    if (targetIndex === -1) return;
    newOrder.splice(targetIndex, 0, draggedId);
    onSceneReorder(newOrder);
  }

  function handleDragEnd() {
    setDragOverSceneId(null);
  }

  return (
    <div className="mb-8">
      <button
        onClick={handleToggle}
        className="flex items-center gap-2 w-full text-left mb-3 group"
      >
        <span className="text-xs text-stone-400 group-hover:text-stone-600">
          {collapsed ? "▶" : "▼"}
        </span>
        <h2 className="text-lg font-bold text-stone-700 uppercase tracking-wide">
          {act.title}
        </h2>
        {counts && (
          <span className="ml-2 text-xs text-stone-400 tabular-nums font-normal normal-case tracking-normal flex items-center gap-1">
            {counts.original !== counts.afterCut ? (
              <>
                <span className="text-amber-600 font-medium">{counts.afterCut.toLocaleString()}</span>
                <span className="text-stone-300">/ {counts.original.toLocaleString()}</span>
              </>
            ) : (
              <span>{counts.afterCut.toLocaleString()}</span>
            )}
            {pctCut > 0 && (
              <span className="text-amber-500 font-medium">−{pctCut}%</span>
            )}
            <span className="text-stone-300">{metric}</span>
          </span>
        )}
      </button>

      {!collapsed && (
        <div className="space-y-6">
          {sortedScenes.map((scene) => (
            <SceneBlock
              key={`${scene.id}-${generation}`}
              scene={scene}
              units={unitsByScene.get(scene.id) || []}
              assignments={assignments}
              actors={actors}
              onToggle={onToggle}
              speechEdits={speechEdits}
              onClearEdits={onClearEdits}
              filteredCharacterIds={filteredCharacterIds}
              cutModeActive={cutModeActive}
              sceneCounts={lineCounts?.byScene[scene.id]}
              focusedSceneId={focusedSceneId}
              onFocusScene={onFocusScene}
              isDragOver={dragOverSceneId === scene.id}
              onDragStart={(e) => handleDragStart(e, scene.id)}
              onDragOver={(e) => handleDragOver(e, scene.id)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, scene.id)}
              onDragEnd={handleDragEnd}
            />
          ))}
        </div>
      )}
    </div>
  );
}
