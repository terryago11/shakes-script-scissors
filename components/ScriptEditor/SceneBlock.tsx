"use client";

import { useState } from "react";
import type { Character, Scene } from "@/types/play";
import type { Actor, ActorAssignment } from "@/types/project";
import type { ScriptUnitWithStatus, SceneCounts } from "@/types/cut";
import type { SpeechEdit } from "@/types/edit";
import type { Insertion } from "@/types/insertion";
import type { InsertedSD } from "@/types/insertedsd";
import { useMetric } from "@/lib/ui/MetricContext";
import { useViewMode } from "@/lib/ui/ViewModeContext";
import { useEditMode } from "@/lib/ui/EditModeContext";
import { useProject } from "@/lib/project/ProjectStore";
import { getOnStageAtUnit, getExpectedEntrantsAtUnit } from "@/lib/cuts/StageTimeEngine";
import SpeechBlock from "./SpeechBlock";
import StageDirectionBlock from "./StageDirectionBlock";
import InsertionBlock from "./InsertionBlock";
import InsertionModal from "./InsertionModal";
import InsertedSDBlock from "./InsertedSDBlock";
import InsertedSDModal from "./InsertedSDModal";

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
  sceneCounts?: SceneCounts;
  // Scene focus (used by ActBlock to filter visible scenes)
  focusedSceneId: string | null;
  /** When true, render all content as original (no cuts/edits applied) — for diff side-by-side */
  showOriginal?: boolean;
  /** unitId → speaker override (string[] = set of effective speakers) */
  speechReassignments?: Record<string, string[]>;
  /** Character IDs that appear in at least one kept entrance SD */
  charsWithEntrance?: Set<string>;
  onReassign?: (unitId: string, characterIds: string[] | null) => void;
  /** Cut-level character display-name aliases */
  characterAliases?: Record<string, string>;
  /** stageId → effective character list overrides; used to compute on-stage set for SD Auto-fill */
  stageDirectionEdits?: Record<string, string[]>;
  /** unitId → { splitAtLineIndex, newCharacterId? } — drives splitRole prop on SpeechBlock */
  speechSplits?: Record<string, { splitAtLineIndex: number; newCharacterId?: string }>;
  /** Called when user clicks a split zone in SpeechBlock */
  onSplit?: (unitId: string, atLineIndex: number, atWordOffset?: number) => void;
  /** Called when user clicks merge on a Part 2 SpeechBlock */
  onMerge?: (unitId: string, part2LineIds: string[]) => void;
  /** All insertions for the active cut — SceneBlock renders ones whose afterUnitId is in this scene */
  insertions?: Record<string, Insertion>;
  onAddInsertion?: (insertion: Insertion) => void;
  onRemoveInsertion?: (insertionId: string, lineIds: string[]) => void;
  /** All inserted SDs for the active cut — SceneBlock renders ones whose afterUnitId is in this scene */
  insertedSDs?: Record<string, InsertedSD>;
  /** Called when at least one unit is restored via "restore all" */
  onRestoreScene?: () => void;
}

