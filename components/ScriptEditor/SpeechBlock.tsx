"use client";

import { useState } from "react";
import type { Speech } from "@/types/play";
import type { LineWithStatus } from "@/types/cut";

interface Props {
  speech: Speech;
  status: "kept" | "cut";
  actorColor?: string;
  onToggle: (() => void) | null;
  onToggleLine: ((lineId: string) => void) | null;
  lineStatuses?: LineWithStatus[];
  isContinuation?: boolean;
}

export default function SpeechBlock({
  speech,
  status,
  actorColor,
  onToggle,
  onToggleLine,
  lineStatuses,
  isContinuation,
}: Props) {
  const isCut = status === "cut";
  const readonly = onToggle === null;
  // Line edit mode: expand to show individual line toggles
  const [lineEditMode, setLineEditMode] = useState(false);

  // Build a quick lookup from lineId → status
  const lineStatusMap = new Map<string, "kept" | "cut">();
  if (lineStatuses) {
    for (const ls of lineStatuses) lineStatusMap.set(ls.lineId, ls.status);
  }
  const hasLineCuts = lineStatuses ? lineStatuses.some((ls) => ls.status === "cut") : false;

  // Effective kept line count (considering per-line cuts)
  const keptLineCount = lineStatuses
    ? lineStatuses.filter((ls) => ls.status === "kept").length
    : speech.lineCount;

  return (
    <div className={`group flex gap-3 py-2 px-2 rounded transition-colors ${isCut ? "opacity-40 bg-stone-50" : ""}`}>
      {/* Actor color indicator */}
      <div
        className="w-1 rounded-full shrink-0 mt-1"
        style={{
          backgroundColor: actorColor || "#d1d5db",
          minHeight: "1.25rem",
        }}
      />

      <div className="flex-1 min-w-0">
        {/* Character name header row */}
        <div className="flex items-center gap-1 mb-1">
          <div
            className={`text-xs font-bold uppercase tracking-wider flex-1 min-w-0 ${
              isCut
                ? "text-stone-400 line-through"
                : isContinuation
                ? "text-stone-300"
                : "text-stone-600"
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
                    <>
                      <span className="text-amber-600">{keptLineCount}</span>
                      <span>/{speech.lineCount}L</span>
                    </>
                  ) : (
                    `(${speech.lineCount}L)`
                  )}
                </span>
              </>
            )}
          </div>

          {/* Controls: line-edit toggle + speech cut toggle (not shown in read-only mode) */}
          {!readonly && !isCut && (
            <div className="flex items-center gap-1 shrink-0">
              {/* Line-edit mode toggle — always show when there are line cuts, else show on hover */}
              {onToggleLine && (
                <button
                  onClick={(e) => { e.stopPropagation(); setLineEditMode((m) => !m); }}
                  className={`text-xs px-1.5 py-0.5 rounded transition-colors ${
                    lineEditMode || hasLineCuts
                      ? "bg-amber-100 text-amber-700 hover:bg-amber-200"
                      : "opacity-0 group-hover:opacity-100 text-stone-400 hover:text-stone-600 hover:bg-stone-100"
                  }`}
                  title={lineEditMode ? "Collapse line editor" : "Edit individual lines"}
                >
                  {lineEditMode ? "▲" : "≡"}
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
        {lineEditMode && !isCut && onToggleLine ? (
          // Line-edit mode: each line is individually clickable to cut/restore
          <div className="font-serif text-sm leading-relaxed">
            {speech.lines.map((line) => {
              const lineStatus = lineStatusMap.get(line.id) ?? "kept";
              const isLineCut = lineStatus === "cut";
              return (
                <div
                  key={line.id}
                  onClick={() => onToggleLine(line.id)}
                  className={`cursor-pointer px-1 -mx-1 rounded transition-colors hover:bg-stone-100 ${
                    isLineCut ? "line-through text-stone-300" : "text-stone-800"
                  }`}
                  title={isLineCut ? "Click to restore line" : "Click to cut line"}
                >
                  {line.text}
                </div>
              );
            })}
          </div>
        ) : (
          // Compact mode: render lines as a block; cut lines shown struck-through inline
          <div className={`font-serif text-sm leading-relaxed ${isCut ? "text-stone-400" : "text-stone-800"}`}>
            {speech.lines.map((line) => {
              const lineStatus = lineStatusMap.get(line.id) ?? "kept";
              const isLineCut = !isCut && lineStatus === "cut";
              return (
                <div
                  key={line.id}
                  className={isLineCut ? "line-through text-stone-300" : undefined}
                  onClick={!readonly && isCut ? (onToggle ?? undefined) : undefined}
                  style={{ cursor: !readonly && isCut ? "pointer" : undefined }}
                >
                  {line.text}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
