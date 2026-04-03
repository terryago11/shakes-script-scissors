"use client";

import React, { useState } from "react";
import type { Act, Character, Scene } from "@/types/play";
import type { Actor, ActorAssignment } from "@/types/project";
import type { ScriptUnitWithStatus, LineCounts } from "@/types/cut";
import type { SpeechEdit } from "@/types/edit";
import type { Insertion } from "@/types/insertion";
import { useMetric } from "@/lib/ui/MetricContext";
import { useViewMode } from "@/lib/ui/ViewModeContext";
import SceneBlock from "./SceneBlock";
import PauseIndicator from "./PauseIndicator";

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
  lineCounts?: LineCounts;
  focusedSceneId: string | null;
  /** When true, render all content as original (no cuts/edits applied) — for diff side-by-side */
  showOriginal?: boolean;
  /** Named pauses keyed by "after:{sceneId}" — shown between SceneBlocks */
  pauses?: Record<string, { name: string; minutes: number }>;
  /** unitId → speaker override list for line count attribution */
  speechReassignments?: Record<string, string[]>;
  /** Character IDs that appear in at least one kept entrance SD */
  charsWithEntrance?: Set<string>;
  onReassign?: (unitId: string, characterIds: string[] | null) => void;
  /** Cut-level character display-name aliases */
  characterAliases?: Record<string, string>;
  /** stageId → effective character list overrides; passed down to SceneBlock for SD Auto-fill */
  stageDirectionEdits?: Record<string, string[]>;
  /** unitId → split params — passed down to SceneBlock to derive splitRole on each SpeechBlock */
  speechSplits?: Record<string, { splitAtLineIndex: number; newCharacterId?: string }>;
  onSplit?: (unitId: string, atLineIndex: number, atWordOffset?: number) => void;
  onMerge?: (unitId: string, part2LineIds: string[]) => void;
  /** All insertions for the active cut — forwarded to SceneBlock */
  insertions?: Record<string, Insertion>;
  onAddInsertion?: (insertion: Insertion) => void;
  onRemoveInsertion?: (insertionId: string, lineIds: string[]) => void;
  /** All inserted SDs for the active cut — forwarded to SceneBlock */
  insertedSDs?: Record<string, import("@/types/insertedsd").InsertedSD>;
  /** Called when at least one unit is restored in a scene */
  onRestoreScene?: () => void;
}

