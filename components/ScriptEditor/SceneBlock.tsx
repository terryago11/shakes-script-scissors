"use client";

import { useState } from "react";
import type { Character, Scene } from "@/types/play";
import type { Actor, ActorAssignment } from "@/types/project";
import type { ScriptUnitWithStatus, SceneCounts } from "@/types/cut";
import type { SpeechEdit } from "@/types/edit";
import { useMetric } from "@/lib/ui/MetricContext";
import { useViewMode } from "@/lib/ui/ViewModeContext";
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
  // Scene focus (used by ActBlock to filter visible scenes)
  focusedSceneId: string | null;
  /** When true, render all content as original (no cuts/edits applied) — for diff side-by-side */
  showOriginal?: boolean;
  /** unitId → characterId reassignments */
  speechReassignments?: Record<string, string>;
  /** Character IDs that appear in at least one kept entrance SD */
  charsWithEntrance?: Set<string>;
  onReassign?: (unitId: string, characterId: string | null) => void;
}

export default function SceneBlock({
  scene, units, assignments, actors, castList, onToggle, speechEdits, onClearEdits,
  filteredCharacterIds, cutModeActive, sceneCounts,
  focusedSceneId, showOriginal,
  speechReassignments, charsWithEntrance, onReassign,
}: Props) {
  // Default to collapsed so after act re-expand, scenes are collapsed and user can pick
  const [collapsed, setCollapsed] = useState(false);
  const { metric, wpm } = useMetric();

  function fmtMins(m: number): string {
    const r = Math.round(m);
    if (r < 60) return `${r}m`;
    return `${Math.floor(r / 60)}h ${r % 60}m`;
  }
  const { viewMode } = useViewMode();

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
    ? metric === "lines" ? sceneCounts.lines
    : metric === "words" ? sceneCounts.words
    : null
    : null;
  const timeMins = metric === "time" && sceneCounts?.words
    ? { afterCut: sceneCounts.words.afterCut / wpm, original: sceneCounts.words.original / wpm }
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
  const displayKept = showOriginal ? displayOriginal : (counts ? counts.afterCut : fallbackKept);
  const pctCut = displayOriginal > 0
    ? Math.round((1 - displayKept / displayOriginal) * 100)
    : 0;
  const isFullyCut = !showOriginal && displayOriginal > 0 && displayKept === 0;

  // Continuation detection — when showOriginal, treat all units as kept
  const continuationIds = new Set<string>();
  let lastSpeakerId: string | null = null;
  for (const { unit, status } of units) {
    if (unit.type === "speech") {
      const isKept = showOriginal ? true : status === "kept";
      if (isKept) {
        if (lastSpeakerId === unit.characterId) continuationIds.add(unit.id);
        lastSpeakerId = unit.characterId;
      }
    }
  }

  // Whether any unit in the scene has cuts (speech-level or word-level)
  const hasAnyCuts = !showOriginal && units.some(({ unit, status }) =>
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
    <div
      id={`scene-${scene.id}`}
      className={`border rounded-lg transition-colors ${
        isFullyCut ? "border-stone-200 bg-stone-50" : "border-stone-100 bg-white"
      }`}
    >
      {/* Header row: collapse button + restore-all + focus */}
      <div className={`group flex items-center rounded-lg ${isFullyCut ? "opacity-50" : ""}`}>
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
          {!showOriginal && (
            <span className="ml-auto text-xs text-stone-400 tabular-nums flex items-center gap-1.5">
              {timeMins ? (
                <>
                  <span className={timeMins.afterCut < timeMins.original - 0.01 ? "text-amber-600 font-medium" : ""}>
                    {fmtMins(timeMins.afterCut)}
                  </span>
                  {timeMins.afterCut < timeMins.original - 0.01 && (
                    <span className="text-stone-300">/ {fmtMins(timeMins.original)}</span>
                  )}
                </>
              ) : (
                <>
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
                </>
              )}
            </span>
          )}
        </button>

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
                  status={showOriginal ? "kept" : status}
                  actorColor={charColor[unit.characterId]}
                  onToggle={showOriginal ? null : (onToggle ? () => onToggle(unit.id) : null)}
                  lineStatuses={showOriginal ? undefined : lineStatuses}
                  speechEdit={showOriginal ? undefined : speechEdits?.[unit.id]}
                  onClearEdits={showOriginal ? undefined : onClearEdits}
                  isContinuation={continuationIds.has(unit.id)}
                  cutModeActive={showOriginal ? false : cutModeActive}
                  castList={castList}
                  speechReassignment={showOriginal ? undefined : (speechReassignments?.[unit.id] ?? null)}
                  charsWithEntrance={charsWithEntrance}
                  onReassign={showOriginal ? undefined : onReassign}
                />
              );
            } else {
              if (isFiltering) return null;
              // In clean mode, hide cut SDs — but not when showOriginal (we want all in original column)
              if (status === "cut" && viewMode === "clean" && !showOriginal) return null;
              return (
                <StageDirectionBlock
                  key={unit.id}
                  stage={unit}
                  status={showOriginal ? "kept" : status}
                  onToggle={showOriginal ? null : (onToggle ? () => onToggle(unit.id) : null)}
                  castList={castList}
                />
              );
            }
          })}
        </div>
      )}
    </div>
  );
}
