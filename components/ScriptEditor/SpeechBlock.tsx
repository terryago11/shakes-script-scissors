"use client";

import { useState } from "react";
import type { Character, Speech } from "@/types/play";
import type { LineWithStatus } from "@/types/cut";
import type { SpeechEdit } from "@/types/edit";
import { applyEditsToLine } from "@/lib/cuts/applyEdits";
import { useMetric } from "@/lib/ui/MetricContext";
import { useViewMode } from "@/lib/ui/ViewModeContext";
import { resolveCharacterName } from "@/lib/project/projectUtils";

interface Props {
  speech: Speech;
  status: "kept" | "cut";
  actorColor?: string;
  onToggle: (() => void) | null;
  lineStatuses?: LineWithStatus[];
  speechEdit?: SpeechEdit;
  onClearEdits?: (unitId: string) => void;
  isContinuation?: boolean;
  cutModeActive?: boolean;
  /** Cast list for the reassign dropdown */
  castList?: Character[];
  /** Current reassignment for this speech (null = original character) */
  speechReassignment?: string | null;
  /** Characters with at least one kept entrance SD — others get ⚠ in dropdown */
  charsWithEntrance?: Set<string>;
  onReassign?: (unitId: string, characterId: string | null) => void;
  /** Scene-relative line offset for this speech (for running line counter every 5 lines) */
  speechLineOffset?: number;
  /** Cut-level character display-name aliases */
  characterAliases?: Record<string, string>;
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
  cutModeActive,
  castList,
  speechReassignment,
  charsWithEntrance,
  onReassign,
  speechLineOffset,
  characterAliases,
}: Props) {
  const { viewMode } = useViewMode();
  const isCut = status === "cut";
  const readonly = onToggle === null;
  const [showReassign, setShowReassign] = useState(false);

  // In clean mode, hide cut speeches entirely
  if (isCut && viewMode === "clean") return null;

  const lineStatusMap = new Map<string, "kept" | "cut">();
  if (lineStatuses) {
    for (const ls of lineStatuses) lineStatusMap.set(ls.lineId, ls.status);
  }
  const hasLineCuts = lineStatuses ? lineStatuses.some((ls) => ls.status === "cut") : false;
  const hasWordEdits = speechEdit ? speechEdit.ops.length > 0 : false;

  const keptLineCount = lineStatuses
    ? lineStatuses.filter((ls) => ls.status === "kept").length
    : speech.lineCount;

  const { metric } = useMetric();

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

  // Reassignment label
  const reassignedChar = speechReassignment
    ? castList?.find((c) => c.id === speechReassignment)
    : null;

  const canReassign = !readonly && !cutModeActive && !!onReassign && !!castList && castList.length > 0;

  // Resolve display name: alias overrides castList name (falls back via resolveCharacterName)
  const resolvedSpeakerName = resolveCharacterName(speech.characterId, characterAliases, castList ?? []);
  const resolvedReassignedName = reassignedChar
    ? resolveCharacterName(reassignedChar.id, characterAliases, castList ?? [])
    : null;

  // Shared name-rendering pieces — used in both the clickable and non-clickable char name
  const nameClass = isCut
    ? "text-red-400 opacity-60 line-through"
    : reassignedChar
      ? "text-red-400 line-through"
      : isContinuation ? "text-stone-300 dark:text-stone-600" : "text-stone-600 dark:text-stone-300";
  const nameColorStyle = isCut || isContinuation || reassignedChar ? undefined : actorColor || undefined;
  const nameContent = isContinuation && !isCut
    ? <span className="font-normal italic normal-case tracking-normal text-stone-300 dark:text-stone-600">{resolvedSpeakerName.toLowerCase()} cont.</span>
    : <>{resolvedSpeakerName}</>;

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

  return (
    <div className="group flex gap-3 py-2 px-2 rounded">
      {/* Actor color bar */}
      <div
        className={`w-1 rounded-full shrink-0 mt-1 ${isCut ? "opacity-30" : ""}`}
        style={{ backgroundColor: actorColor || "#d1d5db", minHeight: "1.25rem" }}
      />

      <div className="flex-1 min-w-0">
        {/* Character name header */}
        <div className="flex items-center gap-1.5 mb-1 min-w-0">

          {/* Character name — hover shows border + tiny icon above; click opens reassign.
              Once reassigned, skip the affordance — use ↩ restore to go back instead. */}
          {canReassign && !isCut && !reassignedChar ? (
            showReassign ? (
              <select
                autoFocus
                size={1}
                onBlur={() => setShowReassign(false)}
                onChange={(e) => {
                  const val = e.target.value;
                  onReassign!(speech.id, val === "__original__" ? null : val);
                  setShowReassign(false);
                }}
                defaultValue={speechReassignment ?? "__original__"}
                className="text-xs border border-amber-300 rounded px-1 py-0.5 bg-white dark:bg-stone-800 text-stone-700 dark:text-stone-200 focus:outline-none focus:ring-1 focus:ring-amber-400 shrink-0"
                onClick={(e) => e.stopPropagation()}
              >
                <option value="__original__">— Original ({resolvedSpeakerName}) —</option>
                {castList!.map((char) => {
                  const noEntrance = charsWithEntrance ? !charsWithEntrance.has(char.id) : false;
                  const charDisplay = resolveCharacterName(char.id, characterAliases, castList!);
                  return (
                    <option key={char.id} value={char.id}>
                      {noEntrance ? "⚠ " : ""}{charDisplay}
                    </option>
                  );
                })}
              </select>
            ) : (
              <span
                className="group/charname relative shrink-0 cursor-pointer rounded px-0.5 -mx-0.5 border border-transparent hover:border-stone-300 hover:bg-stone-50 dark:hover:border-stone-600 dark:hover:bg-stone-800 transition-colors"
                onClick={(e) => { e.stopPropagation(); setShowReassign(true); }}
                title="Click to reassign this speech to another character"
              >
                {/* Tiny icon floats above the name on hover */}
                <span className="absolute -top-3 inset-x-0 flex justify-center opacity-0 group-hover/charname:opacity-100 transition-opacity pointer-events-none">
                  <span className="text-[9px] text-stone-400 dark:text-stone-500 leading-none">⇄</span>
                </span>
                <span className={`text-xs font-bold uppercase tracking-wider ${nameClass}`} style={{ color: nameColorStyle }}>
                  {nameContent}
                </span>
              </span>
            )
          ) : (
            <span className={`text-xs font-bold uppercase tracking-wider shrink-0 ${nameClass}`} style={{ color: nameColorStyle }}>
              {nameContent}
            </span>
          )}

          {/* Reassignment indicator — green insertion style */}
          {reassignedChar && !isCut && (
            <span className="text-xs text-green-700 dark:text-green-400 font-bold uppercase tracking-wider shrink-0">
              {resolvedReassignedName}
            </span>
          )}

          {!isContinuation && (
            <span className="text-xs font-normal text-stone-400 dark:text-stone-500 normal-case tracking-normal shrink-0">
              {hasCuts && displayKept < displayOriginal ? (
                <><span className="text-amber-600">{displayKept.toLocaleString()}</span><span> / {displayOriginal.toLocaleString()}{metricLabel}</span></>
              ) : (
                `(${displayOriginal.toLocaleString()}${metricLabel})`
              )}
            </span>
          )}

          {/* Restore button — shown on hover when any part is cut or reassigned */}
          {!readonly && !cutModeActive && (isCut || hasWordEdits || hasLineCuts || !!reassignedChar) && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (isCut) { onToggle?.(); }
                if (hasWordEdits || hasLineCuts) { onClearEdits?.(speech.id); }
                if (reassignedChar) { onReassign?.(speech.id, null); }
              }}
              className="opacity-0 group-hover:opacity-100 text-xs px-1.5 py-0.5 rounded border border-green-200 bg-green-50 text-green-700 hover:bg-green-100 hover:border-green-300 dark:border-green-800 dark:bg-green-950/50 dark:text-green-400 dark:hover:bg-green-900/50 dark:hover:border-green-700 transition-all shrink-0"
              title="Restore this speech"
            >
              ↩ restore
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
          {speech.lines.map((line) => {
            const lineStatus = lineStatusMap.get(line.id) ?? "kept";
            const isLineCut = !isCut && lineStatus === "cut";

            // In clean mode, skip cut lines entirely
            if (isLineCut && viewMode === "clean") return null;

            const ops = speechEdit?.ops ?? [];
            const segments = (!isCut && !isLineCut && ops.length > 0)
              ? applyEditsToLine(line.id, line.text, ops)
              : null;

            const lineNum = lineNumMap.get(line.id) ?? null;
            const lineContent = segments ? (
              segments.map((seg, i) => {
                if (seg.type === "kept") return <span key={i}>{seg.text}</span>;
                if (seg.type === "cut") {
                  if (viewMode === "clean") return null;
                  return viewMode === "diff"
                    ? <del key={i} className="text-red-500 bg-red-50 dark:bg-red-950/50 rounded">{seg.text}</del>
                    : <del key={i} className="text-red-400 opacity-60">{seg.text}</del>;
                }
                if (seg.type === "insert") return viewMode === "diff"
                  ? <ins key={i} className="text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-950/50 no-underline rounded px-0.5">{seg.text}</ins>
                  : <ins key={i} className="text-green-600 dark:text-green-400 no-underline underline decoration-green-400">{seg.text}</ins>;
              })
            ) : (
              line.text
            );

            return (
              <div
                key={line.id}
                data-line-id={line.id}
                data-unit-id={speech.id}
                data-cut={isCut ? "true" : undefined}
                className={`flex items-baseline gap-1 ${isLineCut
                  ? viewMode === "diff"
                    ? "line-through text-red-500 bg-red-50 dark:bg-red-950/50 rounded px-0.5"
                    : "line-through text-red-400 opacity-60"
                  : ""}`}
              >
                <span className="flex-1">{lineContent}</span>
                {lineNum != null && (
                  <span className="text-sm text-stone-700 dark:text-stone-300 tabular-nums select-none shrink-0 font-normal not-italic leading-none">
                    {lineNum}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