export default function ActBlock({
  act, scenes, unitsByScene, assignments, actors, castList, onToggle, speechEdits, onClearEdits,
  filteredCharacterIds, lineCounts,
  focusedSceneId, showOriginal, pauses,
  speechReassignments, charsWithEntrance, onReassign,
  characterAliases, stageDirectionEdits,
  speechSplits, onSplit, onMerge,
  insertions, onAddInsertion, onRemoveInsertion,
  insertedSDs,
  onRestoreScene,
}: Props) {
  const [collapsed, setCollapsed] = useState(false);
  // Generation increments each time act collapses → SceneBlocks remount in collapsed state
  const [generation, setGeneration] = useState(0);
  const { metric, wpm } = useMetric();
  const { viewMode } = useViewMode();
  const isClean = viewMode === "clean";

  function fmtMins(m: number): string {
    const r = Math.round(m);
    if (r < 60) return `${r}m`;
    return `${Math.floor(r / 60)}h ${r % 60}m`;
  }

  // Filter scenes: focus mode wins; then filter by character if active
  const displayScenes = focusedSceneId
    ? scenes.filter((s) => s.id === focusedSceneId)
    : filteredCharacterIds && filteredCharacterIds.size > 0
      ? scenes.filter((s) => {
          const sceneUnits = unitsByScene.get(s.id) ?? [];
          return sceneUnits.some(
            (u) => u.unit.type === "speech" && filteredCharacterIds.has(u.unit.characterId)
          );
        })
      : scenes;

  // Hide act entirely if no scenes to show
  if (displayScenes.length === 0) return null;

  function handleToggle() {
    if (!collapsed) {
      setGeneration((g) => g + 1);
    }
    setCollapsed((c) => !c);
  }

  const actCounts = lineCounts?.byAct[act.id];
  const counts = actCounts
    ? metric === "lines" ? actCounts.lines
    : metric === "words" ? actCounts.words
    : null
    : null;
  const timeMins = metric === "time" && actCounts?.words
    ? { afterCut: actCounts.words.afterCut / wpm, original: actCounts.words.original / wpm }
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
        <span className="text-xs text-stone-400 dark:text-stone-400 group-hover:text-stone-600 dark:group-hover:text-stone-300">
          {collapsed ? "▶" : "▼"}
        </span>
        <h2 className="text-lg font-bold text-stone-700 dark:text-stone-200 uppercase tracking-wide">
          {act.divType === "prologue" ? "PROLOGUE"
            : act.divType === "epilogue" ? "EPILOGUE"
            : act.divType === "induction" ? "INDUCTION"
            : act.title}
        </h2>
        {(counts || timeMins) && !showOriginal && (
          <span className="ml-2 text-xs text-stone-400 dark:text-stone-400 tabular-nums font-normal normal-case tracking-normal flex items-center gap-1">
            {timeMins ? (
              <>
                <span className={timeMins.afterCut < timeMins.original - 0.01 ? "text-amber-600 font-medium" : ""}>
                  {fmtMins(timeMins.afterCut)}
                </span>
                {!isClean && timeMins.afterCut < timeMins.original - 0.01 && (
                  <span className="text-stone-300 dark:text-stone-600">/ {fmtMins(timeMins.original)}</span>
                )}
                <span className="text-stone-300 dark:text-stone-600">@ {wpm}wpm</span>
              </>
            ) : (
              <>
                {counts!.original !== counts!.afterCut ? (
                  <>
                    <span className="text-amber-600 font-medium">{counts!.afterCut.toLocaleString()}</span>
                    {!isClean && (
                      <span className="text-stone-300 dark:text-stone-600">/ {counts!.original.toLocaleString()}</span>
                    )}
                  </>
                ) : (
                  <span>{counts!.afterCut.toLocaleString()}</span>
                )}
                {!isClean && pctCut > 0 && (
                  <span className="text-amber-500 font-medium">−{pctCut}%</span>
                )}
                <span className="text-stone-300 dark:text-stone-600">{metric}</span>
              </>
            )}
          </span>
        )}
      </button>

      {!collapsed && (
        <div className="space-y-6">
          {displayScenes.map((scene) => {
            const pauseEntry = !showOriginal ? pauses?.[`after:${scene.id}`] : undefined;
            return (
              <React.Fragment key={`${scene.id}-${generation}`}>
                <SceneBlock
                  scene={scene}
                  units={unitsByScene.get(scene.id) || []}
                  assignments={assignments}
                  actors={actors}
                  castList={castList}
                  onToggle={showOriginal ? null : onToggle}
                  speechEdits={showOriginal ? undefined : speechEdits}
                  onClearEdits={showOriginal ? undefined : onClearEdits}
                  filteredCharacterIds={filteredCharacterIds}
                  sceneCounts={showOriginal ? undefined : lineCounts?.byScene[scene.id]}
                  focusedSceneId={focusedSceneId}
                  showOriginal={showOriginal}
                  speechReassignments={showOriginal ? undefined : speechReassignments}
                  charsWithEntrance={charsWithEntrance}
                  onReassign={showOriginal ? undefined : onReassign}
                  characterAliases={showOriginal ? undefined : characterAliases}
                  stageDirectionEdits={showOriginal ? undefined : stageDirectionEdits}
                  speechSplits={showOriginal ? undefined : speechSplits}
                  onSplit={showOriginal ? undefined : onSplit}
                  onMerge={showOriginal ? undefined : onMerge}
                  insertions={showOriginal ? undefined : insertions}
                  onAddInsertion={showOriginal ? undefined : onAddInsertion}
                  onRemoveInsertion={showOriginal ? undefined : onRemoveInsertion}
                  insertedSDs={showOriginal ? undefined : insertedSDs}
                  onRestoreScene={showOriginal ? undefined : onRestoreScene}
                />
                {pauseEntry && (
                  <PauseIndicator name={pauseEntry.name} minutes={pauseEntry.minutes} />
                )}
              </React.Fragment>
            );
          })}
        </div>
      )}
    </div>
  );
}
