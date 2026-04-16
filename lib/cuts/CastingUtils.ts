import type { Play } from "@/types/play";
import type { Cut, ProjectSettings } from "@/types/project";
import { getEffectiveSceneOrder } from "@/lib/project/projectUtils";

const AVG_WORDS_PER_LINE = 8;
const DEFAULT_WPM = 135;

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
): Array<{ charId: string; actorIndex: number }> {
  if (speakingCharIds.length === 0) return [];

  const {
    lineCounts = {},
    forbiddenPairs = [],
    sameActorPairs = [],
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

  // ── Step 8: Map reps back to all their charIds ─────────────────────────
  const result: Array<{ charId: string; actorIndex: number }> = [];
  for (const [rep, chars] of repToChars) {
    const actorIndex = slotRemap[assignment[rep]];
    for (const charId of chars) {
      result.push({ charId, actorIndex });
    }
  }

  return result;
}
