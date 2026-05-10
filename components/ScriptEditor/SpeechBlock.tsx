"use client";

import { useState, useRef, useEffect, Fragment } from "react";
import type { Character, Speech } from "@/types/play";
import type { LineWithStatus } from "@/types/cut";
import type { SpeechEdit } from "@/types/edit";
import { applyEditsToLine } from "@/lib/cuts/applyEdits";
import { useMetric } from "@/lib/ui/MetricContext";
import { useViewMode } from "@/lib/ui/ViewModeContext";
import { useEditMode } from "@/lib/ui/EditModeContext";
import { resolveCharacterName } from "@/lib/project/projectUtils";
import { useProject } from "@/lib/project/ProjectStore";
import { getWordGaps } from "@/lib/ui/textUtils";

interface Props {
  speech: Speech;
  status: "kept" | "cut";
  actorColor?: string;
  onToggle: (() => void) | null;
  lineStatuses?: LineWithStatus[];
  speechEdit?: SpeechEdit;
  onClearEdits?: (unitId: string) => void;
  isContinuation?: boolean;
  /** Cast list for the reassign dropdown */
  castList?: Character[];
  /**
   * Current speaker override for this speech.
   * null / undefined = use original speakers (speech.characterIds ?? [speech.characterId]).
   * string[] = director's override speaker list.
   */
  speechReassignedTo?: string[] | null;
  /** Characters with at least one kept entrance SD — others get ⚠ in dropdown */
  charsWithEntrance?: Set<string>;
  /** Characters currently on stage at this speech (for → ALL in chip editor) */
  onStageAtSpeech?: Set<string>;
  onReassign?: (unitId: string, characterIds: string[] | null) => void;
  /** Scene-relative line offset for this speech (for running line counter every 5 lines) */
  speechLineOffset?: number;
  /** Cut-level character display-name aliases */
  characterAliases?: Record<string, string>;
  /** "part1" = dashed bottom border; "part2" = merge button + "cont." label */
  splitRole?: "part1" | "part2";
  /** Called when user clicks a split zone between lines or within a line */
  onSplit?: (unitId: string, atLineIndex: number, atWordOffset?: number) => void;
  /** Called when user merges Part 2 back; receives the Part 2 line IDs for cleanup */
  onMerge?: (unitId: string, part2LineIds: string[]) => void;
}

