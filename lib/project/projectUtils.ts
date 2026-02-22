/** Generate a short random ID */
export function generateId(): string {
  return Math.random().toString(36).slice(2, 10) +
    Math.random().toString(36).slice(2, 10);
}

/** Default actor colors — cycles when more than this many actors */
export const defaultColors = [
  "#e74c3c", // red
  "#3498db", // blue
  "#27ae60", // green
  "#f39c12", // orange
  "#9b59b6", // purple
  "#1abc9c", // teal
  "#e91e63", // pink
  "#607d8b", // blue-grey
];
