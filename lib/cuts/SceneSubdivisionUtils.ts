import type { Play, Scene, ScriptUnit } from "@/types/play";
import type { Cut, SubdivisionSplit } from "@/types/project";
import { expandSplits, expandInsertions, expandStageNotes } from "./expandUtils";

/** All 26 part labels — first three (A/B/C) are the UI-enforced max; rest are safety backstop */
export const PART_LABELS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/**
 * A resolved scene entry — either a full scene (not subdivided) or one A/B/C part of a scene.
 * Used by CutEngine, StageTimeEngine, SceneList, DashboardMatrix, and RehearsalGroupings.
 */
export interface EffectiveSceneEntry {
  /**
   * The key used in byScene maps and matrix cells.
   * Format: "${realSceneId}:p${partIndex}" for subdivided parts, or just realSceneId if not subdivided.
   */
  id: string;
  /** The underlying real Scene.id from TEI */
  realSceneId: string;
  /** The real Scene object (never mutated) */
  scene: Scene;
  /**
   * The expanded ScriptUnit slice for this part — speechSplits, insertions, and stageNotes have
   * already been applied. This is the authoritative unit list for engine processing.
   */
  units: ScriptUnit[];
  /** 0-based index of this part within its scene (0=A, 1=B, 2=C) */
  partIndex: number;
  /** Total number of parts for this scene (1 if not subdivided) */
  partCount: number;
  /** "A", "B", "C", … or "" if partCount === 1 */
  label: string;
  /**
   * Display title:
   * - Not subdivided: scene.title (e.g. "A room in the castle")
   * - Subdivided: "${scene.title} A", "${scene.title} B", etc.
   */
  title: string;
}

/** Build a virtual sub-scene ID for part `partIndex` of `realSceneId` */
export function getSubSceneId(realSceneId: string, partIndex: number): string {
  return `${realSceneId}:p${partIndex}`;
}

/**
 * Parse a virtual sub-scene ID back into its components.
 * Returns null if the string is a plain real scene ID (no `:p<n>` suffix).
 */
export function parseSubSceneId(id: string): { realSceneId: string; partIndex: number } | null {
  const m = id.match(/^(.+):p(\d+)$/);
  if (!m) return null;
  return { realSceneId: m[1], partIndex: parseInt(m[2], 10) };
}

/**
 * Partition an expanded unit array into slices based on split boundaries.
 *
 * @param expandedUnits The full expanded unit list for the scene
 * @param splits Ordered array of split points (afterUnitId = last unit ID of each non-final part)
 * @returns Array of unit slices — length = splits.length + 1
 */
function partitionUnits(expandedUnits: ScriptUnit[], splits: SubdivisionSplit[]): ScriptUnit[][] {
  if (splits.length === 0) return [expandedUnits];

  const parts: ScriptUnit[][] = [];
  let startIdx = 0;

  for (let s = 0; s < splits.length; s++) {
    const boundaryId = splits[s].afterUnitId;
    // Find the index of the boundary unit
    const boundaryIdx = expandedUnits.findIndex((u) => u.id === boundaryId);

    if (boundaryIdx === -1) {
      // Boundary unit was deleted (e.g. unit merged or removed) — treat as end of slice
      parts.push(expandedUnits.slice(startIdx));
      startIdx = expandedUnits.length; // next parts will be empty
    } else {
      parts.push(expandedUnits.slice(startIdx, boundaryIdx + 1));
      startIdx = boundaryIdx + 1;
    }
  }
  // Last part gets the remainder
  parts.push(expandedUnits.slice(startIdx));

  return parts;
}

/**
 * Build EffectiveSceneEntry[] for a single scene.
 * Returns one entry if the scene is not subdivided, or N+1 entries for N splits.
 */
export function buildSceneEntries(scene: Scene, cut: Cut, play: Play): EffectiveSceneEntry[] {
  const splits = cut.sceneSubdivisions?.[scene.id] ?? [];

  // Fully expand all units for the scene
  const expandedUnits = expandStageNotes(expandInsertions(
    expandSplits(scene.units, cut.speechSplits),
    cut.insertions,
    play.castList
  ));

  const partCount = splits.length + 1;

  if (partCount === 1) {
    // Not subdivided — return a single entry using the real scene ID
    return [{
      id: scene.id,
      realSceneId: scene.id,
      scene,
      units: expandedUnits,
      partIndex: 0,
      partCount: 1,
      label: "",
      title: scene.title,
    }];
  }

  const slices = partitionUnits(expandedUnits, splits);

  return slices.map((slice, i) => {
    const label = PART_LABELS[i] ?? String(i + 1);
    return {
      id: getSubSceneId(scene.id, i),
      realSceneId: scene.id,
      scene,
      units: slice,
      partIndex: i,
      partCount,
      label,
      title: `${scene.title} ${label}`,
    };
  });
}

/**
 * Count scene-relative line numbers (1-based) to find which speech unit contains line N.
 * Speeches accumulate lineCount; stage directions are skipped (they don't contribute to line count).
 *
 * @param expandedUnits The expanded unit list for the full scene (or sub-scene slice)
 * @param lineNumber 1-based scene-relative line number
 * @returns The unit ID of the speech that contains lineNumber, or null if out of range
 */
export function findUnitAtLine(
  expandedUnits: ScriptUnit[],
  lineNumber: number,
): { unitId: string; linesBefore: number; totalLines: number } | null {
  let accumulated = 0;
  let totalLines = 0;
  for (const unit of expandedUnits) {
    if (unit.type !== "speech") continue;
    totalLines += unit.lineCount;
  }
  if (lineNumber < 1 || lineNumber > totalLines) return null;

  for (const unit of expandedUnits) {
    if (unit.type !== "speech") continue;
    const linesBefore = accumulated;
    accumulated += unit.lineCount;
    if (accumulated >= lineNumber) {
      return { unitId: unit.id, linesBefore, totalLines };
    }
  }
  return null;
}

/**
 * Return the afterUnitId for each split in a scene — these are the IDs of the last unit
 * in each non-final part. Used by SceneBlock and DiffView to insert divider markers.
 *
 * Returns an empty array if the scene has no subdivisions.
 */
export function getSplitUnitIds(scene: Scene, cut: Cut): string[] {
  return (cut.sceneSubdivisions?.[scene.id] ?? []).map((s) => s.afterUnitId);
}

/**
 * Get the total number of lines in a scene's expanded units (speeches only).
 * Used by the split dialog to validate the line number input.
 */
export function getSceneLineCount(scene: Scene, cut: Cut, play: Play): number {
  const expandedUnits = expandStageNotes(expandInsertions(
    expandSplits(scene.units, cut.speechSplits),
    cut.insertions,
    play.castList
  ));
  return expandedUnits.reduce((sum, u) => sum + (u.type === "speech" ? u.lineCount : 0), 0);
}
