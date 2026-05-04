"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import type { Act, Play, Scene, ScriptUnit } from "@/types/play";
import type { LineCounts } from "@/types/cut";
import type { StageTimeResult } from "@/lib/cuts/StageTimeEngine";
import type { Actor, Cut } from "@/types/project";
import type { SongDanceItem } from "./SceneDashboard";
import type { EffectiveSceneEntry, SubScene } from "@/lib/cuts/SceneSubdivisionUtils";
import { buildSceneEntries, findUnitAtLine, PART_LABELS } from "@/lib/cuts/SceneSubdivisionUtils";
import PauseRow from "./PauseRow";

interface SplitPreview {
  afterUnitId: string;
  linesBefore: Array<{ speaker: string; text: string }>;
  linesAfter: Array<{ speaker: string; text: string }>;
  totalLines: number;
}

interface Props {
  effectiveSceneOrder: string[];
  sceneById: Map<string, Scene>;
  sceneActMap: Map<string, Act>;
  actors: Actor[];
  actorSceneMatrix: Map<string, Map<string, { minutes: number; originalMinutes: number }>>;
  lineCounts: LineCounts;
  stageTime: StageTimeResult;
  pauses?: Record<string, { name: string; minutes: number }>;
  onSetPause: (afterSceneId: string, name: string, minutes: number) => void;
  onRemovePause: (afterSceneId: string) => void;
  onSetSceneOrder?: (newOrder: string[]) => void;
  metric: "lines" | "words" | "time";
  wpm: number;
  /** Song/dance items (speeches + SDs) in each scene, for duration editing */
  sceneSongDanceSDs?: Map<string, SongDanceItem[]>;
  /** Current extra durations keyed by SD id */
  stageDurations?: Record<string, number>;
  onSetStageDuration?: (stageId: string, minutes: number) => void;
  onClearStageDuration?: (stageId: string) => void;
  /** Production notes per act, keyed by act ID */
  actDescriptions?: Record<string, string>;
  /** Production notes per scene, keyed by scene ID */
  sceneDescriptions?: Record<string, string>;
  onSetActDescription?: (actId: string, description: string | null) => void;
  onSetSceneDescription?: (sceneId: string, description: string | null) => void;
  /** Scene subdivision support */
  activeCut?: Cut;
  play?: Play;
  onAddSceneSplit?: (realSceneId: string, afterUnitId: string) => void;
  onRemoveSceneSplit?: (realSceneId: string, splitId: string) => void;
  /** Expanded column entries — includes virtual sub-scene IDs when scenes are subdivided */
  columnEntries?: EffectiveSceneEntry[];
  /** Naturally detected subdivisions for scenes not yet manually split */
  detectedSubdivisions?: Map<string, SubScene[]>;
}

function formatMinutes(m: number): string {
  if (m < 1) return `${Math.round(m * 60)}s`;
  const mins = Math.floor(m);
  const secs = Math.round((m - mins) * 60);
  return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
}

