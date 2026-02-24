"use client";

import { useState } from "react";
import type { Scene } from "@/types/play";
import type { Actor, ActorAssignment } from "@/types/project";
import type { ScriptUnitWithStatus } from "@/types/cut";
import type { SpeechEdit, EditOp } from "@/types/edit";
import SpeechBlock from "./SpeechBlock";
import StageDirectionBlock from "./StageDirectionBlock";

interface Props {
  scene: Scene;
  units: ScriptUnitWithStatus[];
  assignments: ActorAssignment[];
  actors: Actor[];
  onToggle: ((unitId: string) => void) | null;
  onToggleLine?: (lineId: string) => void;
  speechEdits?: Record<string, SpeechEdit>;
  onAddEditOp?: (unitId: string, op: EditOp) => void;
  onRemoveEditOp?: (unitId: string, lineId: string, start: number, end: number) => void;
  onClearEdits?: (unitId: string) => void;
  filteredCharacterIds?: Set<string>;
  cutModeActive?: boolean;
}

export default function SceneBlock({ scene, units, assignments, actors, onToggle, onToggleLine, speechEdits, onAddEditOp, onRemoveEditOp, onClearEdits, filteredCharacterIds, cutModeActive }: Props) {
  const [collapsed, setCollapsed] = useState(false);

  // Line count badge — respect line-level cuts
  const totalLines = units
    .filter((u) => u.unit.type === "speech")
    .reduce((sum, u) => sum + (u.unit.type === "speech" ? u.unit.lineCount : 0), 0);
  const keptLines = units
    .filter((u) => u.unit.type === "speech" && u.status === "kept")
    .reduce((sum, u) => {
      if (u.unit.type !== "speech") return sum;
      // If there are per-line statuses, count only kept lines
      if (u.lineStatuses) {
        return sum + u.lineStatuses.filter((ls) => ls.status === "kept").length;
      }
      return sum + u.unit.lineCount;
    }, 0);

  // Build charId → actor color lookup
  const charColor: Record<string, string> = {};
  for (const a of assignments) {
    const actor = actors.find((ac) => ac.id === a.actorId);
    if (actor) charColor[a.characterId] = actor.color;
  }

  // When filtering, skip scenes with no matching speeches
  if (filteredCharacterIds && filteredCharacterIds.size > 0) {
    const hasMatch = units.some(
      (u) => u.unit.type === "speech" && filteredCharacterIds.has(u.unit.characterId)
    );
    if (!hasMatch) return null;
  }

  const isFullyCut = totalLines > 0 && keptLines === 0;

  // Continuation detection: for each kept Speech, is the previous kept Speech
  // by the same character? (intervening cut units don't break continuity)
  const continuationIds = new Set<string>();
  let lastKeptCharId: string | null = null;
  for (const { unit, status } of units) {
    if (unit.type === "speech") {
      if (status === "kept") {
        if (lastKeptCharId === unit.characterId) {
          continuationIds.add(unit.id);
        }
        lastKeptCharId = unit.characterId;
      }
      // cut speeches don't update lastKeptCharId — continuity skips over them
    }
    // stage directions don't break continuity
  }

  return (
    <div id={`scene-${scene.id}`} className={`border rounded-lg ${isFullyCut ? "border-stone-200 bg-stone-50" : "border-stone-100 bg-white"}`}>
      <button
        onClick={() => setCollapsed((c) => !c)}
        className={`flex items-center gap-3 w-full text-left px-4 py-3 hover:bg-stone-50 rounded-lg ${isFullyCut ? "opacity-50" : ""}`}
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
        <span className="ml-auto text-xs text-stone-400 tabular-nums">
          {keptLines === totalLines ? (
            <span>{totalLines.toLocaleString()} lines</span>
          ) : (
            <span>
              <span className="text-amber-600 font-medium">{keptLines.toLocaleString()}</span>
              <span className="text-stone-300"> / {totalLines.toLocaleString()}</span>
            </span>
          )}
        </span>
      </button>

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
                  onToggleLine={onToggleLine ?? null}
                  lineStatuses={lineStatuses}
                  speechEdit={speechEdits?.[unit.id]}
                  onAddEditOp={onAddEditOp}
                  onRemoveEditOp={onRemoveEditOp}
                  onClearEdits={onClearEdits}
                  isContinuation={continuationIds.has(unit.id)}
                  cutModeActive={cutModeActive}
                />
              );
            } else {
              if (isFiltering) return null; // hide stage directions when filtering
              return (
                <StageDirectionBlock
                  key={unit.id}
                  stage={unit}
                  status={status}
                  onToggle={onToggle ? () => onToggle(unit.id) : null}
                />
              );
            }
          })}
        </div>
      )}
    </div>
  );
}
