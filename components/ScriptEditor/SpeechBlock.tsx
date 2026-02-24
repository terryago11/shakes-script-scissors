"use client";

import type { Speech } from "@/types/play";
import type { LineWithStatus } from "@/types/cut";
import type { SpeechEdit } from "@/types/edit";
import { applyEditsToLine } from "@/lib/cuts/applyEdits";
import { useMetric } from "@/lib/ui/MetricContext";

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
}: Props) {
  const isCut = status === "cut";
  const readonly = onToggle === null;

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

  return (
    <div className="group flex gap-3 py-2 px-2 rounded">
      {/* Actor color bar */}
      <div
        className={`w-1 rounded-full shrink-0 mt-1 ${isCut ? "opacity-30" : ""}`}
        style={{ backgroundColor: actorColor || "#d1d5db", minHeight: "1.25rem" }}
      />

      <div className="flex-1 min-w-0">
        {/* Character name header — name, line count, and restore all on the left */}
        <div className="flex items-center gap-1.5 mb-1 min-w-0">
          <span
            className={`text-xs font-bold uppercase tracking-wider shrink-0 ${
              isCut ? "text-red-400 opacity-60 line-through" : isContinuation ? "text-stone-300" : "text-stone-600"
            }`}
            style={{ color: isCut || isContinuation ? undefined : actorColor || undefined }}
          >
            {isContinuation && !isCut
              ? <span className="font-normal italic normal-case tracking-normal text-stone-300">{speech.characterName.toLowerCase()} cont.</span>
              : speech.characterName}
          </span>

          {!isContinuation && (
            <span className="text-xs font-normal text-stone-400 normal-case tracking-normal shrink-0">
              {hasCuts && displayKept < displayOriginal ? (
                <><span className="text-amber-600">{displayKept.toLocaleString()}</span><span> / {displayOriginal.toLocaleString()}{metricLabel}</span></>
              ) : (
                `(${displayOriginal.toLocaleString()}${metricLabel})`
              )}
            </span>
          )}

          {/* Restore button — right next to name, shown on hover when any part is cut */}
          {!readonly && !cutModeActive && (isCut || hasWordEdits || hasLineCuts) && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (isCut) { onToggle?.(); } else { onClearEdits?.(speech.id); }
              }}
              className="opacity-0 group-hover:opacity-100 text-xs px-1.5 py-0.5 rounded border border-green-200 bg-green-50 text-green-700 hover:bg-green-100 hover:border-green-300 transition-all shrink-0"
              title={isCut ? "Restore entire speech" : "Remove all cuts from this speech"}
            >
              ↩ restore
            </button>
          )}
        </div>

        {/* Lines — compact view with inline diff */}
        <div className={`font-serif text-sm leading-relaxed ${isCut ? "text-red-400 opacity-60 line-through" : "text-stone-800"}`}>
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
                data-line-id={line.id}
                data-unit-id={speech.id}
                data-cut={isCut ? "true" : undefined}
                className={isLineCut ? "line-through text-red-400 opacity-60" : undefined}
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
      </div>
    </div>
  );
}
