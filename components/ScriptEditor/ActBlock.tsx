"use client";

import { useState } from "react";
import type { Act } from "@/types/play";
import type { Actor, ActorAssignment } from "@/types/project";
import type { ScriptUnitWithStatus } from "@/types/cut";
import type { SpeechEdit, EditOp } from "@/types/edit";
import SceneBlock from "./SceneBlock";

interface Props {
  act: Act;
  unitsByScene: Map<string, ScriptUnitWithStatus[]>;
  assignments: ActorAssignment[];
  actors: Actor[];
  onToggle: ((unitId: string) => void) | null;
  onToggleLine?: (lineId: string) => void;
  speechEdits?: Record<string, SpeechEdit>;
  onAddEditOp?: (unitId: string, op: EditOp) => void;
  onRemoveEditOp?: (unitId: string, lineId: string, start: number, end: number) => void;
  onClearEdits?: (unitId: string) => void;
  filteredCharacterIds?: Set<string>;
}

export default function ActBlock({ act, unitsByScene, assignments, actors, onToggle, onToggleLine, speechEdits, onAddEditOp, onRemoveEditOp, onClearEdits, filteredCharacterIds }: Props) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="mb-8">
      <button
        onClick={() => setCollapsed((c) => !c)}
        className="flex items-center gap-2 w-full text-left mb-3 group"
      >
        <span className="text-xs text-stone-400 group-hover:text-stone-600">
          {collapsed ? "▶" : "▼"}
        </span>
        <h2 className="text-lg font-bold text-stone-700 uppercase tracking-wide">
          {act.title}
        </h2>
      </button>

      {!collapsed && (
        <div className="space-y-6">
          {act.scenes.map((scene) => (
            <SceneBlock
              key={scene.id}
              scene={scene}
              units={unitsByScene.get(scene.id) || []}
              assignments={assignments}
              actors={actors}
              onToggle={onToggle}
              onToggleLine={onToggleLine}
              speechEdits={speechEdits}
              onAddEditOp={onAddEditOp}
              onRemoveEditOp={onRemoveEditOp}
              onClearEdits={onClearEdits}
              filteredCharacterIds={filteredCharacterIds}
            />
          ))}
        </div>
      )}
    </div>
  );
}
