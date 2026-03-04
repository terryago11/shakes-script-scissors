import { characterIdToName } from "@/lib/folger/TeiParser";

/** Generate a short random ID */
export function generateId(): string {
  return Math.random().toString(36).slice(2, 10) +
    Math.random().toString(36).slice(2, 10);
}

/**
 * Resolve a character's display name for the given cut.
 * Priority: characterAliases (cut-level) → castList canonical name → TEI ID normalization.
 */
export function resolveCharacterName(
  charId: string,
  aliases: Record<string, string> | undefined,
  castList: { id: string; name: string }[]
): string {
  if (aliases?.[charId]) return aliases[charId];
  return castList.find((c) => c.id === charId)?.name ?? characterIdToName(charId);
}

/** Default actor colors — cycles when more than this many actors.
 *  Reds/corals excluded: the UI uses red for cut text.
 *  Greens excluded: the UI uses green for SD additions (cut time > original). */
export const defaultColors = [
  "#3b82f6", // blue
  "#f59e0b", // amber
  "#8b5cf6", // violet
  "#0d9488", // teal
  "#db2777", // fuchsia-pink (distinct from cut-red)
  "#64748b", // slate
  "#ea580c", // orange
  "#06b6d4", // cyan
];
