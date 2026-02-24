/** Generate a short random ID */
export function generateId(): string {
  return Math.random().toString(36).slice(2, 10) +
    Math.random().toString(36).slice(2, 10);
}

/** Default actor colors — cycles when more than this many actors.
 *  Reds/corals are intentionally excluded: the UI uses red for cut text. */
export const defaultColors = [
  "#3b82f6", // blue
  "#16a34a", // green
  "#f59e0b", // amber
  "#8b5cf6", // violet
  "#0d9488", // teal
  "#db2777", // fuchsia-pink (distinct from cut-red)
  "#64748b", // slate
  "#ea580c", // orange
];