export default function SceneList({
  effectiveSceneOrder,
  sceneById,
  sceneActMap,
  actors,
  actorSceneMatrix,
  lineCounts,
  pauses,
  onSetPause,
  onRemovePause,
  onSetSceneOrder,
  metric,
  wpm,
  sceneSongDanceSDs,
  stageDurations,
  onSetStageDuration,
  onClearStageDuration,
  actDescriptions,
  sceneDescriptions,
  onSetActDescription,
  onSetSceneDescription,
  activeCut,
  play,
  onAddSceneSplit,
  onRemoveSceneSplit,
  columnEntries,
  detectedSubdivisions,
}: Props) {
  const [dragOverSceneId, setDragOverSceneId] = useState<string | null>(null);
  const [editingDuration, setEditingDuration] = useState<string | null>(null); // SD id being edited
  const [durationInput, setDurationInput] = useState("");
  // Scene/act description editing
  const [editingDescId, setEditingDescId] = useState<string | null>(null); // "scene:{id}" or "act:{id}"
  const [descInput, setDescInput] = useState("");
  const descInputRef = useRef<HTMLInputElement>(null);

  // Scene subdivision state
  const [splitDialogSceneId, setSplitDialogSceneId] = useState<string | null>(null);
  const [splitLineInput, setSplitLineInput] = useState("");
  const [splitPreview, setSplitPreview] = useState<SplitPreview | null>(null);
  const [splitPreviewError, setSplitPreviewError] = useState<string | null>(null);
  // Which scene suggestion disclosures are expanded
  const [expandedSuggestions, setExpandedSuggestions] = useState<Set<string>>(new Set());
  function toggleSuggestion(sceneId: string) {
    setExpandedSuggestions((prev) => {
      const next = new Set(prev);
      next.has(sceneId) ? next.delete(sceneId) : next.add(sceneId);
      return next;
    });
  }

  // Build a map of realSceneId → sub-scene entries (only for subdivided scenes)
  const subScenesByRealId = new Map<string, EffectiveSceneEntry[]>();
  if (columnEntries && activeCut) {
    for (const entry of columnEntries) {
      if (entry.partCount > 1) {
        const arr = subScenesByRealId.get(entry.realSceneId) ?? [];
        arr.push(entry);
        subScenesByRealId.set(entry.realSceneId, arr);
      }
    }
  }

  // Compute split preview when splitLineInput changes (debounced)
  const computePreview = useCallback((lineNumStr: string, sceneId: string) => {
    if (!play || !activeCut) return;
    const scene = sceneById.get(sceneId);
    if (!scene) return;

    const lineNum = parseInt(lineNumStr, 10);
    if (isNaN(lineNum) || lineNum < 1) {
      setSplitPreview(null);
      setSplitPreviewError(lineNumStr ? "Enter a valid line number" : null);
      return;
    }

    // Get expanded units for the entire scene (all parts)
    const entries = buildSceneEntries(scene, activeCut, play);
    const allUnits: ScriptUnit[] = entries.flatMap((e) => e.units);
    const totalLines = allUnits.reduce((s, u) => s + (u.type === "speech" ? u.lineCount : 0), 0);

    if (lineNum > totalLines) {
      setSplitPreview(null);
      setSplitPreviewError(`Line must be between 1 and ${totalLines}`);
      return;
    }

    const result = findUnitAtLine(allUnits, lineNum);
    if (!result) {
      setSplitPreview(null);
      setSplitPreviewError(`Line must be between 1 and ${totalLines}`);
      return;
    }

    // Collect speeches for context: up to 2 before and 2 after the boundary unit
    const speeches = allUnits.filter((u) => u.type === "speech");
    const boundaryIdx = speeches.findIndex((u) => u.id === result.unitId);
    const linesBefore = speeches.slice(Math.max(0, boundaryIdx - 1), boundaryIdx + 1).map((u) => ({
      speaker: (u as Extract<typeof u, { type: "speech" }>).characterName,
      text: (u as Extract<typeof u, { type: "speech" }>).lines[0]?.text ?? "",
    }));
    const linesAfter = speeches.slice(boundaryIdx + 1, boundaryIdx + 3).map((u) => ({
      speaker: (u as Extract<typeof u, { type: "speech" }>).characterName,
      text: (u as Extract<typeof u, { type: "speech" }>).lines[0]?.text ?? "",
    }));

    setSplitPreviewError(null);
    setSplitPreview({ afterUnitId: result.unitId, linesBefore, linesAfter, totalLines });
  }, [play, activeCut, sceneById]);

  useEffect(() => {
    if (!splitDialogSceneId) return;
    const timer = setTimeout(() => computePreview(splitLineInput, splitDialogSceneId), 300);
    return () => clearTimeout(timer);
  }, [splitLineInput, splitDialogSceneId, computePreview]);

  function openSplitDialog(sceneId: string) {
    setSplitDialogSceneId(sceneId);
    setSplitLineInput("");
    setSplitPreview(null);
    setSplitPreviewError(null);
  }

  function closeSplitDialog() {
    setSplitDialogSceneId(null);
    setSplitLineInput("");
    setSplitPreview(null);
    setSplitPreviewError(null);
  }

  function handleConfirmSplit() {
    if (!splitDialogSceneId || !splitPreview) return;
    onAddSceneSplit?.(splitDialogSceneId, splitPreview.afterUnitId);
    closeSplitDialog();
  }

  // Find max value for bar scaling across all scenes
  let maxVal = 1;
  for (const sceneId of effectiveSceneOrder) {
    const sc = lineCounts.byScene[sceneId];
    if (!sc) continue;
    const orig = metric === "time"
      ? sc.words.original / wpm
      : metric === "words" ? sc.words.original : sc.lines.original;
    if (orig > maxVal) maxVal = orig;
  }

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
    if (!onSetSceneOrder) return;
    const draggedId = e.dataTransfer.getData("text/plain");
    if (!draggedId || draggedId === targetSceneId) return;
    const newOrder = effectiveSceneOrder.filter((id) => id !== draggedId);
    const targetIndex = newOrder.indexOf(targetSceneId);
    if (targetIndex === -1) return;
    newOrder.splice(targetIndex, 0, draggedId);
    onSetSceneOrder(newOrder);
  }

  function handleDragEnd() {
    setDragOverSceneId(null);
  }

  function startEditDuration(sdId: string) {
    const current = stageDurations?.[sdId];
    setDurationInput(current != null ? String(current) : "");
    setEditingDuration(sdId);
  }

  function commitDuration(sdId: string) {
    const mins = parseFloat(durationInput);
    if (!isNaN(mins) && mins > 0) {
      onSetStageDuration?.(sdId, mins);
    } else {
      onClearStageDuration?.(sdId);
    }
    setEditingDuration(null);
    setDurationInput("");
  }

  function handleDurationKey(e: React.KeyboardEvent, sdId: string) {
    if (e.key === "Enter") commitDuration(sdId);
    if (e.key === "Escape") { setEditingDuration(null); setDurationInput(""); }
  }

  function startEditDesc(key: string, currentValue: string) {
    setDescInput(currentValue);
    setEditingDescId(key);
    // Focus happens via autoFocus on the input
  }

  function commitDesc(key: string) {
    const trimmed = descInput.trim();
    if (key.startsWith("scene:")) {
      const sceneId = key.slice(6);
      onSetSceneDescription?.(sceneId, trimmed || null);
    } else if (key.startsWith("act:")) {
      const actId = key.slice(4);
      onSetActDescription?.(actId, trimmed || null);
    }
    setEditingDescId(null);
    setDescInput("");
  }

  function handleDescKey(e: React.KeyboardEvent, key: string) {
    if (e.key === "Enter") commitDesc(key);
    if (e.key === "Escape") { setEditingDescId(null); setDescInput(""); }
  }

  const canReorder = !!onSetSceneOrder;

  return (
    <div className="space-y-0">
      {/* Split dialog modal */}
      {splitDialogSceneId && (() => {
        const scene = sceneById.get(splitDialogSceneId);
        if (!scene) return null;
        const existingSplits = activeCut?.sceneSubdivisions?.[splitDialogSceneId]?.length ?? 0;
        const nextLabel = PART_LABELS[existingSplits + 1] ?? "?";
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={closeSplitDialog}>
            <div className="bg-white dark:bg-stone-900 rounded-lg shadow-xl border border-stone-200 dark:border-stone-700 max-w-sm w-full p-5" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-sm font-semibold text-stone-800 dark:text-stone-100 mb-1">
                Split &ldquo;{scene.title}&rdquo;
              </h3>
              <p className="text-xs text-stone-400 dark:text-stone-500 mb-3">
                Part {PART_LABELS[existingSplits]} ends / Part {nextLabel} begins
              </p>
              <div className="flex items-center gap-2 mb-3">
                <label className="text-xs text-stone-600 dark:text-stone-400 shrink-0">Split after line:</label>
                <input
                  type="number"
                  min="1"
                  value={splitLineInput}
                  onChange={(e) => setSplitLineInput(e.target.value)}
                  placeholder={splitPreview ? String(splitPreview.totalLines) : "…"}
                  autoFocus
                  className="w-20 text-sm px-2 py-1 rounded border border-stone-300 dark:border-stone-600 bg-white dark:bg-stone-900 text-stone-700 dark:text-stone-200 focus:outline-none focus:ring-1 focus:ring-amber-400"
                />
                {splitPreview && (
                  <span className="text-xs text-stone-400 dark:text-stone-500">of {splitPreview.totalLines}</span>
                )}
              </div>

              {splitPreviewError && (
                <p className="text-xs text-red-500 mb-2">{splitPreviewError}</p>
              )}

              {splitPreview && !splitPreviewError && (
                <div className="text-xs rounded border border-stone-100 dark:border-stone-800 bg-stone-50 dark:bg-stone-800/50 p-2 mb-3 space-y-0.5">
                  {splitPreview.linesBefore.map((l, i) => (
                    <p key={i} className="text-stone-500 dark:text-stone-400 truncate">
                      <span className="font-medium text-stone-600 dark:text-stone-300">{l.speaker}:</span> {l.text}
                    </p>
                  ))}
                  <div className="flex items-center gap-1 my-1">
                    <div className="flex-1 h-px bg-amber-300 dark:bg-amber-700" />
                    <span className="text-amber-600 dark:text-amber-400 text-xs font-medium px-1">Part {nextLabel} begins</span>
                    <div className="flex-1 h-px bg-amber-300 dark:bg-amber-700" />
                  </div>
                  {splitPreview.linesAfter.length > 0 ? splitPreview.linesAfter.map((l, i) => (
                    <p key={i} className="text-stone-500 dark:text-stone-400 truncate">
                      <span className="font-medium text-stone-600 dark:text-stone-300">{l.speaker}:</span> {l.text}
                    </p>
                  )) : (
                    <p className="text-stone-400 dark:text-stone-500 italic">(end of scene)</p>
                  )}
                </div>
              )}

              <div className="flex justify-end gap-2 mt-2">
                <button
                  onClick={closeSplitDialog}
                  className="text-xs px-3 py-1.5 rounded border border-stone-200 dark:border-stone-700 text-stone-600 dark:text-stone-400 hover:bg-stone-50 dark:hover:bg-stone-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmSplit}
                  disabled={!splitPreview}
                  className="text-xs px-3 py-1.5 rounded bg-amber-500 hover:bg-amber-600 disabled:bg-stone-200 dark:disabled:bg-stone-700 disabled:text-stone-400 dark:disabled:text-stone-500 text-white transition-colors font-medium"
                >
                  Split here
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {canReorder && (
        <p className="text-xs text-stone-400 dark:text-stone-400 mb-3 flex items-center gap-1">
          <span>⠿</span> Drag scenes to reorder · click split icon to subdivide scene · add notes as needed · add pauses as needed between any unit
        </p>
      )}
      {(() => {
        let lastActId: string | null = null;
        return effectiveSceneOrder.map((sceneId, idx) => {
        const scene = sceneById.get(sceneId);
        const act = sceneActMap.get(sceneId);
        if (!scene || !act) return null;

        // Render act header row when act changes
        const actChanged = act.id !== lastActId;
        lastActId = act.id;

        const sc = lineCounts.byScene[sceneId];
        const original = sc
          ? metric === "time" ? sc.words.original / wpm
          : metric === "words" ? sc.words.original : sc.lines.original
          : 0;
        const afterCut = sc
          ? metric === "time" ? sc.words.afterCut / wpm
          : metric === "words" ? sc.words.afterCut : sc.lines.afterCut
          : 0;

        const pctKept = original > 0 ? (afterCut / original) * 100 : 100;
        const hasCuts = afterCut < original - (metric === "time" ? 0.01 : 0.5);

        const pauseKey = `after:${sceneId}`;
        const pause = pauses?.[pauseKey];

        // Actor presence strip: actors who are on stage in this scene
        const actorPresence = actors.filter((a) => {
          const cell = actorSceneMatrix.get(a.id)?.get(sceneId);
          return cell && (cell.minutes > 0 || cell.originalMinutes > 0);
        });

        const isDragOver = dragOverSceneId === sceneId;

        // Act description header row (only at act boundary)
        const actDescKey = `act:${act.id}`;
        const actDesc = actDescriptions?.[act.id];

        return (
          <React.Fragment key={sceneId}>
            {actChanged && onSetActDescription && (
              <div className="pt-3 pb-1 group/actdesc">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold uppercase tracking-widest text-stone-400 dark:text-stone-500">
                    {act.title}
                  </span>
                  {editingDescId === actDescKey ? (
                    <input
                      autoFocus
                      type="text"
                      value={descInput}
                      onChange={(e) => setDescInput(e.target.value)}
                      onBlur={() => commitDesc(actDescKey)}
                      onKeyDown={(e) => handleDescKey(e, actDescKey)}
                      placeholder="Add act note…"
                      className="flex-1 text-xs italic px-1.5 py-0.5 rounded border border-amber-300 dark:border-amber-700 bg-white dark:bg-stone-900 text-stone-600 dark:text-stone-300 placeholder-stone-300 dark:placeholder-stone-600 focus:outline-none focus:ring-1 focus:ring-amber-400"
                    />
                  ) : actDesc ? (
                    <>
                      <span className="text-xs italic text-stone-400 dark:text-stone-500 flex-1">{actDesc}</span>
                      <button
                        onClick={() => startEditDesc(actDescKey, actDesc)}
                        className="opacity-0 group-hover/actdesc:opacity-100 text-stone-300 hover:text-amber-500 dark:text-stone-600 dark:hover:text-amber-400 transition-opacity"
                        title="Edit act note"
                      >
                        <svg className="w-3 h-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
                          <path d="M8 2l2 2-6 6H2V8l6-6z"/>
                        </svg>
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => startEditDesc(actDescKey, "")}
                      className="opacity-0 group-hover/actdesc:opacity-100 text-xs text-stone-300 hover:text-amber-500 dark:text-stone-500 dark:hover:text-amber-400 italic transition-opacity"
                    >
                      + add note
                    </button>
                  )}
                </div>
              </div>
            )}
          <div>
            <div
              className={`relative py-3 border-b border-stone-100 dark:border-stone-800 transition-colors group ${
                canReorder ? "cursor-grab" : ""
              } ${isDragOver ? "bg-amber-50 dark:bg-amber-950/30" : "hover:bg-stone-50/60 dark:hover:bg-stone-800/40"}`}
              draggable={canReorder}
              onDragStart={canReorder ? (e) => handleDragStart(e, sceneId) : undefined}
              onDragOver={canReorder ? (e) => handleDragOver(e, sceneId) : undefined}
              onDragLeave={canReorder ? handleDragLeave : undefined}
              onDrop={canReorder ? (e) => handleDrop(e, sceneId) : undefined}
              onDragEnd={canReorder ? handleDragEnd : undefined}
            >
              {/* Drop indicator */}
              {isDragOver && (
                <div className="pointer-events-none absolute -top-0.5 left-0 right-0 h-0.5 bg-amber-400 rounded-full" />
              )}

              {/* Act label + scene title + drag handle */}
              <div className="flex items-baseline gap-2 mb-1.5">
                {canReorder && (
                  <span className="opacity-0 group-hover:opacity-100 text-stone-300 dark:text-stone-600 text-xs select-none shrink-0 transition-opacity cursor-grab">
                    ⠿
                  </span>
                )}
                <span className="text-xs text-stone-400 dark:text-stone-400 shrink-0">{act.title}</span>
                <span className="text-sm font-medium text-stone-700 dark:text-stone-200 truncate">{scene.title}</span>
                {/* Split button — shown when splitting is available and max 3 parts not reached */}
                {onAddSceneSplit && activeCut && (activeCut.sceneSubdivisions?.[sceneId]?.length ?? 0) < 2 && (
                  <button
                    onClick={(e) => { e.stopPropagation(); openSplitDialog(sceneId); }}
                    className="group/split flex items-center gap-1 text-stone-300 hover:text-amber-500 dark:text-stone-600 dark:hover:text-amber-400 transition-colors shrink-0 ml-1"
                  >
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="1" y="1" width="10" height="4" rx="1"/>
                      <rect x="1" y="7" width="10" height="4" rx="1"/>
                    </svg>
                    <span className="opacity-0 group-hover/split:opacity-100 transition-opacity text-xs">
                      Subdivide scene by line no
                    </span>
                  </button>
                )}
                <span className="ml-auto text-xs tabular-nums text-stone-500 dark:text-stone-400 shrink-0">
                  {metric === "time"
                    ? formatMinutes(afterCut)
                    : afterCut.toLocaleString()}
                  {hasCuts && (
                    <span className="text-stone-300 dark:text-stone-600 ml-1">
                      / {metric === "time" ? formatMinutes(original) : original.toLocaleString()}
                    </span>
                  )}
                </span>
              </div>

              {/* Cut bar */}
              <div className="h-1.5 bg-stone-100 dark:bg-stone-800 rounded-full overflow-hidden mb-2">
                <div
                  className={`h-full rounded-full transition-all ${hasCuts ? "bg-amber-400" : "bg-stone-300"}`}
                  style={{ width: `${Math.min(100, pctKept)}%` }}
                />
              </div>

              {/* Scene description */}
              {(() => {
                const descKey = `scene:${sceneId}`;
                const desc = sceneDescriptions?.[sceneId];
                const isEditing = editingDescId === descKey;
                const canEdit = !!onSetSceneDescription;
                if (!canEdit) return desc ? <p className="text-xs italic text-stone-400 dark:text-stone-500 mb-1.5">{desc}</p> : null;
                return (
                  <div className="mb-1.5 group/desc">
                    {isEditing ? (
                      <input
                        ref={descInputRef}
                        autoFocus
                        type="text"
                        value={descInput}
                        onChange={(e) => setDescInput(e.target.value)}
                        onBlur={() => commitDesc(descKey)}
                        onKeyDown={(e) => handleDescKey(e, descKey)}
                        placeholder="Add a production note…"
                        className="w-full text-xs italic px-1.5 py-0.5 rounded border border-amber-300 dark:border-amber-700 bg-white dark:bg-stone-900 text-stone-600 dark:text-stone-300 placeholder-stone-300 dark:placeholder-stone-600 focus:outline-none focus:ring-1 focus:ring-amber-400"
                      />
                    ) : desc ? (
                      <div className="flex items-start gap-1">
                        <p className="text-xs italic text-stone-400 dark:text-stone-500 flex-1">{desc}</p>
                        <button
                          onClick={() => startEditDesc(descKey, desc)}
                          className="opacity-0 group-hover/desc:opacity-100 shrink-0 text-stone-300 hover:text-amber-500 dark:text-stone-600 dark:hover:text-amber-400 transition-opacity mt-0.5"
                          title="Edit note"
                        >
                          <svg className="w-3 h-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
                            <path d="M8 2l2 2-6 6H2V8l6-6z"/>
                          </svg>
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => startEditDesc(descKey, "")}
                        className="opacity-0 group-hover/desc:opacity-100 text-xs text-stone-300 hover:text-amber-500 dark:text-stone-500 dark:hover:text-amber-400 italic transition-opacity"
                      >
                        + add note
                      </button>
                    )}
                  </div>
                );
              })()}

              {/* Song / dance sub-rows (speech songs + song/dance SDs) */}
              {sceneSongDanceSDs?.get(sceneId)?.map((item) => {
                const isBoth = item.isSong && item.isDance;
                const colorClass = item.isSong
                  ? "text-violet-600 dark:text-violet-400"
                  : "text-cyan-600 dark:text-cyan-400";
                const borderColor = isBoth
                  ? "border-violet-200 dark:border-violet-800"
                  : item.isSong ? "border-violet-200 dark:border-violet-800" : "border-cyan-200 dark:border-cyan-800";
                const bgColor = isBoth ? "" : item.isSong ? "bg-violet-50 dark:bg-violet-950/30" : "bg-cyan-50 dark:bg-cyan-950/30";
                // Diagonal stripe for song+dance: violet→cyan at 135°
                const bgStyle = isBoth
                  ? { background: "repeating-linear-gradient(135deg, color-mix(in srgb, #7c3aed 12%, transparent) 0px, color-mix(in srgb, #7c3aed 12%, transparent) 4px, color-mix(in srgb, #0891b2 12%, transparent) 4px, color-mix(in srgb, #0891b2 12%, transparent) 8px)" }
                  : undefined;
                const focusRing = item.isSong ? "focus:ring-violet-400" : "focus:ring-cyan-400";
                const current = stageDurations?.[item.id];
                const isEditing = editingDuration === item.id;
                const canEdit = !!onSetStageDuration;

                return (
                  <div key={item.id} className={`mt-1.5 flex items-center gap-2 text-xs rounded px-2 py-1 ${bgColor} border ${borderColor}`} style={bgStyle}>
                    {isBoth ? (
                      <span className="shrink-0">
                        <span className="text-violet-600 dark:text-violet-400">♪</span><span className="text-cyan-600 dark:text-cyan-400">⊛</span>
                      </span>
                    ) : (
                      <span className={`shrink-0 ${colorClass}`}>{item.isSong ? "♪" : "⊛"}</span>
                    )}
                    <span className={`flex-1 italic truncate ${colorClass}`} title={item.label}>{item.label}</span>
                    {canEdit && (
                      isEditing ? (
                        <div className="flex items-center gap-1 shrink-0">
                          <input
                            type="number"
                            min="0"
                            step="0.5"
                            value={durationInput}
                            onChange={(e) => setDurationInput(e.target.value)}
                            onBlur={() => commitDuration(item.id)}
                            onKeyDown={(e) => handleDurationKey(e, item.id)}
                            autoFocus
                            className={`w-14 text-xs px-1 py-0.5 rounded border border-stone-300 dark:border-stone-600 bg-white dark:bg-stone-900 text-stone-700 dark:text-stone-300 focus:outline-none focus:ring-1 ${focusRing}`}
                            placeholder="0"
                          />
                          <span className="text-stone-400 dark:text-stone-500">min</span>
                        </div>
                      ) : current ? (
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={() => startEditDuration(item.id)}
                            className="text-xs px-1.5 py-0.5 rounded border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/50 transition-colors"
                            title="Edit duration"
                          >
                            +{current % 1 === 0 ? current : current.toFixed(1)}m
                          </button>
                          <button
                            onClick={() => onClearStageDuration?.(item.id)}
                            className="text-stone-300 hover:text-stone-500 dark:text-stone-600 dark:hover:text-stone-400 transition-colors"
                            title="Remove duration"
                          >
                            ×
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => startEditDuration(item.id)}
                          className="shrink-0 text-xs text-stone-300 hover:text-amber-600 dark:text-stone-600 dark:hover:text-amber-400 transition-colors"
                          title={`Add extra time for this ${item.isSong && item.isDance ? "song & dance" : item.isSong ? "song" : "dance"}`}
                        >
                          + time
                        </button>
                      )
                    )}
                    {!canEdit && current && (
                      <span className="text-xs text-amber-600 dark:text-amber-400 shrink-0">+{current % 1 === 0 ? current : current.toFixed(1)}m</span>
                    )}
                  </div>
                );
              })}

              {/* Actor presence strip */}
              {actorPresence.length > 0 && (
                <div className="flex gap-1 flex-wrap">
                  {actorPresence.map((actor) => {
                    const cell = actorSceneMatrix.get(actor.id)?.get(sceneId);
                    return (
                      <div
                        key={actor.id}
                        className="flex items-center gap-1 text-xs px-1.5 py-0.5 rounded-full border"
                        style={{
                          borderColor: actor.color + "60",
                          backgroundColor: actor.color + "18",
                          color: actor.color,
                        }}
                        title={`${actor.name}: ${cell ? formatMinutes(cell.minutes) : "0"} on stage`}
                      >
                        <span
                          className="w-1.5 h-1.5 rounded-full shrink-0"
                          style={{ backgroundColor: actor.color }}
                        />
                        <span className="text-stone-600" style={{ color: actor.color + "cc" }}>
                          {actor.name}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Sub-scene rows — rendered when this scene has been subdivided */}
            {subScenesByRealId.has(sceneId) && subScenesByRealId.get(sceneId)!.map((entry) => {
              const sc = lineCounts.byScene[entry.id];
              const subOrig = sc
                ? metric === "time" ? sc.words.original / wpm
                : metric === "words" ? sc.words.original : sc.lines.original
                : 0;
              const subAfterCut = sc
                ? metric === "time" ? sc.words.afterCut / wpm
                : metric === "words" ? sc.words.afterCut : sc.lines.afterCut
                : 0;
              const subHasCuts = subAfterCut < subOrig - (metric === "time" ? 0.01 : 0.5);
              const subPauseKey = `after:${entry.id}`;
              const subPause = pauses?.[subPauseKey];
              // The split that created this part is at splits[partIndex - 1]; for part A (index 0) there's no remove button
              const splits = activeCut?.sceneSubdivisions?.[sceneId] ?? [];
              const splitToRemove = entry.partIndex > 0 ? splits[entry.partIndex - 1] : null;
              const isLastPart = entry.partIndex === entry.partCount - 1;

              return (
                <React.Fragment key={entry.id}>
                  <div className="ml-4 pl-3 border-l-2 border-amber-200 dark:border-amber-800 py-2 border-b border-stone-100 dark:border-stone-800 group/subsc">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/40 px-1.5 py-0.5 rounded shrink-0">
                        {entry.label}
                      </span>
                      <span className="text-xs text-stone-500 dark:text-stone-400 truncate">{entry.title}</span>
                      {/* Remove split button (visible on hover, only for parts B and C) */}
                      {splitToRemove && onRemoveSceneSplit && (
                        <button
                          onClick={() => onRemoveSceneSplit(sceneId, splitToRemove.id)}
                          title={`Remove split before Part ${entry.label}`}
                          className="opacity-0 group-hover/subsc:opacity-100 text-xs text-stone-300 hover:text-red-400 dark:text-stone-600 dark:hover:text-red-400 transition-opacity shrink-0"
                        >
                          ×
                        </button>
                      )}
                      <span className="ml-auto text-xs tabular-nums text-stone-500 dark:text-stone-400 shrink-0">
                        {metric === "time" ? formatMinutes(subAfterCut) : subAfterCut.toLocaleString()}
                        {subHasCuts && (
                          <span className="text-stone-300 dark:text-stone-600 ml-1">
                            / {metric === "time" ? formatMinutes(subOrig) : subOrig.toLocaleString()}
                          </span>
                        )}
                      </span>
                    </div>
                  </div>
                  {/* Pause slot between sub-scenes (not after the last sub-scene — that uses the parent's pause slot) */}
                  {!isLastPart && (
                    <PauseRow
                      afterSceneId={entry.id}
                      pause={subPause}
                      onSet={onSetPause}
                      onRemove={onRemovePause}
                    />
                  )}
                </React.Fragment>
              );
            })}

            {/* Suggested splits — shown for scenes with no existing splits + detected natural subdivisions */}
            {!subScenesByRealId.has(sceneId) && detectedSubdivisions?.has(sceneId) && (() => {
              const subs = detectedSubdivisions.get(sceneId)!;
              const isExpanded = expandedSuggestions.has(sceneId);
              return (
                <div className="ml-4 mt-1 mb-2">
                  <button
                    onClick={() => toggleSuggestion(sceneId)}
                    className="flex items-center gap-1 text-xs text-stone-400 dark:text-stone-500 hover:text-stone-600 dark:hover:text-stone-300"
                  >
                    <span>⊕</span>
                    <span>{subs.length} natural subdivision{subs.length !== 1 ? "s" : ""} detected</span>
                    <span className="text-stone-300 dark:text-stone-600">[{isExpanded ? "Hide" : "Show"}]</span>
                  </button>
                  {isExpanded && (
                    <div className="mt-1 space-y-1 border-l-2 border-stone-200 dark:border-stone-700 pl-3">
                      {subs.slice(0, -1).map((sub, i) => (
                        <div key={sub.id} className="flex items-center justify-between text-xs text-stone-500 dark:text-stone-400">
                          <span>
                            {PART_LABELS[i]}→{PART_LABELS[i + 1]}:{" "}
                            {sub.charSet.size} char{sub.charSet.size !== 1 ? "s" : ""} · ~{Math.round(sub.minutes)}m
                          </span>
                          {sub.splitAfterUnitId && onAddSceneSplit && (
                            <button
                              onClick={() => onAddSceneSplit(sceneId, sub.splitAfterUnitId!)}
                              className="ml-2 px-2 py-0.5 text-xs bg-amber-100 dark:bg-amber-900/40 border border-amber-300 dark:border-amber-700 rounded hover:bg-amber-200 dark:hover:bg-amber-900/70 transition-colors"
                            >
                              Apply split here
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}

            <PauseRow
              afterSceneId={sceneId}
              pause={pause}
              onSet={onSetPause}
              onRemove={onRemovePause}
            />

            {/* Spacer between items (except last) */}
            {idx < effectiveSceneOrder.length - 1 && pause && (
              <div className="h-1" />
            )}
          </div>
          </React.Fragment>
        );
      });
      })()}
    </div>
  );
}
