/**
 * Greedy graph-coloring algorithm for minimum cast suggestion.
 *
 * Given a list of speaking character IDs and a simultaneous-on-stage map
 * (characters that cannot share an actor), returns the minimum number of
 * actor "slots" needed and which slot each character belongs to.
 *
 * Algorithm: Welsh-Powell (sort by degree descending, then greedy first-fit).
 * Not guaranteed optimal for all graphs, but works very well in practice for
 * the roughly sparse graphs produced by typical Shakespeare plays.
 */
export function suggestMinimumCast(
  speakingCharIds: string[],
  simultaneousMap: Map<string, Set<string>>
): Array<{ charId: string; actorIndex: number }> {
  if (speakingCharIds.length === 0) return [];

  // Sort by degree (most simultaneous partners first = most constrained)
  const sorted = [...speakingCharIds].sort(
    (a, b) => (simultaneousMap.get(b)?.size ?? 0) - (simultaneousMap.get(a)?.size ?? 0)
  );

  const assignment: Record<string, number> = {};

  for (const charId of sorted) {
    // Collect colors already used by neighbors
    const usedByNeighbors = new Set<number>();
    for (const neighborId of simultaneousMap.get(charId) ?? []) {
      if (assignment[neighborId] !== undefined) {
        usedByNeighbors.add(assignment[neighborId]);
      }
    }
    // Assign the smallest available color (actor slot index)
    let slot = 0;
    while (usedByNeighbors.has(slot)) slot++;
    assignment[charId] = slot;
  }

  return sorted.map((charId) => ({ charId, actorIndex: assignment[charId] }));
}
