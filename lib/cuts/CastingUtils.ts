import type { Play } from "@/types/play";
import type { Cut, ProjectSettings } from "@/types/project";
import { getEffectiveSceneOrder } from "@/lib/project/projectUtils";

const AVG_WORDS_PER_LINE = 8;
const DEFAULT_WPM = 135;

export interface SuggestResult {
  assignments: Array<{ charId: string; actorIndex: number }>;
  /** Pairs forced onto the same actor because desiredActorCount < naturalMinimum. */
  forcedConflicts: Array<{ charA: string; charB: string; sharedMinutes: number }>;
  /** The minimum number of actors the algorithm would need without a desiredActorCount. */
  naturalMinimum: number;
}

/**
 * Options for the minimum-cast suggestion algorithm.
 */
export interface SuggestOptions {
  /**
   * afterCut line counts per character (charId → lines).
   * Used to sort large parts first so they naturally claim solo slots.
   */
  lineCounts?: Record<string, number>;
  /**
   * Pairs of character IDs that CANNOT share an actor.
   * Typically derived from quick-change gaps: if the gap between one
   * character's last exit and another's next entrance is below the
   * quick-change threshold, they cannot be doubled.
   */
  forbiddenPairs?: Array<[string, string]>;
  /**
   * Pairs of character IDs that MUST share the same actor.
   * Used for characters that are the same person in different TEI roles
   * (e.g., a character in the frame story and their role in a
   * play-within-the-play), or for duplicate character IDs that
   * normalise to the same display name.
   */
  sameActorPairs?: Array<[string, string]>;
  /**
   * When set, adjust the result to use exactly this many actors.
   * If below naturalMinimum, groups are merged (recording forcedConflicts).
   * If above naturalMinimum, groups are split (large→solo) until count = target.
   */
  desiredActorCount?: number;
  /** Pairwise shared stage-time map, used by the merge phase to pick lowest-conflict merges. */
  sharedMinutes?: Map<string, Map<string, number>>;
}

/**
 * Walk the cut play scene-by-scene (respecting scene order and pauses)
 * and return all (charA, charB) pairs whose minimum gap – the time between
 * one character's last exit and the other's next entrance – is below the
 * quick-change threshold in the current cut. These pairs cannot be doubled.
 *
 * This mirrors QuickChangeEngine but operates at the character level
 * (no actor assignment required), so it can be used BEFORE casting.
 */
export function buildForbiddenPairs(
  play: Play,
  cut: Cut,
  settings?: ProjectSettings,
): Array<[string, string]> {
  const threshold = settings?.quickChangeThresholdMinutes ?? 2.0;
  const wpm = settings?.wordsPerMinute ?? DEFAULT_WPM;

  // Build scene lookup
  const sceneById = new Map<string, (typeof play.acts)[0]["scenes"][0]>();
  for (const act of play.acts) {
    for (const scene of act.scenes) sceneById.set(scene.id, scene);
  }

  const sceneOrder = getEffectiveSceneOrder(play, cut);

  let cumulativeMinutes = 0;
  // charId → cumulative minutes at its most recent exit
  const lastExitMinutes = new Map<string, number>();
  // sorted key → true (to avoid duplicates)
  const forbiddenSet = new Set<string>();

  function effectiveChars(sd: { characters: string[]; id: string }): string[] {
    return cut.stageDirectionEdits?.[sd.id] ?? sd.characters;
  }

  for (const sceneId of sceneOrder) {
    const scene = sceneById.get(sceneId);
    if (!scene) continue;

    let sceneMinutes = 0;
    const onStage = new Set<string>();

    for (const unit of scene.units) {
      if (unit.type === "stage") {
        if (unit.stageType === "entrance") {
          const chars = effectiveChars(unit);
          const enterTime = cumulativeMinutes + sceneMinutes;
          for (const entering of chars) {
            // Check gap against ALL characters that have previously exited
            for (const [exitedChar, exitTime] of lastExitMinutes) {
              if (exitedChar === entering) continue;
              const gap = enterTime - exitTime;
              if (gap >= 0 && gap < threshold) {
                // Sort IDs so the pair is direction-independent
                const key =
                  exitedChar < entering
                    ? `${exitedChar}::${entering}`
                    : `${entering}::${exitedChar}`;
                forbiddenSet.add(key);
              }
            }
            onStage.add(entering);
          }
        } else if (unit.stageType === "exit") {
          const chars = effectiveChars(unit);
          const exitTime = cumulativeMinutes + sceneMinutes;
          for (const exiting of chars) {
            lastExitMinutes.set(exiting, exitTime);
            onStage.delete(exiting);
          }
        }
      } else if (unit.type === "speech") {
        const isKept = (cut.cutMap[unit.id] ?? "kept") === "kept";
        if (isKept) {
          let keptLines = unit.lineCount;
          if (cut.lineCutMap) {
            const cutCount = unit.lines.filter(
              (l) => cut.lineCutMap![l.id] === "cut",
            ).length;
            keptLines = Math.max(0, unit.lineCount - cutCount);
          }
          sceneMinutes += (keptLines * AVG_WORDS_PER_LINE) / wpm;
        }
      }
    }

    // Virtual exit for characters still on stage at scene end
    const sceneEndTime = cumulativeMinutes + sceneMinutes;
    for (const charId of onStage) {
      lastExitMinutes.set(charId, sceneEndTime);
    }

    cumulativeMinutes += sceneMinutes;
    const pauseKey = `after:${sceneId}`;
    if (cut.pauses?.[pauseKey]) {
      cumulativeMinutes += cut.pauses[pauseKey].minutes;
    }
  }

  return Array.from(forbiddenSet).map((key) => {
    const [a, b] = key.split("::");
    return [a, b] as [string, string];
  });
}