export default function SceneBlock({
  scene, units, assignments, actors, castList, onToggle, speechEdits, onClearEdits,
  filteredCharacterIds, sceneCounts,
  focusedSceneId, showOriginal,
  speechReassignments, charsWithEntrance, onReassign,
  characterAliases, stageDirectionEdits,
  speechSplits, onSplit, onMerge,
  insertions, onAddInsertion, onRemoveInsertion,
  insertedSDs,
  onRestoreScene,
}: Props) {
  // Unified insertion modal state: null = closed, create = new insertion, edit = editing existing
  type InsertionModalState =
    | null
    | { mode: "create"; afterUnitId: string }
    | { mode: "edit"; insertion: Insertion };

  type InsertSDModalState =
    | null
    | { mode: "create"; afterUnitId: string }
    | { mode: "edit"; sd: InsertedSD };

  // Default to collapsed so after act re-expand, scenes are collapsed and user can pick
  const [collapsed, setCollapsed] = useState(false);
  const [insertionModalState, setInsertionModalState] = useState<InsertionModalState>(null);
  const [insertSDModalState, setInsertSDModalState] = useState<InsertSDModalState>(null);
  const { metric, wpm } = useMetric();
  const { activeTool } = useEditMode();
  const { dispatch: projectDispatch, activeCut } = useProject();

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

  // Continuation detection — when showOriginal, treat all units as kept.
  // Uses effective character IDs (respecting speechReassignments), and accounts for
  // split :s2 virtual parts and inserted speeches so cont. renders correctly in all cases.
  const continuationIds = new Set<string>();
  {
    let lastSpeakerId: string | null = null;

    // Build afterUnitId → Insertion[] map for this scene's insertions
    const insAfterMap = new Map<string, Insertion[]>();
    if (!showOriginal && insertions) {
      for (const ins of Object.values(insertions)) {
        const arr = insAfterMap.get(ins.afterUnitId) ?? [];
        arr.push(ins);
        insAfterMap.set(ins.afterUnitId, arr);
      }
    }

    for (const { unit, status } of units) {
      const isKept = showOriginal ? true : status === "kept";

      if (unit.type === "speech") {
        // :s2 virtual parts are handled in the split block below (when we process the
        // original unit). Skip them here to avoid double-counting — otherwise the
        // :s2 unit picks up lastSpeakerId = s2CharId that was just set and falsely
        // marks itself as a continuation.
        // Insertion units are already handled by insAfterMap when we process the unit
        // they follow — skip them here to prevent double-processing.
        const isS2 = unit.id.endsWith(":s2");
        const isInsertionUnit = !showOriginal && !!insertions?.[unit.id];
        if (!isS2 && !isInsertionUnit) {
          // For continuation detection use the first effective speaker (primary)
          const reassigned = !showOriginal ? speechReassignments?.[unit.id] : undefined;
          const charId = reassigned ? reassigned[0] : unit.characterId;
          // ALL speeches (TEI-tagged, multi-speaker TEI, or multi-speaker override) break
          // continuations — the next speech should never be labelled "cont." after an ALL.
          const isAllSpeechUnit =
            /\bALL\b/i.test(unit.speakerTag) ||
            (unit.characterIds != null && unit.characterIds.length > 1) ||
            (reassigned != null && reassigned.length > 1);
          if (isKept) {
            if (!isAllSpeechUnit && lastSpeakerId === charId) continuationIds.add(unit.id);
            lastSpeakerId = isAllSpeechUnit ? null : charId;
          }

          // Handle split :s2 virtual part (same kept status as the original)
          const split = !showOriginal ? speechSplits?.[unit.id] : undefined;
          if (split && isKept) {
            const s2Id = `${unit.id}:s2`;
            const s2Reassigned = speechReassignments?.[s2Id];
            const s2CharId = s2Reassigned ? s2Reassigned[0] : (split.newCharacterId ?? unit.characterId);
            if (lastSpeakerId === s2CharId) continuationIds.add(s2Id);
            lastSpeakerId = s2CharId;
          }
        }
      }

      // Process any insertions that follow this unit (runs for all units including :s2)
      for (const ins of insAfterMap.get(unit.id) ?? []) {
        if (lastSpeakerId === ins.characterId) continuationIds.add(ins.id);
        lastSpeakerId = ins.characterId;
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
    let restoredAny = false;
    for (const { unit, status } of units) {
      if (status === "cut") { onToggle?.(unit.id); restoredAny = true; }
    }
    if (onClearEdits && speechEdits) {
      for (const { unit } of units) {
        if (unit.type === "speech" && speechEdits[unit.id]?.ops.length) {
          onClearEdits(unit.id);
          restoredAny = true;
        }
      }
    }
    if (restoredAny) onRestoreScene?.();
  }

  // Pre-compute per-speech scene-relative line offsets for the running counter.
  // Standard mode: count ALL lines (including cut) so numbers match the full original text.
  // Clean/diff modes: count only KEPT lines in the current cut.
  const speechStartLines = (() => {
    if (showOriginal) return new Map<string, number>();
    const countAllLines = viewMode === "standard";
    const map = new Map<string, number>();
    let running = 0;
    for (const { unit, status, lineStatuses } of units) {
      if (unit.type !== "speech") continue;
      map.set(unit.id, running);
      if (countAllLines) {
        // All lines regardless of cut status
        running += unit.lineCount;
      } else if (status === "kept") {
        running += lineStatuses
          ? lineStatuses.filter((ls) => ls.status === "kept").length
          : unit.lineCount;
      }
    }
    return map;
  })();

  // Insert zones are available when the Insert tool is active
  const canInsert = !showOriginal && activeTool === "insert" && viewMode !== "diff" && !!onAddInsertion;
  // Insert SD zones are available when the Edit SDs tool is active
  const canInsertSD = !showOriginal && activeTool === "edit-sds" && viewMode !== "diff";

  // Pre-compute on-stage character set for each exit SD (enables Auto-fill button)
  // Uses raw scene.units (cut-independent) so the on-stage set reflects actual entrances/exits.
  const onStageAtExitSd: Map<string, Set<string>> = (() => {
    if (showOriginal) return new Map();
    const map = new Map<string, Set<string>>();
    scene.units.forEach((unit, idx) => {
      if (unit.type === "stage" && unit.stageType === "exit") {
        map.set(unit.id, getOnStageAtUnit(scene.units, idx, stageDirectionEdits));
      }
    });
    return map;
  })();

  // Pre-compute entrance suggestions for each entrance SD (enables ⟳ sync entrances button)
  // Looks at exit SDs later in the scene to find chars who exit but have no prior entrance SD.
  const entranceSuggestionsAtSd: Map<string, Set<string>> = (() => {
    if (showOriginal) return new Map();
    const map = new Map<string, Set<string>>();
    scene.units.forEach((unit, idx) => {
      if (unit.type === "stage" && unit.stageType === "entrance") {
        const suggestions = getExpectedEntrantsAtUnit(scene.units, idx, stageDirectionEdits);
        if (suggestions.size > 0) map.set(unit.id, suggestions);
      }
    });
    return map;
  })();

  // Pre-compute on-stage character set for each speech (enables → ALL in chip editor)
  const onStageAtSpeech: Map<string, Set<string>> = (() => {
    if (showOriginal) return new Map();
    const map = new Map<string, Set<string>>();
    scene.units.forEach((unit, idx) => {
      if (unit.type === "speech") {
        map.set(unit.id, getOnStageAtUnit(scene.units, idx, stageDirectionEdits));
      }
    });
    return map;
  })();

  return (
    <div
      id={`scene-${scene.id}`}
      className={`border rounded-lg transition-colors ${
        isFullyCut ? "border-stone-200 bg-stone-50 dark:border-stone-700 dark:bg-stone-900" : "border-stone-100 bg-white dark:border-stone-800 dark:bg-stone-900"
      }`}
    >
      {/* Header row: collapse button + restore-all + focus */}
      <div className={`group flex items-center rounded-lg ${isFullyCut ? "opacity-50" : ""}`}>
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="flex items-center gap-3 flex-1 text-left px-4 py-3 hover:bg-stone-50 dark:hover:bg-stone-800 rounded-lg"
        >
          <span className="text-xs text-stone-400 dark:text-stone-400">{collapsed ? "▶" : "▼"}</span>
          <span className={`font-semibold text-sm ${isFullyCut ? "text-stone-400 dark:text-stone-400 line-through" : "text-stone-600 dark:text-stone-300"}`}>
            {scene.sceneType === "chorus" ? "CHORUS"
              : scene.sceneType === "epilogue" ? "EPILOGUE"
              : scene.sceneType === "prologue" ? "PROLOGUE"
              : scene.title}
          </span>
          {(scene.sceneType === "chorus" || scene.sceneType === "epilogue" || scene.sceneType === "prologue") && (
            <span className="text-xs text-stone-400 dark:text-stone-500 font-normal italic">{scene.sceneType}</span>
          )}
          {isFullyCut && (
            <span className="text-xs text-stone-400 bg-stone-200 dark:text-stone-400 dark:bg-stone-700 px-1.5 py-0.5 rounded font-normal">
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
                  {viewMode !== "clean" && timeMins.afterCut < timeMins.original - 0.01 && (
                    <span className="text-stone-300 dark:text-stone-600">/ {fmtMins(timeMins.original)}</span>
                  )}
                  <span className="text-stone-300 dark:text-stone-600">@ {wpm}wpm</span>
                </>
              ) : (
                <>
                  {displayKept === displayOriginal ? (
                    <span>{displayOriginal.toLocaleString()}</span>
                  ) : (
                    <>
                      <span className="text-amber-600 font-medium">{displayKept.toLocaleString()}</span>
                      {viewMode !== "clean" && (
                        <span className="text-stone-300 dark:text-stone-600">/ {displayOriginal.toLocaleString()}</span>
                      )}
                    </>
                  )}
                  {viewMode !== "clean" && pctCut > 0 && (
                    <span className="text-amber-500 font-medium">−{pctCut}%</span>
                  )}
                  <span className="text-stone-300 dark:text-stone-600">{metric}</span>
                </>
              )}
            </span>
          )}
        </button>

        {/* Restore all — only in Restore mode; always-visible (not hover-only) */}
        {hasAnyCuts && onToggle && activeTool === "restore" && (
          <button
            onClick={handleRestoreAll}
            className="mr-3 text-sm px-3 py-1 rounded border border-green-300 bg-green-50 text-green-700 hover:bg-green-100 hover:border-green-400 dark:border-green-700 dark:bg-green-950/50 dark:text-green-400 dark:hover:bg-green-900/50 dark:hover:border-green-600 transition-all shrink-0 font-medium"
            title="Restore all cuts in this scene"
          >
            ↩ restore all
          </button>
        )}
      </div>

      {!collapsed && (
        <div className="px-4 pb-4 space-y-0.5">
          {units.flatMap(({ unit, status, lineStatuses }) => {
            const isFiltering = filteredCharacterIds && filteredCharacterIds.size > 0;
            const elements: React.ReactNode[] = [];

            if (unit.type === "speech") {
              if (isFiltering && !filteredCharacterIds!.has(unit.characterId)) return [];

              // Check if this is a synthetic insertion unit
              const insertionData = !showOriginal && insertions ? insertions[unit.id] : undefined;

              if (insertionData) {
                elements.push(
                  <InsertionBlock
                    key={unit.id}
                    insertion={insertionData}
                    castList={castList}
                    characterAliases={showOriginal ? undefined : characterAliases}
                    isContinuation={continuationIds.has(unit.id)}
                    onRemove={onRemoveInsertion
                      ? (id) => onRemoveInsertion(id, insertionData.lines.map((l) => l.id))
                      : () => {}}
                    onEdit={showOriginal ? undefined : (ins) => setInsertionModalState({ mode: "edit", insertion: ins })}
                  />
                );
              } else {
                // Determine split role: check if this is Part 1 (has a split entry) or Part 2 (id ends with :s2)
                const isPart2 = unit.id.endsWith(":s2");
                const originalId = isPart2 ? unit.id.slice(0, -3) : unit.id;
                const splitRole = !showOriginal && speechSplits
                  ? isPart2 ? "part2" : speechSplits[unit.id] ? "part1" : undefined
                  : undefined;
                elements.push(
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
                    castList={castList}
                    speechReassignedTo={showOriginal ? undefined : (speechReassignments?.[unit.id] ?? null)}
                    charsWithEntrance={charsWithEntrance}
                    onStageAtSpeech={showOriginal ? undefined : onStageAtSpeech.get(unit.id)}
                    onReassign={showOriginal ? undefined : onReassign}
                    speechLineOffset={showOriginal ? undefined : speechStartLines.get(unit.id)}
                    characterAliases={showOriginal ? undefined : characterAliases}
                    splitRole={splitRole}
                    onSplit={showOriginal ? undefined : onSplit}
                    onMerge={showOriginal ? undefined : (isPart2 ? onMerge ? (unitId, lineIds) => onMerge(originalId, lineIds) : undefined : onMerge)}
                  />
                );
              }
            } else {
              if (isFiltering) {
                // Show entrance/exit SDs that mention a filtered character; hide all others
                const hasFilteredChar = filteredCharacterIds && unit.characters.some((id) => filteredCharacterIds.has(id));
                if (!hasFilteredChar) return [];
              }
              // In clean mode, hide cut SDs — but not when showOriginal (we want all in original column)
              if (status === "cut" && viewMode === "clean" && !showOriginal) return [];
              elements.push(
                <StageDirectionBlock
                  key={unit.id}
                  stage={unit}
                  status={showOriginal ? "kept" : status}
                  onToggle={showOriginal ? null : (onToggle ? () => onToggle(unit.id) : null)}
                  castList={castList}
                  onStageAtSd={showOriginal ? undefined : onStageAtExitSd.get(unit.id)}
                  entranceSuggestionsAtSd={showOriginal ? undefined : entranceSuggestionsAtSd.get(unit.id)}
                />
              );
            }

            // Collect inserted SDs that follow this unit (stable order — IDs generated sequentially)
            const unitInsertedSDs = !showOriginal && insertedSDs
              ? Object.values(insertedSDs).filter((isd) => isd.afterUnitId === unit.id)
              : [];

            // Helper renderers for insert zones
            function renderInsertZone(afterId: string) {
              if (!canInsert) return null;
              return (
                <div
                  key={`insert-zone-${afterId}`}
                  className="group/insert h-2 hover:h-7 transition-[height] flex items-center overflow-hidden"
                >
                  <button
                    className="opacity-0 group-hover/insert:opacity-100 transition-opacity text-xs px-2 py-0.5 rounded border border-green-300 bg-green-50 text-green-700 hover:bg-green-100 dark:border-green-700 dark:bg-green-950/50 dark:text-green-400 dark:hover:bg-green-900/50 w-full text-left"
                    onClick={(e) => { e.stopPropagation(); setInsertionModalState({ mode: "create", afterUnitId: afterId }); }}
                  >
                    + Insert here
                  </button>
                </div>
              );
            }
            function renderInsertSDZone(afterId: string) {
              if (!canInsertSD) return null;
              return (
                <div
                  key={`insert-sd-zone-${afterId}`}
                  className="group/insert-sd h-2 hover:h-7 transition-[height] flex items-center overflow-hidden"
                >
                  <button
                    className="opacity-0 group-hover/insert-sd:opacity-100 transition-opacity text-xs px-2 py-0.5 rounded border border-sky-300 bg-sky-50 text-sky-700 hover:bg-sky-100 dark:border-sky-700 dark:bg-sky-950/50 dark:text-sky-400 dark:hover:bg-sky-900/50 w-full text-left"
                    onClick={(e) => { e.stopPropagation(); setInsertSDModalState({ mode: "create", afterUnitId: afterId }); }}
                  >
                    + Insert SD
                  </button>
                </div>
              );
            }

            // Interleave: zone → [SD → zone]* → SD zone
            // First zone anchors to the unit itself; subsequent zones anchor to the preceding inserted SD.
            const insertZone0 = renderInsertZone(unit.id);
            if (insertZone0) elements.push(insertZone0);

            for (const isd of unitInsertedSDs) {
              const isdStatus = activeCut?.cutMap[isd.id] === "cut" ? "cut" : "kept";
              elements.push(
                <InsertedSDBlock
                  key={isd.id}
                  sd={isd}
                  status={isdStatus}
                  castList={castList}
                  characterAliases={characterAliases}
                  onToggle={onToggle ? () => onToggle(isd.id) : null}
                  onRemove={(id) => projectDispatch({ type: "REMOVE_INSERTED_SD", insertedSdId: id })}
                  onEdit={(sd) => setInsertSDModalState({ mode: "edit", sd })}
                />
              );
              // Insert zone after each inserted SD (anchored to the SD's id)
              const zoneAfterIsd = renderInsertZone(isd.id);
              if (zoneAfterIsd) elements.push(zoneAfterIsd);
            }

            // Insert SD zone — at the very end, after all inserted SDs
            const lastAnchorId = unitInsertedSDs.length > 0
              ? unitInsertedSDs[unitInsertedSDs.length - 1].id
              : unit.id;
            const sdZone = renderInsertSDZone(lastAnchorId);
            if (sdZone) elements.push(sdZone);

            return elements;
          })}
        </div>
      )}

      {/* Insertion modal — rendered outside the collapsed check so it stays mounted */}
      {insertionModalState && (
        <InsertionModal
          afterUnitId={
            insertionModalState.mode === "create"
              ? insertionModalState.afterUnitId
              : insertionModalState.insertion.afterUnitId
          }
          existingInsertion={insertionModalState.mode === "edit" ? insertionModalState.insertion : undefined}
          castList={castList}
          characterAliases={characterAliases}
          onSave={(ins) => {
            if (insertionModalState.mode === "edit") {
              projectDispatch({ type: "UPDATE_INSERTION", insertionId: ins.id, characterId: ins.characterId, lines: ins.lines });
            } else {
              onAddInsertion?.(ins);
            }
            setInsertionModalState(null);
          }}
          onCancel={() => setInsertionModalState(null)}
        />
      )}

      {/* Insert SD modal — rendered outside the collapsed check so it stays mounted */}
      {insertSDModalState && (
        <InsertedSDModal
          afterUnitId={
            insertSDModalState.mode === "create"
              ? insertSDModalState.afterUnitId
              : insertSDModalState.sd.afterUnitId
          }
          castList={castList}
          existing={insertSDModalState.mode === "edit" ? insertSDModalState.sd : undefined}
          onConfirm={(sd) => {
            projectDispatch({ type: "INSERT_SD", sd });
            setInsertSDModalState(null);
          }}
          onClose={() => setInsertSDModalState(null)}
        />
      )}
    </div>
  );
}
