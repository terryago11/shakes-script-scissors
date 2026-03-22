/**
 * applyEdits.ts
 *
 * Pure functions for applying word-level EditOps to a line of text and
 * producing an array of annotated segments for inline diff rendering.
 *
 * A "segment" is a contiguous run of characters that share the same annotation:
 *   - type "kept"   → render as normal text
 *   - type "cut"    → render as <del> (red strikethrough)
 *   - type "insert" → render as <ins> (green underline), text from the op
 */

import type { EditOp } from "@/types/edit";

export type Segment =
  | { type: "kept"; text: string }
  | { type: "cut"; text: string; start: number; end: number; lineId: string }
  | { type: "insert"; text: string; offset: number; lineId: string };

/**
 * Given the canonical text of a line and all EditOps that apply to it,
 * return an ordered array of Segments for rendering.
 *
 * Ops are applied in document order (by start offset for cuts, by offset for inserts).
 * Overlapping cuts are merged.
 */
export function applyEditsToLine(
  lineId: string,
  text: string,
  ops: EditOp[]
): Segment[] {
  // Separate ops by type for this line
  const cuts = ops
    .filter((op): op is Extract<EditOp, { type: "cut" }> => op.type === "cut" && op.lineId === lineId)
    .sort((a, b) => a.start - b.start);

  const inserts = ops
    .filter((op): op is Extract<EditOp, { type: "insert" }> => op.type === "insert" && op.lineId === lineId)
    .sort((a, b) => a.offset - b.offset);

  if (cuts.length === 0 && inserts.length === 0) {
    return [{ type: "kept", text }];
  }

  // Merge overlapping/adjacent cut ranges
  const mergedCuts: Array<{ start: number; end: number }> = [];
  for (const cut of cuts) {
    const last = mergedCuts[mergedCuts.length - 1];
    if (last && cut.start <= last.end) {
      last.end = Math.max(last.end, cut.end);
    } else {
      mergedCuts.push({ start: cut.start, end: cut.end });
    }
  }

  // Build event list: cut boundaries + insert points
  type Event =
    | { pos: number; kind: "cut-start"; end: number }
    | { pos: number; kind: "cut-end" }
    | { pos: number; kind: "insert"; text: string };

  const events: Event[] = [];
  for (const { start, end } of mergedCuts) {
    events.push({ pos: start, kind: "cut-start", end });
    events.push({ pos: end, kind: "cut-end" });
  }
  for (const ins of inserts) {
    events.push({ pos: ins.offset, kind: "insert", text: ins.text });
  }
  // Deterministic sort: by position, then cut-start < cut-end < insert.
  // This ensures inserts placed at the same offset as a cut boundary always
  // appear AFTER the cut-end (i.e. outside the cut zone), giving stable
  // rendering regardless of the order ops were added.
  const kindOrder = (k: string) => k === "cut-start" ? 0 : k === "cut-end" ? 1 : 2;
  events.sort((a, b) => a.pos - b.pos || kindOrder(a.kind) - kindOrder(b.kind));

  const segments: Segment[] = [];
  let cursor = 0;
  let inCut = false;
  let cutStart = 0;

  function flushKept(until: number) {
    if (until > cursor && !inCut) {
      const kept = text.slice(cursor, until);
      if (kept) segments.push({ type: "kept", text: kept });
      cursor = until;
    }
  }

  for (const ev of events) {
    if (ev.kind === "insert") {
      if (inCut) {
        // The insert falls inside a cut range — split the cut here so the
        // inserted word stays visible between the two cut halves.
        const cutText = text.slice(cutStart, ev.pos);
        if (cutText) segments.push({ type: "cut", text: cutText, start: cutStart, end: ev.pos, lineId });
        segments.push({ type: "insert", text: ev.text, offset: ev.pos, lineId });
        cutStart = ev.pos; // resume the cut after the inserted word
        cursor = ev.pos;
      } else {
        flushKept(ev.pos);
        segments.push({ type: "insert", text: ev.text, offset: ev.pos, lineId });
      }
    } else if (ev.kind === "cut-start") {
      flushKept(ev.pos);
      inCut = true;
      cutStart = ev.pos;
    } else if (ev.kind === "cut-end") {
      if (inCut) {
        const cutText = text.slice(cutStart, ev.pos);
        if (cutText) {
          segments.push({ type: "cut", text: cutText, start: cutStart, end: ev.pos, lineId });
        }
        cursor = ev.pos;
        inCut = false;
      }
    }
  }

  // Flush remaining kept text
  if (cursor < text.length) {
    segments.push({ type: "kept", text: text.slice(cursor) });
  }

  return segments;
}

/**
 * Given a line's segments, produce the "replacement" text (cuts removed, inserts included).
 * Used for cue script generation and line count estimation.
 */
export function segmentsToText(segments: Segment[]): string {
  return segments
    .filter((s) => s.type !== "cut")
    .map((s) => s.text)
    .join("");
}
