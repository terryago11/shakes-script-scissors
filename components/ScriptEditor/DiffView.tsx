"use client";

import type { Act, Character, Scene } from "@/types/play";
import type { Actor, ActorAssignment } from "@/types/project";
import type { ScriptUnitWithStatus } from "@/types/cut";
import type { SpeechEdit } from "@/types/edit";
import { ViewModeProvider } from "@/lib/ui/ViewModeContext";
import SpeechBlock from "./SpeechBlock";
import StageDirectionBlock from "./StageDirectionBlock";

interface Props {
  orderedGroups: Array<{ act: Act; scenes: Scene[] }>;
  unitsByScene: Map<string, ScriptUnitWithStatus[]>;
  speechEdits?: Record<string, SpeechEdit>;
  assignments: ActorAssignment[];
  actors: Actor[];
  castList: Character[];
  filteredCharacterIds?: Set<string>;
  focusedSceneId: string | null;
  onToggle: (unitId: string) => void;
  onClearEdits: (unitId: string) => void;
  cutModeActive?: boolean;
}

export default function DiffView({
  orderedGroups,
  unitsByScene,
  speechEdits,
  assignments,
  actors,
  castList,
  filteredCharacterIds,
  focusedSceneId,
  onToggle,
  onClearEdits,
  cutModeActive,
}: Props) {
  // Build character→actor color map
  const charColor: Record<string, string> = {};
  for (const a of assignments) {
    const actor = actors.find((ac) => ac.id === a.actorId);
    if (actor) charColor[a.characterId] = actor.color;
  }

  return (
    <div className="px-4 py-6">
      {/* Column header strip */}
      <div className="flex items-center mb-4 text-xs font-medium text-stone-400 select-none">
        <div className="flex-1 px-1">Modified script</div>
        <div className="w-px bg-transparent" />
        <div className="flex-1 px-1">Original</div>
      </div>

      {orderedGroups.map((group) => {
        const displayScenes = focusedSceneId
          ? group.scenes.filter((s) => s.id === focusedSceneId)
          : group.scenes;
        if (displayScenes.length === 0) return null;

        return (
          <div key={`${group.act.id}-${displayScenes[0].id}`} className="mb-8">
            {/* Act label — full width */}
            <div className="mb-3">
              <span className="text-xs font-semibold uppercase tracking-widest text-stone-400">
                {group.act.title}
              </span>
            </div>

            {displayScenes.map((scene) => {
              const units = unitsByScene.get(scene.id) ?? [];

              // Skip scene if filter is active and scene has no matching speeches
              if (filteredCharacterIds && filteredCharacterIds.size > 0) {
                const hasMatch = units.some(
                  (u) => u.unit.type === "speech" && filteredCharacterIds.has(u.unit.characterId)
                );
                if (!hasMatch) return null;
              }

              // Line offsets for running counter:
              // Left (cut) counts only KEPT lines; right (original) counts ALL lines.
              const cutSpeechStartLines = (() => {
                const map = new Map<string, number>();
                let running = 0;
                for (const { unit, status, lineStatuses } of units) {
                  if (unit.type !== "speech") continue;
                  map.set(unit.id, running);
                  if (status === "kept") {
                    running += lineStatuses
                      ? lineStatuses.filter((ls) => ls.status === "kept").length
                      : unit.lineCount;
                  }
                }
                return map;
              })();

              const origSpeechStartLines = (() => {
                const map = new Map<string, number>();
                let running = 0;
                for (const { unit } of units) {
                  if (unit.type !== "speech") continue;
                  map.set(unit.id, running);
                  running += unit.lineCount;
                }
                return map;
              })();

              // Continuation detection for left (modified) column
              const continuationIds = new Set<string>();
              let lastSpeakerId: string | null = null;
              for (const { unit, status } of units) {
                if (unit.type === "speech" && status === "kept") {
                  if (lastSpeakerId === unit.characterId) continuationIds.add(unit.id);
                  lastSpeakerId = unit.characterId;
                }
              }

              // Continuation detection for right (original) column — all units kept
              const origContinuationIds = new Set<string>();
              let origLastSpeakerId: string | null = null;
              for (const { unit } of units) {
                if (unit.type === "speech") {
                  if (origLastSpeakerId === unit.characterId) origContinuationIds.add(unit.id);
                  origLastSpeakerId = unit.characterId;
                }
              }

              return (
                <div key={scene.id} className="mb-6">
                  {/* Scene title — full width */}
                  <div className="font-semibold text-sm text-stone-600 mb-1 pb-1.5 border-b border-stone-200">
                    {scene.title}
                  </div>

                  {/* Paired rows — each unit is one flex row; height syncs naturally */}
                  <div className="border border-stone-100 rounded-lg overflow-hidden divide-y divide-stone-50">
                    {units.map(({ unit, status, lineStatuses }) => {
                      const isFiltering = filteredCharacterIds && filteredCharacterIds.size > 0;

                      if (unit.type === "speech") {
                        if (isFiltering && !filteredCharacterIds!.has(unit.characterId)) return null;

                        const isCut = status === "cut";
                        const hasWordEdits = (speechEdits?.[unit.id]?.ops.length ?? 0) > 0;
                        const hasLineCuts = lineStatuses
                          ? lineStatuses.some((ls) => ls.status === "cut")
                          : false;
                        const hasChanges = isCut || hasWordEdits || hasLineCuts;

                        return (
                          <div
                            key={unit.id}
                            className={`flex items-stretch ${isCut ? "bg-red-50/30" : ""}`}
                          >
                            {/* Left: modified view — outer context is viewMode="diff" */}
                            <div
                              className={`flex-1 min-w-0 ${
                                isCut
                                  ? "border-l-2 border-red-300"
                                  : hasChanges
                                  ? "border-l-2 border-amber-300"
                                  : "border-l-2 border-transparent"
                              }`}
                            >
                              <SpeechBlock
                                speech={unit}
                                status={status}
                                actorColor={charColor[unit.characterId]}
                                onToggle={() => onToggle(unit.id)}
                                lineStatuses={lineStatuses}
                                speechEdit={speechEdits?.[unit.id]}
                                onClearEdits={onClearEdits}
                                isContinuation={continuationIds.has(unit.id)}
                                cutModeActive={cutModeActive}
                                speechLineOffset={cutSpeechStartLines.get(unit.id)}
                              />
                            </div>

                            {/* Vertical divider */}
                            <div className="w-px bg-stone-100 shrink-0" />

                            {/* Right: original — forceValue="standard" so no diff markup */}
                            <ViewModeProvider forceValue="standard">
                              <div
                                className={`flex-1 min-w-0 bg-stone-50/50 ${
                                  !hasChanges ? "opacity-50" : ""
                                }`}
                              >
                                <SpeechBlock
                                  speech={unit}
                                  status="kept"
                                  actorColor={charColor[unit.characterId]}
                                  onToggle={null}
                                  lineStatuses={undefined}
                                  speechEdit={undefined}
                                  onClearEdits={undefined}
                                  isContinuation={origContinuationIds.has(unit.id)}
                                  cutModeActive={false}
                                  speechLineOffset={origSpeechStartLines.get(unit.id)}
                                />
                              </div>
                            </ViewModeProvider>
                          </div>
                        );
                      } else {
                        // Stage direction
                        if (isFiltering) return null;

                        const isCut = status === "cut";

                        return (
                          <div
                            key={unit.id}
                            className={`flex items-stretch ${isCut ? "bg-red-50/30" : ""}`}
                          >
                            {/* Left */}
                            <div
                              className={`flex-1 min-w-0 ${
                                isCut
                                  ? "border-l-2 border-red-300"
                                  : "border-l-2 border-transparent"
                              }`}
                            >
                              <StageDirectionBlock
                                stage={unit}
                                status={status}
                                onToggle={() => onToggle(unit.id)}
                                castList={castList}
                              />
                            </div>

                            {/* Divider */}
                            <div className="w-px bg-stone-100 shrink-0" />

                            {/* Right: original (readonly, no edits applied) */}
                            <ViewModeProvider forceValue="standard">
                              <div
                                className={`flex-1 min-w-0 bg-stone-50/50 ${
                                  !isCut ? "opacity-50" : ""
                                }`}
                              >
                                <StageDirectionBlock
                                  stage={unit}
                                  status="kept"
                                  onToggle={null}
                                  castList={castList}
                                />
                              </div>
                            </ViewModeProvider>
                          </div>
                        );
                      }
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
