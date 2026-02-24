"use client";

import { useState } from "react";
import type { Character, Scene } from "@/types/play";
import type { Actor, ActorAssignment } from "@/types/project";
import type { ScriptUnitWithStatus, SceneCounts } from "@/types/cut";
import type { SpeechEdit } from "@/types/edit";
import { useMetric } from "@/lib/ui/MetricContext";
import SpeechBlock from "./SpeechBlock";
import StageDirectionBlock from "./StageDirectionBlock";

interface Props {
  scene: Scene;
  units: ScriptUnitWithStatus[];
  assignments: ActorAssignment[];
  actors: Actor[];
  castList: Character[];
  onToggle: ((unitId: string) => void) | null;
  speechEdits?: Record<string, SpeechEdit>;
  onClearEdits?: (unitId: string) => void;
  filteredCharacterIds?: Set<string>;
  cutModeActive?: boolean;
  sceneCounts?: SceneCounts;
  // Scene focus
  focusedSceneId: string | null;
  onFocusScene: (sceneId: string) => void;
  // Drag-and-drop reorder
  isDragOver?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDragLeave?: () => void;
  onDrop?: (e: React.DragEvent) => void;
  onDragEnd?: () => void;
}

export default function SceneBlock({
  scene, units, assignments, actors, castList, onToggle, speechEdits, onClearEdits,
  filteredCharacterIds, cutModeActive, sceneCounts,
  focusedSceneId, onFocusScene,
  isDragOver, onDragStart, onDragOver, onDragLeave, onDrop, onDragEnd,
}: Props) {
  // Default to collapsed so after act re-expand, scenes are collapsed and user can pick
  const [collapsed, setCollapsed] = useState(false);
  const { metric } = useMetric();

  const charColor: Record<string, string> = {};
  for (const a of assignments) {
    const actor = actors.find((ac) => ac.id === a.actorId);
    if (actor) charColor[a.characterId] = actor.color;
  }

  if (filteredCharacterIds && filteredCharacterIds.size > 0) {
    const hasMatch = units.some(
      (u) => u.unit.type === "speech" && filteredCharacterIds.has(u.unit.characterId)
    );
    if (!hasMatch) return null;
  }

  // Counts — prefer sceneCounts (from CutEngine) for word-mode accuracy
  const counts = sceneCounts
    ? metric === "lines" ? sceneCounts.lines : sceneCounts.words
    : null;

  // Fallback: compute line counts from units (always available)
  const fallbackTotal = units
    .filter((u) => u.unit.type === "speech")
    .reduce((sum, u) => sum + (u.unit.type === "speech" ? u.unit.lineCount : 0), 0);
  const fallbackKept = units
    .filter((u) => u.unit.type === "speech" && u.status === "kept")
    .reduce((sum, u) => {
      if (u.unit.type !== "speech") return sum;
      if (u.lineStatuses) return sum + u.lineStatuses.filter((ls) => ls.status === "kept").length;
      return sum + u.unit.lineCount;
    }, 0);

  const displayOriginal = counts ? counts.original : fallbackTotal;
  const displayKept = counts ? counts.afterCut : fallbackKept;
  const pctCut = displayOriginal > 0
    ? Math.round((1 - displayKept / displayOriginal) * 100)
    : 0;
  const isFullyCut = displayOriginal > 0 && displayKept === 0;

  // Continuation detection
  const continuationIds = new Set<string>();
  let lastKeptCharId: string | null = null;
  for (const { unit, status } of units) {
    if (unit.type === "speech") {
      if (status === "kept") {
        if (lastKeptCharId === unit.characterId) continuationIds.add(unit.id);
        lastKeptCharId = unit.characterId;
      }
    }
  }

  // Whether any unit in the scene has cuts (speech-level or word-level)
  const hasAnyCuts = units.some(({ unit, status }) =>
    status === "cut" ||
    (unit.type === "speech" && speechEdits?.[unit.id]?.ops.length)
  );

  function handleRestoreAll(e: React.MouseEvent) {
    e.stopPropagation();
    for (const { unit, status } of units) {
      if (status === "cut") onToggle?.(unit.id);
    }
    if (onClearEdits && speechEdits) {
      for (const { unit } of units) {
        if (unit.type === "speech" && speechEdits[unit.id]?.ops.length) {
          onClearEdits(unit.id);
        }
      }
    }
  }

  return (
    <div className="relative">
      {isDragOver && (
        <div className="pointer-events-none absolute -top-3 left-0 right-0 h-0.5 bg-amber-400 z-10 rounded-full" />
      )}
      <div
        id={`scene-${scene.id}`}
        draggable={!cutModeActive}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onDragEnd={onDragEnd}
        className={`border rounded-lg transition-colors ${
          isFullyCut ? "border-stone-200 bg-stone-50" : "border-stone-100 bg-white"
        }`}
      >
      {/* Header row: drag handle + collapse button + restore-all + focus (separate so buttons don't nest) */}
      <div className={`group flex items-center rounded-lg ${isFullyCut ? "opacity-50" : ""}`}>
        {/* Drag handle */}
        {!cutModeActive && (
          <div
            className="opacity-0 group-hover:opacity-100 pl-2 py-3 cursor-grab text-stone-300 hover:text-stone-500 select-none shrink-0 transition-opacity"
            title="Drag to reorder scene"
          >
            ⠿
          </div>
        )}
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="flex items-center gap-3 flex-1 text-left px-4 py-3 hover:bg-stone-50 rounded-lg"
        >
          <span className="text-xs text-stone-400">{collapsed ? "▶" : "▼"}</span>
          <span className={`font-semibold text-sm ${isFullyCut ? "text-stone-400 line-through" : "text-stone-600"}`}>
            {scene.title}
          </span>
          {isFullyCut && (
            <span className="text-xs text-stone-400 bg-stone-200 px-1.5 py-0.5 rounded font-normal">
              fully cut
            </span>
          )}
          <span className="ml-auto text-xs text-stone-400 tabular-nums flex items-center gap-1.5">
            {displayKept === displayOriginal ? (
              <span>{displayOriginal.toLocaleString()}</span>
            ) : (
              <>
                <span className="text-amber-600 font-medium">{displayKept.toLocaleString()}</span>
                <span className="text-stone-300">/ {displayOriginal.toLocaleString()}</span>
              </>
            )}
            {pctCut > 0 && (
              <span className="text-amber-500 font-medium">−{pctCut}%</span>
            )}
            <span className="text-stone-300">{metric}</span>
          </span>
        </button>

        {/* Focus this scene */}
        {!focusedSceneId && !cutModeActive && (
          <button
            onClick={(e) => { e.stopPropagation(); onFocusScene(scene.id); }}
            className="opacity-0 group-hover:opacity-100 mr-1 text-xs px-2 py-0.5 rounded border border-stone-200 text-stone-400 hover:bg-stone-100 hover:text-stone-600 transition-all shrink-0"
            title="Show only this scene"
          >
            Focus
          </button>
        )}

        {/* Restore all — only when there are cuts, shown on group hover */}
        {hasAnyCuts && onToggle && !cutModeActive && (
          <button
            onClick={handleRestoreAll}
            className="opacity-0 group-hover:opacity-100 mr-3 text-xs px-2 py-0.5 rounded border border-green-200 bg-green-50 text-green-700 hover:bg-green-100 hover:border-green-300 transition-all shrink-0"
            title="Restore all cuts in this scene"
          >
            ↩ restore all
          </button>
        )}
      </div>

      {!collapsed && (
        <div className="px-4 pb-4 space-y-0.5">
          {units.map(({ unit, status, lineStatuses }) => {
            const isFiltering = filteredCharacterIds && filteredCharacterIds.size > 0;
            if (unit.type === "speech") {
              if (isFiltering && !filteredCharacterIds!.has(unit.characterId)) return null;
              return (
                <SpeechBlock
                  key={unit.id}
                  speech={unit}
                  status={status}
                  actorColor={charColor[unit.characterId]}
                  onToggle={onToggle ? () => onToggle(unit.id) : null}
                  lineStatuses={lineStatuses}
                  speechEdit={speechEdits?.[unit.id]}
                  onClearEdits={onClearEdits}
                  isContinuation={continuationIds.has(unit.id)}
                  cutModeActive={cutModeActive}
                />
              );
            } else {
              if (isFiltering) return null;
              return (
                <StageDirectionBlock
                  key={unit.id}
                  stage={unit}
                  status={status}
                  onToggle={onToggle ? () => onToggle(unit.id) : null}
                  castList={castList}
                />
              );
            }
          })}
        </div>
      )}
      </div>
    </div>
  );
}
