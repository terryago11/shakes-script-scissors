import { characterIdToName } from "@/lib/folger/TeiParser";
import type { Play } from "@/types/play";
import type { Cut } from "@/types/project";

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

/**
 * Returns the effective scene order for a cut, guaranteed to include every scene in the play.
 * If the cut has a custom sceneOrder, scenes missing from it are appended in their original
 * TEI order. This prevents engines from silently skipping scenes when a cut's sceneOrder is
 * stale (e.g. after manual project-file edits or future play-text updates).
 */
export function getEffectiveSceneOrder(play: Play, cut: Cut): string[] {
  const defaultOrder = play.acts.flatMap((a) => a.scenes.map((s) => s.id));
  if (!cut.sceneOrder) return defaultOrder;
  const inOrder = new Set(cut.sceneOrder);
  const missing = defaultOrder.filter((id) => !inOrder.has(id));
  return missing.length === 0 ? cut.sceneOrder : [...cut.sceneOrder, ...missing];
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
