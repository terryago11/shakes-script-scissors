"use client";

import { useState } from "react";
import type { Scene } from "@/types/play";
import type { Actor, ActorAssignment } from "@/types/project";
import type { ScriptUnitWithStatus } from "@/types/cut";
import SpeechBlock from "./SpeechBlock";
import StageDirectionBlock from "./StageDirectionBlock";

interface Props {
  scene: Scene;
  units: ScriptUnitWithStatus[];
  assignments: ActorAssignment[];
  actors: Actor[];
  onToggle: ((unitId: string) => void) | null;
}

export default function SceneBlock({ scene, units, assignments, actors, onToggle }: Props) {
  const [collapsed, setCollapsed] = useState(false);

  // Line count badge
  const totalLines = units
    .filter((u) => u.unit.type === "speech")
    .reduce((sum, u) => sum + (u.unit.type === "speech" ? u.unit.lineCount : 0), 0);
  const keptLines = units
    .filter((u) => u.unit.type === "speech" && u.status === "kept")
    .reduce((sum, u) => sum + (u.unit.type === "speech" ? u.unit.lineCount : 0), 0);

  // Build charId → actor color lookup
  const charColor: Record<string, string> = {};
  for (const a of assignments) {
    const actor = actors.find((ac) => ac.id === a.actorId);
    if (actor) charColor[a.characterId] = actor.color;
  }

  return (
    <div className="border border-stone-100 rounded-lg bg-white">
      <button
        onClick={() => setCollapsed((c) => !c)}
        className="flex items-center gap-3 w-full text-left px-4 py-3 hover:bg-stone-50 rounded-lg"
      >
        <span className="text-xs text-stone-400">{collapsed ? "▶" : "▼"}</span>
        <span className="font-semibold text-stone-600 text-sm">{scene.title}</span>
        <span className="ml-auto text-xs text-stone-400 tabular-nums">
          {keptLines === totalLines ? (
            <span>{totalLines} lines</span>
          ) : (
            <span>
              <span className="text-amber-600 font-medium">{keptLines}</span>
              <span className="text-stone-300"> / {totalLines}</span>
            </span>
          )}
        </span>
      </button>

      {!collapsed && (
        <div className="px-4 pb-4 space-y-0.5">
          {units.map(({ unit, status }) =>
            unit.type === "speech" ? (
              <SpeechBlock
                key={unit.id}
                speech={unit}
                status={status}
                actorColor={charColor[unit.characterId]}
                onToggle={onToggle ? () => onToggle(unit.id) : null}
              />
            ) : (
              <StageDirectionBlock
                key={unit.id}
                stage={unit}
                status={status}
                onToggle={onToggle ? () => onToggle(unit.id) : null}
              />
            )
          )}
        </div>
      )}
    </div>
  );
}
