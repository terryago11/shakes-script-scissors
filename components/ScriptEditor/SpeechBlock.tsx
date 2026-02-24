"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import type { Speech } from "@/types/play";
import type { LineWithStatus } from "@/types/cut";
import type { SpeechEdit, EditOp } from "@/types/edit";
import { applyEditsToLine } from "@/lib/cuts/applyEdits";

interface Props {
  speech: Speech;
  status: "kept" | "cut";
  actorColor?: string;
  onToggle: (() => void) | null;
  onToggleLine: ((lineId: string) => void) | null;
  lineStatuses?: LineWithStatus[];
  speechEdit?: SpeechEdit;
  onAddEditOp?: (unitId: string, op: EditOp) => void;
  onRemoveEditOp?: (unitId: string, lineId: string, start: number, end: number) => void;
  onClearEdits?: (unitId: string) => void;
  isContinuation?: boolean;
}

export default function SpeechBlock({
  speech,
  status,
  actorColor,
  onToggle,
  onToggleLine,
  lineStatuses,
  speechEdit,
  onAddEditOp,
  onRemoveEditOp,
  onClearEdits,
  isContinuation,
}: Props) {
  const isCut = status === "cut";
  const readonly = onToggle === null;
  const [lineEditMode, setLineEditMode] = useState(false);
  // Floating toolbar state: position + selection info
  const [toolbar, setToolbar] = useState<{
    x: number; y: number; lineId: string; start: number; end: number; text: string;
  } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Build line-level status map
  const lineStatusMap = new Map<string, "kept" | "cut">();
  if (lineStatuses) {
    for (const ls of lineStatuses) lineStatusMap.set(ls.lineId, ls.status);
  }
  const hasLineCuts = lineStatuses ? lineStatuses.some((ls) => ls.status === "cut") : false;
  const hasWordEdits = speechEdit ? speechEdit.ops.length > 0 : false;

  // Effective kept line count (considering per-line cuts)
  const keptLineCount = lineStatuses
    ? lineStatuses.filter((ls) => ls.status === "kept").length
    : speech.lineCount;

  // Handle text selection within a line element to show the cut toolbar
  const handleLineMouseUp = useCallback((lineId: string, lineText: string) => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !containerRef.current) {
      setToolbar(null);
      return;
    }
    const selText = sel.toString();
    if (!selText.trim()) { setToolbar(null); return; }

    // Find the character offset of the selection within the line text
    // We need to map the DOM selection back to offsets in the canonical text
    const range = sel.getRangeAt(0);
    const lineEl = containerRef.current.querySelector(`[data-line-id="${lineId}"]`);
    if (!lineEl) { setToolbar(null); return; }

    // Walk the text nodes within the line element to compute offsets
    let start = -1;
    let end = -1;
    let charCount = 0;
    const walker = document.createTreeWalker(lineEl, NodeFilter.SHOW_TEXT);
    let node: Text | null;
    while ((node = walker.nextNode() as Text | null)) {
      const nodeLen = node.nodeValue?.length ?? 0;
      if (node === range.startContainer) {
        start = charCount + range.startOffset;
      }
      if (node === range.endContainer) {
        end = charCount + range.endOffset;
        break;
      }
      charCount += nodeLen;
    }
    if (start === -1 || end === -1 || start >= end) { setToolbar(null); return; }

    // Map selection offsets back to canonical line text offsets
    // (the rendered text may include insert spans which aren't in the canonical text;
    //  for simplicity, we work only with cuts for now, so DOM text == canonical text
    //  for kept/cut segments, except insertions shift positions — keep it simple:
    //  we store offsets relative to the canonical text, so use the lineText directly)
    const canonStart = Math.max(0, Math.min(start, lineText.length));
    const canonEnd = Math.max(canonStart, Math.min(end, lineText.length));
    if (canonStart >= canonEnd) { setToolbar(null); return; }

    // Position the toolbar near the selection
    const rect = range.getBoundingClientRect();
    const containerRect = containerRef.current.getBoundingClientRect();
    setToolbar({
      x: rect.left - containerRect.left + rect.width / 2,
      y: rect.top - containerRect.top - 4,
      lineId,
      start: canonStart,
      end: canonEnd,
      text: lineText.slice(canonStart, canonEnd),
    });
  }, []);

  const commitCut = useCallback(() => {
    if (!toolbar || !onAddEditOp) return;
    onAddEditOp(speech.id, {
      type: "cut",
      lineId: toolbar.lineId,
      start: toolbar.start,
      end: toolbar.end,
    });
    window.getSelection()?.removeAllRanges();
    setToolbar(null);
  }, [toolbar, onAddEditOp, speech.id]);

  const dismissToolbar = useCallback(() => {
    setToolbar(null);
    window.getSelection()?.removeAllRanges();
  }, []);

  // Dismiss toolbar when clicking outside the toolbar element itself
  const toolbarRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!toolbar) return;
    function handleDocMouseDown(e: MouseEvent) {
      if (toolbarRef.current && !toolbarRef.current.contains(e.target as Node)) {
        setToolbar(null);
      }
    }
    document.addEventListener("mousedown", handleDocMouseDown);
    return () => document.removeEventListener("mousedown", handleDocMouseDown);
  }, [toolbar]);

  const showEditControls = !readonly && !isCut && (onToggleLine !== null || onAddEditOp !== null);

  return (
    <div
      ref={containerRef}
      className={`group flex gap-3 py-2 px-2 rounded transition-colors ${isCut ? "opacity-40 bg-stone-50" : ""}`}
      style={{ position: "relative" }}
    >
      {/* Floating cut toolbar — appears on text selection */}
      {toolbar && !readonly && (
        <div
          ref={toolbarRef}
          className="absolute z-20 flex items-center gap-1 bg-stone-800 text-white text-xs rounded shadow-lg px-2 py-1 -translate-x-1/2 -translate-y-full"
          style={{ left: toolbar.x, top: toolbar.y }}
          onMouseDown={(e) => e.preventDefault()} // don't collapse selection
        >
          <span className="text-stone-300 max-w-[12rem] truncate">"{toolbar.text}"</span>
          <button
            onClick={commitCut}
            className="ml-1 bg-red-500 hover:bg-red-400 text-white px-2 py-0.5 rounded text-xs font-medium"
            title="Cut selected text"
          >
            ✕ Cut
          </button>
          <button
            onClick={dismissToolbar}
            className="text-stone-400 hover:text-stone-200 px-1"
            title="Cancel"
          >
            ✕
          </button>
        </div>
      )}

      {/* Actor color indicator */}
      <div
        className="w-1 rounded-full shrink-0 mt-1"
        style={{ backgroundColor: actorColor || "#d1d5db", minHeight: "1.25rem" }}
      />

      <div className="flex-1 min-w-0">
        {/* Character name header row */}
        <div className="flex items-center gap-1 mb-1">
          <div
            className={`text-xs font-bold uppercase tracking-wider flex-1 min-w-0 ${
              isCut ? "text-stone-400 line-through" : isContinuation ? "text-stone-300" : "text-stone-600"
            }`}
            style={{ color: isCut || isContinuation ? undefined : actorColor || undefined }}
          >
            {isContinuation && !isCut ? (
              <span className="font-normal italic normal-case tracking-normal text-stone-300">
                {speech.characterName.toLowerCase()} cont.
              </span>
            ) : (
              <>
                {speech.characterName}
                <span className="ml-2 font-normal text-stone-400 normal-case tracking-normal">
                  {hasLineCuts ? (
                    <><span className="text-amber-600">{keptLineCount}</span><span>/{speech.lineCount}L</span></>
                  ) : (
                    `(${speech.lineCount}L)`
                  )}
                </span>
              </>
            )}
          </div>

          {/* Controls */}
          {showEditControls && (
            <div className="flex items-center gap-1 shrink-0">
              {/* Word/line edit mode toggle */}
              <button
                onClick={(e) => { e.stopPropagation(); setLineEditMode((m) => !m); setToolbar(null); }}
                className={`text-xs px-1.5 py-0.5 rounded transition-colors ${
                  lineEditMode || hasLineCuts || hasWordEdits
                    ? "bg-amber-100 text-amber-700 hover:bg-amber-200"
                    : "opacity-0 group-hover:opacity-100 text-stone-400 hover:text-stone-600 hover:bg-stone-100"
                }`}
                title={lineEditMode ? "Collapse editor" : "Edit lines / words"}
              >
                {lineEditMode ? "▲" : "≡"}
              </button>
              {/* Clear all word edits — shown when there are any */}
              {hasWordEdits && onClearEdits && (
                <button
                  onClick={(e) => { e.stopPropagation(); onClearEdits(speech.id); }}
                  className="opacity-0 group-hover:opacity-100 text-xs px-1.5 py-0.5 rounded text-stone-400 hover:text-red-400 hover:bg-stone-100 transition-colors"
                  title="Clear all word-level edits for this speech"
                >
                  ↺
                </button>
              )}
              {/* Speech-level cut toggle */}
              <button
                onClick={onToggle ?? undefined}
                className="opacity-0 group-hover:opacity-100 text-stone-400 hover:text-red-400 text-xs px-1 py-0.5 rounded hover:bg-stone-100 transition-colors"
                title="Cut entire speech"
              >
                ✕
              </button>
            </div>
          )}
          {!readonly && isCut && (
            <button
              onClick={onToggle ?? undefined}
              className="opacity-0 group-hover:opacity-100 text-stone-400 hover:text-stone-600 text-xs px-1 py-0.5 rounded hover:bg-stone-100 transition-colors shrink-0"
              title="Restore speech"
            >
              ↩
            </button>
          )}
        </div>

        {/* Lines */}
        {lineEditMode && !isCut ? (
          // Edit mode: word-level inline diff + line-level toggles
          <div className="font-serif text-sm leading-relaxed select-text">
            {speech.lines.map((line) => {
              const lineStatus = lineStatusMap.get(line.id) ?? "kept";
              const isLineCut = lineStatus === "cut";
              const ops = speechEdit?.ops ?? [];
              const segments = isLineCut ? [] : applyEditsToLine(line.id, line.text, ops);
              const hasOpsOnLine = ops.some((op) => op.lineId === line.id);

              if (isLineCut) {
                // Line-cut: show as full strikethrough, click to restore
                return (
                  <div
                    key={line.id}
                    data-line-id={line.id}
                    onClick={() => onToggleLine?.(line.id)}
                    className="cursor-pointer px-1 -mx-1 rounded hover:bg-stone-100 line-through text-red-400 hover:text-red-600 transition-colors"
                    title="Click to restore line"
                  >
                    {line.text}
                  </div>
                );
              }

              return (
                <div
                  key={line.id}
                  data-line-id={line.id}
                  className="px-1 -mx-1 rounded"
                  onMouseUp={() => onAddEditOp && handleLineMouseUp(line.id, line.text)}
                >
                  {segments.map((seg, i) => {
                    if (seg.type === "kept") {
                      return <span key={i} className="text-stone-800">{seg.text}</span>;
                    }
                    if (seg.type === "cut") {
                      return (
                        <del
                          key={i}
                          className="text-red-400 cursor-pointer hover:text-red-600"
                          title="Click to restore this cut"
                          onClick={(e) => {
                            e.stopPropagation();
                            onRemoveEditOp?.(speech.id, seg.lineId, seg.start, seg.end);
                          }}
                        >
                          {seg.text}
                        </del>
                      );
                    }
                    if (seg.type === "insert") {
                      return (
                        <ins key={i} className="text-green-600 no-underline underline decoration-green-400">
                          {seg.text}
                        </ins>
                      );
                    }
                  })}
                  {/* Line-cut button: cut the whole line — shown on hover when no cuts on this line */}
                  {onToggleLine && !hasOpsOnLine && (
                    <button
                      onClick={(e) => { e.stopPropagation(); onToggleLine(line.id); }}
                      className="ml-2 opacity-0 group-hover:opacity-60 hover:!opacity-100 text-stone-400 hover:text-red-400 text-xs transition-opacity"
                      title="Cut entire line"
                    >
                      ✕
                    </button>
                  )}
                </div>
              );
            })}
            {lineEditMode && onAddEditOp && (
              <div className="mt-1 text-xs text-stone-400 italic">
                Select text to cut words · click <del className="not-italic">struck text</del> to restore
              </div>
            )}
          </div>
        ) : (
          // Compact mode: show inline diff annotations even outside edit mode (read-only view of edits)
          <div className={`font-serif text-sm leading-relaxed ${isCut ? "text-stone-400" : "text-stone-800"}`}>
            {speech.lines.map((line) => {
              const lineStatus = lineStatusMap.get(line.id) ?? "kept";
              const isLineCut = !isCut && lineStatus === "cut";
              const ops = speechEdit?.ops ?? [];
              const segments = (!isCut && !isLineCut && ops.length > 0)
                ? applyEditsToLine(line.id, line.text, ops)
                : null;

              return (
                <div
                  key={line.id}
                  className={isLineCut ? "line-through text-red-400 opacity-60" : undefined}
                  onClick={!readonly && isCut ? (onToggle ?? undefined) : undefined}
                  style={{ cursor: !readonly && isCut ? "pointer" : undefined }}
                >
                  {segments ? (
                    segments.map((seg, i) => {
                      if (seg.type === "kept") return <span key={i}>{seg.text}</span>;
                      if (seg.type === "cut") return <del key={i} className="text-red-400 opacity-60">{seg.text}</del>;
                      if (seg.type === "insert") return <ins key={i} className="text-green-600 no-underline underline decoration-green-400">{seg.text}</ins>;
                    })
                  ) : (
                    line.text
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