/**
 * Greedy minimum-cast suggestion.
 *
 * Improvements over plain Welsh-Powell:
 *  1. **sameActorPairs** (union-find): characters that are the same person in
 *     different TEI roles (play-within-play, duplicate IDs with identical
 *     display names) are merged into one virtual node before colouring, so
 *     they always land on the same actor.
 *  2. **forbiddenPairs** (quick-change constraints): pairs that cannot be
 *     doubled because the gap between their scenes is too short are treated as
 *     additional graph edges (same as simultaneous-presence conflicts).
 *  3. **Sort by line count DESC** instead of degree: large parts (Hamlet,
 *     Claudius, …) are processed first and naturally claim their own slots,
 *     while smaller parts fill in afterwards.
 *  4. **Prefer smallest existing total** when picking a slot: among all valid
 *     existing slots, the one whose current accumulated line count is smallest
 *     is preferred, so small parts cluster together rather than being attached
 *     to large-part actors.
 */
export function suggestMinimumCast(
  speakingCharIds: string[],
  simultaneousMap: Map<string, Set<string>>,
  options?: SuggestOptions,
): SuggestResult {
  if (speakingCharIds.length === 0) {
    return { assignments: [], forcedConflicts: [], naturalMinimum: 0 };
  }

  const {
    lineCounts = {},
    forbiddenPairs = [],
    sameActorPairs = [],
    desiredActorCount,
    sharedMinutes,
  } = options ?? {};

  // ── Step 1: Union-Find for sameActorPairs ──────────────────────────────
  const parent: Record<string, string> = {};

  function find(x: string): string {
    if (!parent[x]) return x;
    parent[x] = find(parent[x]); // path compression
    return parent[x];
  }

  function union(x: string, y: string) {
    const px = find(x);
    const py = find(y);
    if (px !== py) parent[px] = py;
  }

  for (const [a, b] of sameActorPairs) {
    if (speakingCharIds.includes(a) && speakingCharIds.includes(b)) {
      union(a, b);
    }
  }

  // ── Step 2: Group chars by representative ─────────────────────────────
  const repToChars = new Map<string, string[]>(); // rep → [charId, ...]
  for (const charId of speakingCharIds) {
    const rep = find(charId);
    if (!repToChars.has(rep)) repToChars.set(rep, []);
    repToChars.get(rep)!.push(charId);
  }

  const virtualChars = Array.from(repToChars.keys());

  // ── Step 3: Build extended constraint map (simultaneous + forbidden) ───
  const constraintMap = new Map<string, Set<string>>();

  function addConstraint(charA: string, charB: string) {
    const ra = find(charA);
    const rb = find(charB);
    if (ra === rb) return; // same merged group — no conflict
    if (!constraintMap.has(ra)) constraintMap.set(ra, new Set());
    if (!constraintMap.has(rb)) constraintMap.set(rb, new Set());
    constraintMap.get(ra)!.add(rb);
    constraintMap.get(rb)!.add(ra);
  }

  for (const [charId, simSet] of simultaneousMap) {
    for (const otherId of simSet) addConstraint(charId, otherId);
  }
  for (const [a, b] of forbiddenPairs) {
    addConstraint(a, b);
  }

  // ── Step 4: Aggregate line counts per virtual-char group ───────────────
  const groupLines: Record<string, number> = {};
  for (const [rep, chars] of repToChars) {
    groupLines[rep] = chars.reduce((s, id) => s + (lineCounts[id] ?? 0), 0);
  }

  // ── Step 5: Sort virtual chars by line count DESC (large parts first) ──
  const sorted = [...virtualChars].sort(
    (a, b) => (groupLines[b] ?? 0) - (groupLines[a] ?? 0),
  );

  // ── Step 6: Greedy assignment with "prefer smallest existing total" ─────
  // slotTotals: slot index → cumulative line count assigned to it
  const slotTotals: Record<number, number> = {};
  const assignment: Record<string, number> = {}; // rep → slot
  let nextSlot = 0;

  for (const rep of sorted) {
    const usedByNeighbors = new Set<number>();
    for (const neighborRep of constraintMap.get(rep) ?? []) {
      if (assignment[neighborRep] !== undefined) {
        usedByNeighbors.add(assignment[neighborRep]);
      }
    }

    // Find all valid *existing* slots (not blocked by a neighbour)
    const validExisting = Object.keys(slotTotals)
      .map(Number)
      .filter((s) => !usedByNeighbors.has(s))
      .sort((a, b) => (slotTotals[a] ?? 0) - (slotTotals[b] ?? 0)); // ascending totals

    const chosenSlot =
      validExisting.length > 0
        ? validExisting[0] // prefer smallest existing total (clusters small parts)
        : nextSlot++; // no valid slot → open a new one

    assignment[rep] = chosenSlot;
    slotTotals[chosenSlot] = (slotTotals[chosenSlot] ?? 0) + (groupLines[rep] ?? 0);
  }

  // ── Step 7: Renumber slots so actor 0 has the most lines ──────────────
  const sortedSlots = Object.keys(slotTotals)
    .map(Number)
    .sort((a, b) => (slotTotals[b] ?? 0) - (slotTotals[a] ?? 0));
  const slotRemap: Record<number, number> = {};
  sortedSlots.forEach((slot, idx) => {
    slotRemap[slot] = idx;
  });

  // ── Step 8: Build mutable groups for merge/split ─────────────────────
  const naturalMinimum = sortedSlots.length;
  // groups: slotIndex → set of repIds
  const groups = new Map<number, Set<string>>();
  for (const [rep, slotAfterRemap] of Object.entries(assignment)) {
    const mapped = slotRemap[slotAfterRemap];
    if (!groups.has(mapped)) groups.set(mapped, new Set());
    groups.get(mapped)!.add(rep);
  }

  const forcedConflicts: Array<{ charA: string; charB: string; sharedMinutes: number }> = [];

  if (desiredActorCount !== undefined && desiredActorCount < naturalMinimum) {
    // ── Merge phase: repeatedly merge the pair of groups with least shared time ──
    function sumShared(gA: Set<string>, gB: Set<string>): number {
      let total = 0;
      for (const ra of gA) {
        for (const rb of gB) {
          // Sum pairwise shared minutes across all chars in each rep group
          for (const ca of (repToChars.get(ra) ?? [])) {
            for (const cb of (repToChars.get(rb) ?? [])) {
              const [lo, hi] = ca < cb ? [ca, cb] : [cb, ca];
              total += sharedMinutes?.get(lo)?.get(hi) ?? 0;
            }
          }
        }
      }
      return total;
    }
    function worstPair(gA: Set<string>, gB: Set<string>): { charA: string; charB: string; sharedMinutes: number } | null {
      let best: { charA: string; charB: string; sharedMinutes: number } | null = null;
      for (const ra of gA) {
        for (const rb of gB) {
          for (const ca of (repToChars.get(ra) ?? [])) {
            for (const cb of (repToChars.get(rb) ?? [])) {
              const [lo, hi] = ca < cb ? [ca, cb] : [cb, ca];
              const mins = sharedMinutes?.get(lo)?.get(hi) ?? 0;
              if (!best || mins > best.sharedMinutes) {
                best = { charA: ca, charB: cb, sharedMinutes: mins };
              }
            }
          }
        }
      }
      return best;
    }

    while (groups.size > desiredActorCount) {
      const keys = Array.from(groups.keys());
      let bestI = -1, bestJ = -1, bestShared = Infinity;
      for (let i = 0; i < keys.length; i++) {
        for (let j = i + 1; j < keys.length; j++) {
          const s = sumShared(groups.get(keys[i])!, groups.get(keys[j])!);
          if (s < bestShared) { bestShared = s; bestI = keys[i]; bestJ = keys[j]; }
        }
      }
      if (bestI === -1) break;
      // Record worst conflict pair from this merge
      const wp = worstPair(groups.get(bestI)!, groups.get(bestJ)!);
      if (wp) forcedConflicts.push(wp);
      // Merge bestJ into bestI
      for (const rep of groups.get(bestJ)!) {
        groups.get(bestI)!.add(rep);
        assignment[rep] = bestI;
      }
      groups.delete(bestJ);
    }
  } else if (desiredActorCount !== undefined && desiredActorCount > naturalMinimum) {
    // ── Split phase: move lowest-line char from largest group to solo ──────
    let nextIdx = Math.max(...Array.from(groups.keys())) + 1;
    while (groups.size < desiredActorCount) {
      // Find the largest group (by total lines)
      let largestKey = -1, largestLines = -1;
      for (const [k, reps] of groups) {
        const lines = Array.from(reps).reduce((s, r) =>
          s + (repToChars.get(r) ?? []).reduce((ss, c) => ss + (lineCounts[c] ?? 0), 0), 0);
        if (lines > largestLines) { largestLines = lines; largestKey = k; }
      }
      if (largestKey === -1 || groups.get(largestKey)!.size <= 1) break;
      // Move the lowest-line rep to a new solo group
      const reps = Array.from(groups.get(largestKey)!);
      let minRep = reps[0], minLines = Infinity;
      for (const r of reps) {
        const l = (repToChars.get(r) ?? []).reduce((s, c) => s + (lineCounts[c] ?? 0), 0);
        if (l < minLines) { minLines = l; minRep = r; }
      }
      groups.get(largestKey)!.delete(minRep);
      groups.set(nextIdx, new Set([minRep]));
      assignment[minRep] = nextIdx;
      nextIdx++;
    }
  }

  // ── Renumber groups so 0 has the most lines ───────────────────────────
  const groupLinesBySlot = new Map<number, number>();
  for (const [k, reps] of groups) {
    groupLinesBySlot.set(k, Array.from(reps).reduce<number>((s, r) =>
      s + (repToChars.get(r) ?? []).reduce<number>((ss, c) => ss + (lineCounts[c] ?? 0), 0), 0));
  }
  const finalSlots = Array.from(groups.keys()).sort((a, b) => (groupLinesBySlot.get(b) ?? 0) - (groupLinesBySlot.get(a) ?? 0));
  const finalRemap: Record<number, number> = {};
  finalSlots.forEach((slot, idx) => { finalRemap[slot] = idx; });

  // ── Final mapping: rep → charIds ───────────────────────────────────────
  const result: Array<{ charId: string; actorIndex: number }> = [];
  for (const [rep, chars] of repToChars) {
    const actorIndex = finalRemap[assignment[rep]];
    for (const charId of chars) {
      result.push({ charId, actorIndex });
    }
  }

  return { assignments: result, forcedConflicts, naturalMinimum };
}