export default function SpeechBlock({
  speech,
  status,
  actorColor,
  onToggle,
  lineStatuses,
  speechEdit,
  onClearEdits,
  isContinuation,
  castList,
  speechReassignedTo,
  charsWithEntrance,
  onStageAtSpeech,
  onReassign,
  speechLineOffset,
  characterAliases,
  splitRole,
  onSplit,
  onMerge,
}: Props) {
  const { viewMode, showLineNumbers } = useViewMode();
  const { activeTool } = useEditMode();
  const { activeCut, dispatch } = useProject();
  const { metric } = useMetric();
  const isCut = status === "cut";
  const readonly = onToggle === null;
  const [showReassign, setShowReassign] = useState(false);
  const [isEditingDeliveryNote, setIsEditingDeliveryNote] = useState(false);
  const [draftDeliveryNote, setDraftDeliveryNote] = useState("");

  // Word-insert popover state (Insert tool) — includes click coordinates for fixed positioning.
  // editOpIndex: if set, editing an existing insert op; if undefined, creating a new one.
  const [wordInsertState, setWordInsertState] = useState<{ lineId: string; offset: number; popoverX: number; popoverY: number; editOpIndex?: number } | null>(null);
  const [wordInsertText, setWordInsertText] = useState("");

  const isClean = viewMode === "clean";

  // In clean mode, hide cut speeches entirely
  if (isCut && viewMode === "clean") return null;

  const lineStatusMap = new Map<string, "kept" | "cut">();
  if (lineStatuses) {
    for (const ls of lineStatuses) lineStatusMap.set(ls.lineId, ls.status);
  }
  const hasLineCuts = lineStatuses ? lineStatuses.some((ls) => ls.status === "cut") : false;
  const hasWordEdits = speechEdit ? speechEdit.ops.length > 0 : false;
  const effectiveDeliveryNote: string | undefined =
    activeCut?.deliveryNoteEdits != null && speech.id in activeCut.deliveryNoteEdits
      ? activeCut.deliveryNoteEdits[speech.id] || undefined
      : speech.deliveryNote;
  const hasDeliveryNoteEdit =
    activeCut?.deliveryNoteEdits != null && speech.id in activeCut.deliveryNoteEdits;

  const keptLineCount = lineStatuses
    ? lineStatuses.filter((ls) => ls.status === "kept").length
    : speech.lineCount;
  void keptLineCount;

  // Word counts (for words metric display)
  const totalWords = speech.lines.reduce((sum, line) => {
    return sum + line.text.trim().split(/\s+/).filter(Boolean).length;
  }, 0);

  const keptWords = isCut
    ? 0
    : speech.lines.reduce((sum, line) => {
        const lineStatus = lineStatusMap.get(line.id) ?? "kept";
        if (lineStatus === "cut") return sum;
        const ops = speechEdit?.ops ?? [];
        if (ops.length > 0) {
          const segs = applyEditsToLine(line.id, line.text, ops);
          return sum + segs
            .filter((s) => s.type === "kept" || s.type === "insert")
            .reduce((ws, s) => ws + s.text.trim().split(/\s+/).filter(Boolean).length, 0);
        }
        return sum + line.text.trim().split(/\s+/).filter(Boolean).length;
      }, 0);

  // Effective line count: a line is only kept if it still has content after word-level ops
  const keptLines = isCut
    ? 0
    : speech.lines.reduce((sum, line) => {
        const lineStatus = lineStatusMap.get(line.id) ?? "kept";
        if (lineStatus === "cut") return sum;
        const ops = speechEdit?.ops ?? [];
        if (ops.length > 0) {
          const segs = applyEditsToLine(line.id, line.text, ops);
          const keptText = segs.filter((s) => s.type !== "cut").map((s) => s.text).join("").trim();
          return keptText.length > 0 ? sum + 1 : sum;
        }
        return sum + 1;
      }, 0);

  const hasCuts = isCut || hasLineCuts || hasWordEdits;
  const displayOriginal = metric === "lines" ? speech.lineCount : totalWords;
  const displayKept = metric === "lines" ? keptLines : keptWords;
  const metricLabel = metric === "lines" ? "L" : "W";

  const canReassign = !readonly && activeTool === "reassign" && !!onReassign && !!castList && castList.length > 0;

  // Resolve display name: alias overrides castList name (falls back via resolveCharacterName)
  const resolvedSpeakerName = resolveCharacterName(speech.characterId, characterAliases, castList ?? []);

  // Effective speakers: override list, or TEI multi-speaker list, or single original
  const originalSpeakers: string[] = speech.characterIds ?? [speech.characterId];
  // "__ALL__" sentinel: director marked this speech to display as ALL (pure display override).
  // Line count attribution still uses originalSpeakers; no actual speaker list change.
  const isAllOverride = speechReassignedTo?.[0] === "__ALL__";
  // hasReassignment = director set a speaker list that DIFFERS from the original.
  // Excludes: __ALL__ sentinel (display-only), same-as-original lists (no real change).
  const hasReassignment =
    !isAllOverride &&
    speechReassignedTo != null &&
    speechReassignedTo.length > 0 &&
    !(
      speechReassignedTo.length === originalSpeakers.length &&
      speechReassignedTo.every((id, i) => id === originalSpeakers[i])
    );
  const effectiveSpeakers: string[] = hasReassignment ? speechReassignedTo! : originalSpeakers;

  // "ALL" display: tag-based (original TEI says ALL) OR director-set __ALL__ sentinel (legacy)
  const isAllByTag = /\bALL\b/i.test(speech.speakerTag);
  const isAllSpeech = isAllByTag ? !hasReassignment : isAllOverride;

  // Resolved names for each effective speaker
  const resolvedEffectiveNames = effectiveSpeakers.map((id) =>
    resolveCharacterName(id, characterAliases, castList ?? [])
  );

  // Auto-ALL: if the effective speaker list exactly matches all on-stage cast members,
  // display as ALL regardless of how speakers were set (→ ALL button or manual adds).
  // On-stage set is filtered to castList members so non-speaking extras are excluded.
  const onStageFiltered = onStageAtSpeech
    ? [...onStageAtSpeech].filter((id) => (castList ?? []).some((c) => c.id === id))
    : [];
  const isAutoAll =
    onStageFiltered.length > 1 &&
    effectiveSpeakers.length === onStageFiltered.length &&
    effectiveSpeakers.every((id) => onStageAtSpeech!.has(id));

  // isDisplayAll: show violet ALL badge — tag-based, legacy sentinel, or auto-detected
  const isDisplayAll = isAllSpeech || isAutoAll;

  // Song speech: at least one line is a sung line (from a non-poem <lg> stanza)
  const isSongSpeech = speech.isSong === true;
  // Duration added in the Scenes & Pauses dashboard for this song
  const stageDuration = isSongSpeech && !isCut ? (activeCut?.stageDurations?.[speech.id] ?? null) : null;
  // Line-level song overrides (Song/Dance tool)
  const lineSongOverrides = activeCut?.lineSongOverrides;

  // Per-cut partIndent overrides
  const partIndentOverrides = activeCut?.partIndentOverrides;

  // In clean mode with reassignment, show the new speaker name(s) directly
  const effectiveSpeakerName = isClean && hasReassignment
    ? (isDisplayAll ? "ALL" : resolvedEffectiveNames.join(" & "))
    : resolvedSpeakerName;

  // Shared name-rendering pieces — used for single-speaker non-reassigned display
  const nameClass = isCut
    ? "text-red-400 opacity-60 line-through"
    : (isContinuation && !isClean) ? "text-stone-300 dark:text-stone-600" : "text-stone-600 dark:text-stone-300";
  const nameColorStyle = (isCut || (isContinuation && !isClean)) ? undefined : actorColor || undefined;
  const nameContent = (isContinuation && !isCut && !isClean)
    ? <span className="font-normal italic normal-case tracking-normal text-stone-300 dark:text-stone-600">{effectiveSpeakerName.toLowerCase()} cont.</span>
    : <>{effectiveSpeakerName}</>;

  // Running line counter: every 5 lines, show scene-relative line number.
  // Standard mode counts ALL lines (cut or kept) so numbers match the full original text.
  // Clean/diff modes count only KEPT lines in the current cut.
  const countAllLines = viewMode === "standard";
  const lineNumMap = new Map<string, number | null>();
  if (speechLineOffset != null) {
    let keptCount = 0;
    for (const line of speech.lines) {
      const ls = lineStatusMap.get(line.id) ?? "kept";
      const shouldCount = countAllLines ? true : (!isCut && ls === "kept");
      if (shouldCount) {
        keptCount++;
        const lineNum = speechLineOffset + keptCount;
        lineNumMap.set(line.id, lineNum % 5 === 0 ? lineNum : null);
      } else {
        lineNumMap.set(line.id, null);
      }
    }
  }

  // Split zones shown when Split tool is active (word-level gaps within lines + ✂ between lines)
  const canSplit = !readonly && activeTool === "split" && !isCut && !!onSplit && viewMode !== "diff";

  // Word-insert and word-split: show word gap zones within lines
  const showWordGapsInMode = !readonly && !isCut && viewMode !== "diff" &&
    (activeTool === "insert" || activeTool === "split");

  function startDeliveryNoteEdit() {
    setDraftDeliveryNote(effectiveDeliveryNote ?? "");
    setIsEditingDeliveryNote(true);
  }
  function commitDeliveryNoteEdit() {
    dispatch({ type: "SET_DELIVERY_NOTE", speechId: speech.id, text: draftDeliveryNote.trim() });
    setIsEditingDeliveryNote(false);
  }

  function confirmWordInsert(lineId: string, offset: number) {
    if (!wordInsertText.trim()) return;
    // Add a leading space when the character before the insert offset is not already a space
    // (e.g. inserting after the last word, where there is no trailing space in the kept segment).
    const lineText = speech.lines.find((l) => l.id === lineId)?.text ?? "";
    const needsLeadingSpace = offset > 0 && lineText[offset - 1] !== " ";
    const text = (needsLeadingSpace ? " " : "") + wordInsertText.trim() + " ";
    // If editing an existing insert, remove the old op first then add the replacement
    if (wordInsertState?.editOpIndex !== undefined) {
      dispatch({ type: "REMOVE_EDIT_OP", unitId: speech.id, opIndex: wordInsertState.editOpIndex });
    }
    dispatch({ type: "BULK_ADD_EDIT_OPS", ops: [{ unitId: speech.id, op: { type: "insert", lineId, offset, text } }] });
    setWordInsertText("");
    setWordInsertState(null);
  }

  /** Detect character offset from a mouse click using browser caret APIs, then snap to nearest word boundary. */
  function getLineClickOffset(e: React.MouseEvent, text: string): number {
    let charOffset = 0;
    if (document.caretRangeFromPoint) {
      const range = document.caretRangeFromPoint(e.clientX, e.clientY);
      charOffset = range?.startOffset ?? 0;
    } else if ("caretPositionFromPoint" in document) {
      const pos = (document as unknown as { caretPositionFromPoint: (x: number, y: number) => { offset: number } | null }).caretPositionFromPoint(e.clientX, e.clientY);
      charOffset = pos?.offset ?? 0;
    } else {
      const rect = (e.target as HTMLElement).getBoundingClientRect();
      charOffset = Math.round(((e.clientX - rect.left) / rect.width) * text.length);
    }
    // Snap to nearest word boundary
    const gaps = getWordGaps(text);
    return gaps.reduce((best, g) =>
      Math.abs(g.offset - charOffset) < Math.abs(best - charOffset) ? g.offset : best, 0);
  }

  return (
    <div className={`group flex gap-3 py-2 px-2 rounded ${splitRole === "part1" && !isClean ? "border-b border-dashed border-stone-300 dark:border-stone-600 pb-3 mb-0.5" : ""}`}>
      {/* Actor color bar */}
      <div
        className={`w-1 rounded-full shrink-0 mt-1 ${isCut ? "opacity-30" : ""}`}
        style={{ backgroundColor: actorColor || "#d1d5db", minHeight: "1.25rem" }}
      />

      <div className="flex-1 min-w-0">
        {/* Character name header — hidden in clean view when this speech continues the same character */}
        <div className={`flex items-center gap-1.5 mb-1 min-w-0 flex-wrap ${isClean && isContinuation ? "hidden" : ""}`}>
          {/* Song indicator */}
          {isSongSpeech && !isCut && (
            <span className="text-xs text-violet-500 dark:text-violet-400 shrink-0" title="Song">♪</span>
          )}

          {/* Character name area — chip editor for all speech types in reassign mode */}
          {canReassign && !isCut ? (
            /* ── REASSIGN TOOL ACTIVE ─────────────────────────────────────────────────── */
            showReassign ? (
              <SpeakerChipEditor
                speech={speech}
                currentSpeakers={effectiveSpeakers}
                originalSpeakers={originalSpeakers}
                castList={castList!}
                charsWithEntrance={charsWithEntrance}
                onStageAtSpeech={onStageAtSpeech}
                characterAliases={characterAliases}
                isAllSpeech={isAllSpeech}
                isAllByTag={isAllByTag}
                isAllOverride={isAllOverride}
                onCommit={(ids) => {
                  // Null out if same as original (no real change)
                  const isUnchanged =
                    ids.length === originalSpeakers.length &&
                    ids.every((id, i) => id === originalSpeakers[i]);
                  onReassign!(speech.id, ids.length === 0 || isUnchanged ? null : ids);
                  setShowReassign(false);
                }}
                onClose={() => setShowReassign(false)}
              />
            ) : (
              /* Hover affordance — click to open chip editor */
              <span
                className="group/charname relative shrink-0 cursor-pointer rounded px-0.5 -mx-0.5 border border-transparent hover:border-stone-300 hover:bg-stone-50 dark:hover:border-stone-600 dark:hover:bg-stone-800 transition-colors flex items-center gap-1 flex-wrap"
                onClick={(e) => { e.stopPropagation(); setShowReassign(true); }}
                title="Click to edit speakers for this speech"
              >
                <span className="absolute -top-3 inset-x-0 flex justify-center opacity-0 group-hover/charname:opacity-100 transition-opacity pointer-events-none">
                  <span className="text-[9px] text-stone-400 leading-none">⇄</span>
                </span>
                <SpeakerLabel
                  originalSpeakers={originalSpeakers}
                  effectiveSpeakers={effectiveSpeakers}
                  hasReassignment={hasReassignment}
                  isDisplayAll={isDisplayAll}
                  isAllByTag={isAllByTag}
                  actorColor={actorColor}
                  castList={castList ?? []}
                  characterAliases={characterAliases}
                  isContinuation={isContinuation}
                  isCut={isCut}
                  isClean={isClean}
                  nameClass={nameClass}
                  nameColorStyle={nameColorStyle}
                  nameContent={nameContent}
                />
              </span>
            )
          ) : (
            /* ── NOT IN REASSIGN TOOL ─────────────────────────────────────────────────── */
            <span className="flex items-center gap-1 flex-wrap min-w-0">
              <SpeakerLabel
                originalSpeakers={originalSpeakers}
                effectiveSpeakers={effectiveSpeakers}
                hasReassignment={hasReassignment}
                isDisplayAll={isDisplayAll}
                isAllByTag={isAllByTag}
                actorColor={actorColor}
                castList={castList ?? []}
                characterAliases={characterAliases}
                isContinuation={isContinuation}
                isCut={isCut}
                isClean={isClean}
                nameClass={nameClass}
                nameColorStyle={nameColorStyle}
                nameContent={nameContent}
              />
            </span>
          )}

          {/* Delivery note — editable when edit-sds tool is active; hidden on continuation blocks */}
          {!isCut && !isContinuation && (() => {
            const canEdit = !readonly && activeTool === "edit-sds";
            const dotColor = hasDeliveryNoteEdit && !isClean
              ? (!speech.deliveryNote && !!activeCut?.deliveryNoteEdits?.[speech.id]
                  ? "bg-green-500"   // added where none existed
                  : "bg-red-500")    // edited or removed an existing TEI note
              : null;
            const dot = dotColor ? (
              <span
                className={`w-1.5 h-1.5 rounded-full ${dotColor} shrink-0 inline-block`}
                title={dotColor === "bg-green-500" ? "Delivery note added" : "Delivery note overridden"}
              />
            ) : null;

            if (isEditingDeliveryNote) return (
              <input
                key="delivery-input"
                type="text"
                autoFocus
                value={draftDeliveryNote}
                onChange={(e) => setDraftDeliveryNote(e.target.value)}
                onBlur={commitDeliveryNoteEdit}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === "Enter") { e.preventDefault(); commitDeliveryNoteEdit(); }
                  if (e.key === "Escape") { e.preventDefault(); setIsEditingDeliveryNote(false); }
                }}
                placeholder="[delivery note]"
                className="text-xs italic w-28 bg-stone-50 dark:bg-stone-800 border border-stone-300 dark:border-stone-600 rounded px-1.5 py-0 text-stone-600 dark:text-stone-300 focus:outline-none focus:border-amber-400 dark:focus:border-amber-500 shrink-0"
              />
            );

            if (canEdit) return (
              <span key="delivery-edit" className="flex items-center gap-0.5 shrink-0">
                {dot}
                {effectiveDeliveryNote && (
                  <span className="text-xs font-normal italic normal-case tracking-normal text-stone-400 dark:text-stone-500">
                    {effectiveDeliveryNote}
                  </span>
                )}
                <button
                  onClick={(e) => { e.stopPropagation(); startDeliveryNoteEdit(); }}
                  className="text-xs text-stone-400 hover:text-stone-600 dark:text-stone-500 dark:hover:text-stone-300 transition-colors"
                  title={effectiveDeliveryNote ? "Edit delivery note" : "Add delivery note"}
                >
                  {effectiveDeliveryNote ? "✎" : "+ note"}
                </button>
              </span>
            );

            if (effectiveDeliveryNote) return (
              <span key="delivery-display" className="flex items-center gap-0.5 shrink-0">
                {dot}
                <span className="text-xs font-normal italic normal-case tracking-normal text-stone-400 dark:text-stone-500">
                  {effectiveDeliveryNote}
                </span>
              </span>
            );

            // No effective delivery note but override exists (note suppressed) — show dot only
            if (dot) return <span key="delivery-dot" className="shrink-0">{dot}</span>;

            return null;
          })()}

          {/* Part 2 badge — "split" indicator; hidden in clean view; "cont." only if isContinuation covers it */}
          {splitRole === "part2" && !isCut && !isContinuation && !isClean && (
            <span className="text-[10px] text-stone-400 dark:text-stone-500 italic font-normal normal-case tracking-normal shrink-0">
              split
            </span>
          )}

          {!isContinuation && (
            <span className="text-xs font-normal text-stone-400 dark:text-stone-400 normal-case tracking-normal shrink-0">
              {hasCuts && displayKept < displayOriginal ? (
                isClean ? (
                  `(${displayKept.toLocaleString()}${metricLabel})`
                ) : (
                  <><span className="text-amber-600">{displayKept.toLocaleString()}</span><span> / {displayOriginal.toLocaleString()}{metricLabel}</span></>
                )
              ) : (
                `(${displayOriginal.toLocaleString()}${metricLabel})`
              )}
            </span>
          )}
          {/* Duration badge — shown when a song duration is set in the Scenes & Pauses dashboard */}
          {stageDuration != null && (
            <span className="text-xs text-amber-600 dark:text-amber-400 font-normal normal-case tracking-normal shrink-0">
              +{stageDuration % 1 === 0 ? stageDuration : stageDuration.toFixed(1)}m
            </span>
          )}

          {/* Restore button — only visible in Restore mode; always-shown (not hover-only) */}
          {!readonly && activeTool === "restore" && (isCut || hasWordEdits || hasLineCuts || hasReassignment || hasDeliveryNoteEdit) && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (isCut) { onToggle?.(); }
                if (hasWordEdits || hasLineCuts) { onClearEdits?.(speech.id); }
                if (hasReassignment) { onReassign?.(speech.id, null); }
                if (hasDeliveryNoteEdit) { dispatch({ type: "SET_DELIVERY_NOTE", speechId: speech.id, text: null }); }
              }}
              className="text-xs px-1.5 py-0.5 rounded border border-green-200 bg-green-50 text-green-700 hover:bg-green-100 hover:border-green-300 dark:border-green-800 dark:bg-green-950/50 dark:text-green-400 dark:hover:bg-green-900/50 dark:hover:border-green-700 transition-all shrink-0"
              title="Restore this speech"
            >
              ↩ restore
            </button>
          )}

          {/* Part 2 merge button — only shown in Split tool mode */}
          {splitRole === "part2" && !isCut && !!onMerge && activeTool === "split" && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onMerge!(speech.id, speech.lines.map((l) => l.id));
              }}
              className="opacity-0 group-hover:opacity-100 text-xs px-1.5 py-0.5 rounded border border-stone-300 bg-stone-50 text-stone-500 hover:bg-stone-100 hover:border-stone-400 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-400 dark:hover:bg-stone-700 transition-all shrink-0"
              title="Merge Part 2 back into Part 1"
            >
              ↩ merge
            </button>
          )}
        </div>

        {/* Lines — compact view with inline diff */}
        <div className={`font-serif text-sm leading-relaxed ${
          isCut
            ? viewMode === "diff"
              ? "text-red-500 line-through bg-red-50 dark:bg-red-950/50 rounded px-1"
              : "text-red-400 opacity-60 line-through"
            : "text-stone-800 dark:text-stone-100"
        }`}>
          {speech.lines.flatMap((line, lineIndex) => {
            const lineStatus = lineStatusMap.get(line.id) ?? "kept";
            const isLineCut = !isCut && lineStatus === "cut";
            // Per-line song: TEI value overridden by lineSongOverrides
            const effectiveLineSong = lineSongOverrides?.[line.id] ?? line.isSong ?? false;
            const isLineSong = !isCut && !isLineCut && effectiveLineSong;
            // Duration badge for song lines with a set duration
            const lineSongDuration = isLineSong ? (activeCut?.stageDurations?.[line.id] ?? null) : null;
            // Poem B-rhyme indent
            const isLinePoem = !isCut && !isLineCut && line.poemIndent === true;
            // Shared-verse indent — respects per-cut override
            const effectivePartIndent = !isCut && !isLineCut
              ? (partIndentOverrides?.[line.id] ?? line.partIndent ?? false)
              : false;

            // In clean mode, skip cut lines entirely
            if (isLineCut && viewMode === "clean") return [];

            const ops = speechEdit?.ops ?? [];
            const hasOpsOnLine = ops.some((op) => op.lineId === line.id);
            const segments = (!isCut && !isLineCut && hasOpsOnLine)
              ? applyEditsToLine(line.id, line.text, ops)
              : null;

            const lineNum = lineNumMap.get(line.id) ?? null;

            // Pre-compute insert ops for this line (in offset order) for edit/remove feature
            const insertOpsForLine = ops
              .map((op, opIdx) => ({ op, opIdx }))
              .filter((x): x is { op: { type: "insert"; lineId: string; offset: number; text: string }; opIdx: number } =>
                x.op.type === "insert" && x.op.lineId === line.id)
              .sort((a, b) => a.op.offset - b.op.offset);

            // Build standard segment content
            let insertSegCount = 0;
            const standardContent = segments ? (
              segments.map((seg, i) => {
                if (seg.type === "kept") return <span key={i}>{seg.text}</span>;
                if (seg.type === "cut") {
                  if (isClean) return null;
                  return viewMode === "diff"
                    ? <del key={i} className="text-red-500 bg-red-50 dark:bg-red-950/50 rounded">{seg.text}</del>
                    : <del key={i} className="text-red-400 opacity-60">{seg.text}</del>;
                }
                if (seg.type === "insert") {
                  const insInfo = insertOpsForLine[insertSegCount++];
                  const opIdx = insInfo?.opIdx ?? -1;
                  // In clean mode: render as plain text (no green styling)
                  if (isClean) return <span key={i} data-inserted="true">{seg.text}</span>;
                  const canEditIns = activeTool === "insert" && !readonly && opIdx >= 0;
                  const insContent = viewMode === "diff"
                    ? <ins className="text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-950/50 no-underline rounded px-0.5">{seg.text}</ins>
                    : <ins className="text-green-600 dark:text-green-400 no-underline underline decoration-green-400">{seg.text}</ins>;
                  if (!canEditIns) return <span key={i} data-inserted="true">{insContent}</span>;
                  return (
                    <span key={i} data-inserted="true" className="relative group/ins">
                      <span
                        className="cursor-pointer"
                        onClick={(e) => {
                          e.stopPropagation();
                          setWordInsertState({ lineId: line.id, offset: insInfo.op.offset, popoverX: e.clientX, popoverY: e.clientY, editOpIndex: opIdx });
                          setWordInsertText((insInfo.op.text ?? "").trimEnd());
                        }}
                        title="Click to edit this inserted word"
                      >{insContent}</span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          dispatch({ type: "REMOVE_EDIT_OP", unitId: speech.id, opIndex: opIdx });
                        }}
                        className="absolute -top-2.5 -right-1 opacity-0 group-hover/ins:opacity-100 text-[9px] w-3.5 h-3.5 flex items-center justify-center bg-red-100 dark:bg-red-900/50 text-red-500 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 rounded-full leading-none transition-opacity"
                        title="Remove this inserted word"
                      >×</button>
                    </span>
                  );
                }
              })
            ) : (
              line.text
            );

            // partIndent toggle — Split mode: show on first OR last line of this speech (not just TEI-marked)
            const isFirstLine = lineIndex === 0;
            const isLastLine = lineIndex === speech.lines.length - 1;
            const showPartIndentToggle = activeTool === "split" && !isCut && !isLineCut
              && (isFirstLine || isLastLine);
            const isSuppressed = partIndentOverrides?.[line.id] === false;
            const isManuallyAdded = partIndentOverrides?.[line.id] === true;

            // Song/Dance tool: click a line to toggle its sung status
            const canToggleLineSong = !readonly && !isCut && !isLineCut && activeTool === "song-dance" && viewMode !== "diff";
            const lineSongClickHandler = canToggleLineSong
              ? (e: React.MouseEvent) => {
                  e.stopPropagation();
                  dispatch({ type: "TOGGLE_LINE_SONG", lineId: line.id, currentValue: effectiveLineSong });
                }
              : undefined;

            // Click handler for line text — insert mode: open word-insert popover;
            // split mode: split at clicked word boundary (clean lines without existing ops only)
            const canInteractWithLine = showWordGapsInMode && !isLineCut && !hasOpsOnLine;
            const lineClickHandler = canInteractWithLine
              ? (e: React.MouseEvent<HTMLSpanElement>) => {
                  e.stopPropagation();
                  const offset = getLineClickOffset(e, line.text);
                  if (activeTool === "insert") {
                    setWordInsertState({ lineId: line.id, offset, popoverX: e.clientX, popoverY: e.clientY });
                    setWordInsertText("");
                  } else if (activeTool === "split" && onSplit && offset > 0 && offset < line.text.length) {
                    onSplit(speech.id, lineIndex, offset);
                  }
                }
              : undefined;

            const lineEl = (
              <div
                key={line.id}
                data-line-id={line.id}
                data-unit-id={speech.id}
                data-cut={isCut ? "true" : undefined}
                className={`flex items-baseline gap-1 ${isLineCut
                  ? viewMode === "diff"
                    ? "line-through text-red-500 bg-red-50 dark:bg-red-950/50 rounded px-0.5"
                    : "line-through text-red-400 opacity-60"
                  : isLineSong
                    ? `text-violet-700 dark:text-violet-300 italic ${isLinePoem ? "pl-6" : "pl-4"}`
                    : isLinePoem
                      ? "pl-6"
                      : ""}${canToggleLineSong ? " cursor-pointer hover:bg-violet-50 dark:hover:bg-violet-950/20 rounded" : ""}`}
                style={effectivePartIndent ? {
                  paddingLeft: isManuallyAdded && !line.partIndent
                    ? "10ch"
                    : `calc(${isLineSong ? (isLinePoem ? "1.5rem + " : "1rem + ") : ""}${((line.partIndentChars ?? 3) * 0.5).toFixed(1)}ch)`,
                } : undefined}
                onClick={lineSongClickHandler}
                title={canToggleLineSong ? (effectiveLineSong ? "Click to un-mark as sung" : "Click to mark as sung ♪") : undefined}
              >
                {/* partIndent toggle (Split mode — first/last line of speech) */}
                {showPartIndentToggle && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      // TEI-marked line: toggle suppress ↔ restore; unmarked line: toggle add ↔ remove
                      const nextValue = line.partIndent
                        ? (isSuppressed ? null : false)
                        : (isManuallyAdded ? null : true);
                      dispatch({ type: "SET_PART_INDENT_OVERRIDE", lineId: line.id, value: nextValue });
                    }}
                    className={`text-[10px] shrink-0 px-1 py-0.5 rounded border self-start mt-0.5 font-mono transition-colors select-none ${
                      isSuppressed || isManuallyAdded
                        ? "border-amber-400 text-amber-600 bg-amber-50 dark:bg-amber-950/30 hover:bg-amber-100 dark:hover:bg-amber-900/30"
                        : "border-stone-300 dark:border-stone-600 text-stone-500 dark:text-stone-400 bg-stone-50 dark:bg-stone-800 hover:border-amber-400 hover:text-amber-600 dark:hover:text-amber-400"
                    }`}
                    title={
                      isSuppressed ? "Restore shared-verse indent (↺ revert to TEI default)"
                      : isManuallyAdded ? "Remove manual shared-verse indent"
                      : line.partIndent ? "Suppress shared-verse indent (⇤ remove proportional indent)"
                      : "Add shared-verse indent (mark this as a shared metric line)"
                    }
                  >
                    {isSuppressed ? "⇥↺" : isManuallyAdded ? "⊕⇥↺" : line.partIndent ? "⇤" : "⊕⇥"}
                  </button>
                )}

                <span
                  className={`flex-1 ${canInteractWithLine
                    ? activeTool === "insert"
                      ? "cursor-text hover:bg-green-50 dark:hover:bg-green-950/20 rounded"
                      : "cursor-crosshair hover:bg-amber-50 dark:hover:bg-amber-950/20 rounded"
                    : ""}`}
                  onClick={lineClickHandler}
                  title={canInteractWithLine
                    ? activeTool === "insert" ? "Click to insert a word here" : "Click to split at this word"
                    : undefined}
                >
                  {standardContent}
                </span>

                {/* Read-only duration badge for song lines */}
                {lineSongDuration && (
                  <span className="not-italic text-xs text-amber-600 dark:text-amber-400 shrink-0">
                    (+{lineSongDuration % 1 === 0 ? lineSongDuration : lineSongDuration.toFixed(1)}m)
                  </span>
                )}

                {lineNum != null && showLineNumbers && (
                  <span className="text-sm text-stone-700 dark:text-stone-300 tabular-nums select-none shrink-0 font-normal not-italic leading-none">
                    {lineNum}
                  </span>
                )}
              </div>
            );

            // Between-line split zone — ✂ zones only when canSplit and not after the last line
            if (canSplit && lineIndex < speech.lines.length - 1) {
              return [
                lineEl,
                <div
                  key={`split-${line.id}`}
                  className="group/split flex items-center gap-0.5 -my-px opacity-0 hover:opacity-100 cursor-pointer transition-opacity"
                  onClick={(e) => { e.stopPropagation(); onSplit!(speech.id, lineIndex + 1); }}
                  title="Split here — Part 1 ends at this line, Part 2 starts at the next"
                >
                  <div className="flex-1 h-px bg-stone-300 dark:bg-stone-600" />
                  <span className="text-[9px] text-stone-400 group-hover/split:text-amber-600 dark:group-hover/split:text-amber-400 select-none leading-none px-1 font-sans not-italic">✂</span>
                  <div className="flex-1 h-px bg-stone-300 dark:bg-stone-600" />
                </div>,
              ];
            }

            return [lineEl];
          })}
        </div>
      </div>

      {/* Word-insert popover — fixed position at click coordinates */}
      {wordInsertState && (
        <div
          style={{
            position: "fixed",
            left: `${wordInsertState.popoverX}px`,
            top: `${wordInsertState.popoverY + 24}px`,
            zIndex: 9999,
          }}
          className="flex items-center gap-1 bg-white dark:bg-stone-900 border border-green-400 dark:border-green-600 rounded-lg px-2 py-1.5 shadow-xl whitespace-nowrap"
          onClick={(e) => e.stopPropagation()}
        >
          <input
            type="text"
            autoFocus
            value={wordInsertText}
            onChange={(e) => setWordInsertText(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter") confirmWordInsert(wordInsertState.lineId, wordInsertState.offset);
              if (e.key === "Escape") { setWordInsertState(null); setWordInsertText(""); }
            }}
            placeholder="Insert text…"
            className="text-sm w-40 outline-none bg-transparent text-stone-800 dark:text-stone-100 placeholder-stone-400"
          />
          <button
            onClick={() => confirmWordInsert(wordInsertState.lineId, wordInsertState.offset)}
            className="text-green-600 dark:text-green-400 text-sm font-medium"
          >✓</button>
          <button
            onClick={() => { setWordInsertState(null); setWordInsertText(""); }}
            className="text-stone-400 dark:text-stone-500 text-sm"
          >✕</button>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SpeakerChipEditor
// Inline chip-based editor for the multi-speaker reassign tool.
// Shows current speakers as removable chips + an "add" dropdown for new ones.
// ─────────────────────────────────────────────────────────────────────────────
function SpeakerChipEditor({
  currentSpeakers,
  originalSpeakers,
  castList,
  charsWithEntrance,
  onStageAtSpeech,
  characterAliases,
  isAllSpeech,
  isAllByTag,
  isAllOverride,
  onCommit,
}: {
  speech: Speech;
  currentSpeakers: string[];
  originalSpeakers: string[];
  castList: Character[];
  charsWithEntrance?: Set<string>;
  /** Characters actually on stage at this speech — used by → ALL button */
  onStageAtSpeech?: Set<string>;
  characterAliases?: Record<string, string>;
  isAllSpeech: boolean;
  /** Whether the TEI source tags this speech as ALL — drives ↺ orig collapse behaviour */
  isAllByTag: boolean;
  isAllOverride: boolean;
  onCommit: (ids: string[]) => void;
  onClose: () => void;
}) {
  const [speakers, setSpeakers] = useState<string[]>(currentSpeakers);
  const [showAdd, setShowAdd] = useState(false);
  // Which chip is currently showing its swap dropdown (by characterId)
  const [swappingId, setSwappingId] = useState<string | null>(null);
  // Whether "ALL ↓" has been clicked to expand to individual chips
  const [expanded, setExpanded] = useState(!isAllSpeech);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on outside click — commit current state
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onCommit(speakers);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [speakers, onCommit]);

  function removeChar(id: string) {
    setSpeakers((prev) => prev.filter((s) => s !== id));
  }

  function swapChar(oldId: string, newId: string) {
    setSpeakers((prev) => prev.map((s) => (s === oldId ? newId : s)));
    setSwappingId(null);
  }

  function addChar(id: string) {
    setSpeakers((prev) => (prev.includes(id) ? prev : [...prev, id]));
    setShowAdd(false);
  }

  // Expand the ALL badge to individual chips (for TEI-tagged ALL speeches)
  function expandAllBadge() {
    setSpeakers(originalSpeakers);
    setExpanded(true);
  }

  // Fill chips with all characters actually on stage at this speech.
  // Priority: onStageAtSpeech (exact on-stage tracking) > charsWithEntrance (scene proxy) > all castList.
  function fillAllOnStage() {
    const source = onStageAtSpeech ?? charsWithEntrance;
    const onStageIds = source
      ? [...source].filter((id) => castList.some((c) => c.id === id))
      : castList.map((c) => c.id);
    setSpeakers(onStageIds.length > 0 ? onStageIds : castList.map((c) => c.id));
    setExpanded(true);
  }

  const isUnchanged =
    speakers.length === originalSpeakers.length &&
    speakers.every((id, i) => id === originalSpeakers[i]);

  // All castList chars not currently in speakers (for + add dropdown)
  const available = castList.filter((c) => !speakers.includes(c.id));
  // For a swap dropdown: all cast members not already in speakers (except the one being swapped)
  function availableForSwap(currentId: string) {
    return castList.filter((c) => c.id !== currentId && !speakers.includes(c.id));
  }

  return (
    <div
      ref={containerRef}
      className="flex items-center gap-1 flex-wrap border border-amber-300 dark:border-amber-600 rounded px-1.5 py-0.5 bg-white dark:bg-stone-900"
      onClick={(e) => e.stopPropagation()}
    >
      {/* ALL badge (not yet expanded) — click to expand to individual chips */}
      {(isAllSpeech || isAllByTag) && !expanded && (
        <button
          onClick={expandAllBadge}
          className="text-xs px-1.5 py-0.5 rounded bg-violet-100 dark:bg-violet-950/50 text-violet-600 dark:text-violet-400 border border-violet-200 dark:border-violet-800 font-bold uppercase tracking-wider hover:bg-violet-200 dark:hover:bg-violet-900/50 transition-colors"
          title="Expand ALL to individual speakers"
        >
          ALL ↓
        </button>
      )}

      {/* Individual speaker chips */}
      {expanded && speakers.map((id) => (
        <span
          key={id}
          className="inline-flex items-center gap-0.5 text-xs font-bold uppercase tracking-wider px-1 py-0.5 rounded bg-amber-50 dark:bg-stone-800 border border-amber-200 dark:border-stone-600 text-stone-700 dark:text-stone-200"
        >
          {swappingId === id ? (
            /* Swap dropdown for this chip */
            <select
              autoFocus
              size={1}
              className="text-xs border border-amber-300 rounded px-1 py-0.5 bg-white dark:bg-stone-800 text-stone-700 dark:text-stone-200 focus:outline-none focus:ring-1 focus:ring-amber-400"
              defaultValue=""
              onChange={(e) => { if (e.target.value) swapChar(id, e.target.value); }}
              onBlur={() => setSwappingId(null)}
            >
              <option value="" disabled>Change to…</option>
              {availableForSwap(id).map((c) => {
                const noEntrance = charsWithEntrance ? !charsWithEntrance.has(c.id) : false;
                return (
                  <option key={c.id} value={c.id}>
                    {noEntrance ? "⚠ " : ""}{resolveCharacterName(c.id, characterAliases, castList)}
                  </option>
                );
              })}
            </select>
          ) : (
            /* Chip name — click to swap */
            <button
              onClick={() => setSwappingId(id)}
              className="hover:text-amber-700 dark:hover:text-amber-300 transition-colors"
              title="Click to change this speaker"
            >
              {resolveCharacterName(id, characterAliases, castList)}
            </button>
          )}
          {/* × to remove — hidden when only 1 chip (must keep at least 1 speaker) */}
          {speakers.length > 1 && (
            <button
              onClick={() => removeChar(id)}
              className="text-stone-400 hover:text-red-500 dark:hover:text-red-400 leading-none ml-0.5 font-normal text-sm"
              title={`Remove ${resolveCharacterName(id, characterAliases, castList)}`}
            >×</button>
          )}
        </span>
      ))}

      {/* Button row — order: add, all, orig, ✓ */}

      {/* ＋ add speaker */}
      {expanded && available.length > 0 && (
        showAdd ? (
          <select
            autoFocus
            size={1}
            className="text-xs border border-amber-300 rounded px-1 py-0.5 bg-white dark:bg-stone-800 text-stone-700 dark:text-stone-200 focus:outline-none focus:ring-1 focus:ring-amber-400"
            defaultValue=""
            onChange={(e) => { if (e.target.value) addChar(e.target.value); }}
            onBlur={() => setShowAdd(false)}
          >
            <option value="" disabled>Add speaker…</option>
            {available.map((c) => {
              const noEntrance = charsWithEntrance ? !charsWithEntrance.has(c.id) : false;
              return (
                <option key={c.id} value={c.id}>
                  {noEntrance ? "⚠ " : ""}{resolveCharacterName(c.id, characterAliases, castList)}
                </option>
              );
            })}
          </select>
        ) : (
          <button
            onClick={() => setShowAdd(true)}
            className="text-xs text-stone-400 hover:text-amber-600 dark:hover:text-amber-400 font-normal normal-case tracking-normal px-1 py-0.5 rounded border border-dashed border-stone-300 dark:border-stone-600 hover:border-amber-400 transition-colors"
            title="Add a speaker"
          >＋ add</button>
        )
      )}

      {/* → ALL: fill chips with all on-stage characters (always shown when expanded) */}
      {expanded && (
        <button
          onClick={fillAllOnStage}
          className="text-[10px] text-violet-500 dark:text-violet-400 hover:text-violet-700 dark:hover:text-violet-300 px-1 py-0.5 rounded border border-violet-200 dark:border-violet-700 hover:border-violet-400 transition-colors normal-case font-normal tracking-normal"
          title="Fill with all on-stage characters"
        >→ ALL</button>
      )}

      {/* ↺ orig — restore original speakers; shown when list changed or when ALL was expanded */}
      {expanded && (!isUnchanged || isAllSpeech || isAllByTag) && (
        <button
          onClick={() => {
            setSpeakers(originalSpeakers);
            // Collapse back to ALL badge for any TEI-tagged ALL speech (even if it had an override)
            if (isAllSpeech || isAllByTag) setExpanded(false);
          }}
          className="text-[10px] text-stone-400 hover:text-amber-600 dark:hover:text-amber-400 px-1 py-0.5 rounded border border-stone-200 dark:border-stone-700 hover:border-amber-400 transition-colors normal-case font-normal tracking-normal"
          title={(isAllSpeech || isAllByTag) ? "Collapse back to ALL" : "Restore original speakers"}
        >↺ orig</button>
      )}

      {/* ✓ confirm */}
      <button
        onClick={() => {
          if (!expanded && (isAllSpeech || isAllByTag)) {
            // Collapsed ALL badge state (original TEI or ↺ orig restored) — clear any override
            onCommit([]);
          } else {
            onCommit(speakers);
          }
        }}
        className="text-xs text-green-600 dark:text-green-400 font-medium hover:text-green-700 dark:hover:text-green-300 px-1 py-0.5 rounded hover:bg-green-50 dark:hover:bg-green-950/30 transition-colors normal-case tracking-normal font-normal"
        title="Confirm speaker list"
      >✓</button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SpeakerLabel
// Renders the speaker header for a speech in all modes:
// - No reassignment: single or multi-speaker with actor color
// - With reassignment: ALL original speakers in red strikethrough + new speakers in green
// - ALL speech (TEI-tagged): violet ALL badge
// ─────────────────────────────────────────────────────────────────────────────
/** Comma-separated list with Oxford comma: "A", "A & B", "A, B, & C" */
function speakerSep(index: number, total: number): string {
  if (index >= total - 1) return "";           // last — no separator
  if (total === 2) return " & ";               // "A & B"
  if (index < total - 2) return ", ";          // "A, B, …"
  return ", & ";                               // "…, & C"
}

function SpeakerLabel({
  originalSpeakers,
  effectiveSpeakers,
  hasReassignment,
  isDisplayAll,
  isAllByTag,
  actorColor,
  castList,
  characterAliases,
  isContinuation,
  isCut,
  isClean,
  nameClass,
  nameColorStyle,
  nameContent,
}: {
  originalSpeakers: string[];
  effectiveSpeakers: string[];
  hasReassignment: boolean;
  isDisplayAll: boolean;
  /** Whether the TEI source tags this speech as ALL — crossed-out origin shows "ALL" not individual names */
  isAllByTag: boolean;
  actorColor?: string;
  castList: Character[];
  characterAliases?: Record<string, string>;
  isContinuation?: boolean;
  isCut: boolean;
  isClean: boolean;
  nameClass: string;
  nameColorStyle: string | undefined;
  nameContent: React.ReactNode;
}) {
  if (hasReassignment && !isCut && !isClean) {
    // Show original crossed out in red + new speakers in green.
    // If the original was TEI-tagged ALL, show the ALL badge struck through rather than
    // expanding to individual character names (which may not be meaningful).
    return (
      <span className="flex items-center flex-wrap gap-y-0.5">
        {/* Original speakers — red strikethrough */}
        {isAllByTag ? (
          <span className="text-xs font-bold uppercase tracking-wider px-1 py-0.5 rounded bg-red-50 dark:bg-red-950/30 text-red-400 border border-red-200 dark:border-red-800 line-through opacity-70">
            ALL
          </span>
        ) : originalSpeakers.map((id, i) => (
          <Fragment key={`orig-${id}`}>
            <span className="text-xs font-bold uppercase tracking-wider text-red-400 line-through">
              {resolveCharacterName(id, characterAliases, castList)}
            </span>
            {speakerSep(i, originalSpeakers.length) && (
              <span className="text-xs font-normal normal-case tracking-normal text-red-400 line-through whitespace-pre">
                {speakerSep(i, originalSpeakers.length)}
              </span>
            )}
          </Fragment>
        ))}
        {/* New speakers — green, or violet ALL badge */}
        {isDisplayAll ? (
          <span className="text-xs font-bold uppercase tracking-wider px-1 py-0.5 rounded bg-violet-100 dark:bg-violet-950/50 text-violet-600 dark:text-violet-400 border border-violet-200 dark:border-violet-800">
            ALL
          </span>
        ) : (
          effectiveSpeakers.map((id, i) => (
            <Fragment key={`new-${id}`}>
              <span className="text-xs font-bold uppercase tracking-wider text-green-700 dark:text-green-400">
                {resolveCharacterName(id, characterAliases, castList)}
              </span>
              {speakerSep(i, effectiveSpeakers.length) && (
                <span className="text-xs font-normal normal-case tracking-normal text-green-700 dark:text-green-400 whitespace-pre">
                  {speakerSep(i, effectiveSpeakers.length)}
                </span>
              )}
            </Fragment>
          ))
        )}
      </span>
    );
  }

  // No reassignment — standard display
  if (isDisplayAll) {
    return (
      <span className="text-xs font-bold uppercase tracking-wider px-1 py-0.5 rounded bg-violet-100 dark:bg-violet-950/50 text-violet-600 dark:text-violet-400 border border-violet-200 dark:border-violet-800">
        ALL
      </span>
    );
  }

  if (originalSpeakers.length > 1) {
    return (
      <span className="flex items-center flex-wrap gap-y-0.5">
        {originalSpeakers.map((id, i) => (
          <Fragment key={id}>
            <span
              className="text-xs font-bold uppercase tracking-wider text-stone-600 dark:text-stone-300"
              style={{ color: i === 0 ? actorColor : undefined }}
            >
              {resolveCharacterName(id, characterAliases, castList)}
            </span>
            {speakerSep(i, originalSpeakers.length) && (
              <span className="text-xs font-normal normal-case tracking-normal text-stone-400 whitespace-pre">
                {speakerSep(i, originalSpeakers.length)}
              </span>
            )}
          </Fragment>
        ))}
      </span>
    );
  }

  // Single speaker (continuation / regular)
  if (isCut) {
    return (
      <span className="text-xs font-bold uppercase tracking-wider text-red-400 opacity-60 line-through">
        {resolveCharacterName(originalSpeakers[0], characterAliases, castList)}
      </span>
    );
  }

  return (
    <span className={`text-xs font-bold uppercase tracking-wider ${nameClass}`} style={{ color: nameColorStyle }}>
      {nameContent}
    </span>
  );
}
