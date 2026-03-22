/**
 * resolveSelection.ts
 *
 * Maps a browser DOM Range (from window.getSelection()) that may span
 * multiple speech blocks and lines into an array of LineEditTargets —
 * one per intersected kept line — each with canonical character offsets
 * into the original line text.
 *
 * Used by the freestyle cut mode in ScriptEditor.
 */

export interface LineEditTarget {
  unitId: string;
  lineId: string;
  start: number; // char offset in canonical line text (inclusive)
  end: number;   // char offset in canonical line text (exclusive)
}

/**
 * Given a DOM Range and the script container element, return one
 * LineEditTarget per kept line that the range touches.
 *
 * Requirements on the DOM:
 *   - Each line element must have data-line-id and data-unit-id attributes
 *   - Lines inside already-cut speeches must have data-cut="true"
 */
export function resolveSelectionToOps(
  range: Range,
  scriptContainer: HTMLElement
): LineEditTarget[] {
  const results: LineEditTarget[] = [];

  // Collect all line elements in document order
  const lineEls = Array.from(
    scriptContainer.querySelectorAll<HTMLElement>("[data-line-id][data-unit-id]")
  );

  // Filter to those the range actually intersects
  const intersected = lineEls.filter((el) => {
    // Skip lines that belong to already-cut speeches
    if (el.dataset.cut === "true") return false;
    return range.intersectsNode(el);
  });

  if (intersected.length === 0) return results;

  for (let i = 0; i < intersected.length; i++) {
    const el = intersected[i];
    const unitId = el.dataset.unitId!;
    const lineId = el.dataset.lineId!;
    const isFirst = i === 0;
    const isLast = i === intersected.length - 1;

    // For single-line selections or middle lines, we still need to compute
    // the exact char offsets using a TreeWalker over the element's text nodes.
    const start = isFirst ? getCharOffset(el, range.startContainer, range.startOffset) : 0;
    const end = isLast ? getCharOffset(el, range.endContainer, range.endOffset) : getFullLength(el);

    if (start >= end) continue; // degenerate range on this line — skip

    results.push({ unitId, lineId, start, end });
  }

  return results;
}

/**
 * Returns true if a text node is a descendant of a [data-inserted] element
 * within the given line element. Inserted words are not part of the original
 * line text and must be excluded from character offset calculations.
 */
function isInsertedNode(node: Text, lineEl: HTMLElement): boolean {
  let el: Element | null = node.parentElement;
  while (el && el !== lineEl) {
    if ((el as HTMLElement).dataset?.inserted === "true") return true;
    el = el.parentElement;
  }
  return false;
}

/**
 * Walk text nodes inside `lineEl` to compute the character offset of
 * `targetNode` at `offsetInNode` relative to the start of the line element.
 * Skips text nodes inside [data-inserted] elements.
 * Returns the full text length of the line if targetNode is not found
 * (which happens for middle lines where we use end = fullLength).
 */
function getCharOffset(
  lineEl: HTMLElement,
  targetNode: Node,
  offsetInNode: number
): number {
  const walker = document.createTreeWalker(lineEl, NodeFilter.SHOW_TEXT);
  let charCount = 0;
  let node: Text | null;
  while ((node = walker.nextNode() as Text | null)) {
    if (isInsertedNode(node, lineEl)) continue;
    if (node === targetNode) {
      return charCount + offsetInNode;
    }
    charCount += node.nodeValue?.length ?? 0;
  }
  // targetNode not found inside this element — return full length
  return charCount;
}

/**
 * Total character length of all non-inserted text nodes inside an element.
 * This is the canonical line length for "cut whole line" cases.
 */
function getFullLength(el: HTMLElement): number {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let len = 0;
  let node: Text | null;
  while ((node = walker.nextNode() as Text | null)) {
    if (isInsertedNode(node, el)) continue;
    len += node.nodeValue?.length ?? 0;
  }
  return len;
}
