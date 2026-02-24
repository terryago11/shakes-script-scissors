"use client";

import { useState } from "react";
import type { Act, Character, Scene } from "@/types/play";
import type { Actor, ActorAssignment } from "@/types/project";
import type { ScriptUnitWithStatus, LineCounts } from "@/types/cut";
import type { SpeechEdit } from "@/types/edit";
import { useMetric } from "@/lib/ui/MetricContext";
import SceneBlock from "./SceneBlock";

interface Props {
  act: Act;
  /** Pre-ordered scenes to render (may be a subset for cross-act reordering) */
  scenes: Scene[];
  unitsByScene: Map<string, ScriptUnitWithStatus[]>;
  assignments: ActorAssignment[];
  actors: Actor[];
  castList: Character[];
  onToggle: ((unitId: string) => void) | null;
  speechEdits?: Record<string, SpeechEdit>;
  onClearEdits?: (unitId: string) => void;
  filteredCharacterIds?: Set<string>;
  cutModeActive?: boolean;
  lineCounts?: LineCounts;
  focusedSceneId: string | null;
  onFocusScene: (sceneId: string) => void;
  // Drag state/handlers lifted to ScriptEditor
  dragOverSceneId: string | null;
  onDragStartScene: (e: React.DragEvent, sceneId: string) => void;
  onDragOverScene: (e: React.DragEvent, sceneId: string) => void;
  onDragLeaveScene: () => void;
  onDropScene: (e: React.DragEvent, sceneId: string) => void;
  onDragEndScene: () => void;
}

export default function ActBlock({
  act, scenes, unitsByScene, assignments, actors, castList, onToggle, speechEdits, onClearEdits,
  filteredCharacterIds, cutModeActive, lineCounts,
  focusedSceneId, onFocusScene,
  dragOverSceneId, onDragStartScene, onDragOverScene, onDragLeaveScene, onDropScene, onDragEndScene,
}: Props) {
  const [collapsed, setCollapsed] = useState(false);
  // Generation increments each time act collapses → SceneBlocks remount in collapsed state
  const [generation, setGeneration] = useState(0);
  const { metric } = useMetric();

  // If a scene is focused and it's not in this group, hide the entire act block
  if (focusedSceneId && !scenes.some((s) => s.id === focusedSceneId)) {
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
          {scenes.map((scene) => (
            <SceneBlock
              key={`${scene.id}-${generation}`}
              scene={scene}
              units={unitsByScene.get(scene.id) || []}
              assignments={assignments}
              actors={actors}
              castList={castList}
              onToggle={onToggle}
              speechEdits={speechEdits}
              onClearEdits={onClearEdits}
              filteredCharacterIds={filteredCharacterIds}
              cutModeActive={cutModeActive}
              sceneCounts={lineCounts?.byScene[scene.id]}
              focusedSceneId={focusedSceneId}
              onFocusScene={onFocusScene}
              isDragOver={dragOverSceneId === scene.id}
              onDragStart={(e) => onDragStartScene(e, scene.id)}
              onDragOver={(e) => onDragOverScene(e, scene.id)}
              onDragLeave={onDragLeaveScene}
              onDrop={(e) => onDropScene(e, scene.id)}
              onDragEnd={onDragEndScene}
            />
          ))}
        </div>
      )}
    </div>
  );
}
