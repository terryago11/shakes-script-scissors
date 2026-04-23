# Group 25 — Suggest Cast: Desired Actor Count

## Context

The "Suggest Minimum Cast" feature in `CastingManager.tsx` runs a Welsh-Powell greedy graph-colouring algorithm (`suggestMinimumCast` in `lib/cuts/CastingUtils.ts`) that finds the smallest legal doubling. Directors often have a specific company size in mind — either constrained by budget (fewer actors than the minimum) or by an ensemble contract (more actors than the minimum). This group adds a numeric input so the algorithm can target a specific actor count, handles forced illegal doublings gracefully (choosing the least-conflicting pairs and flagging them), and updates the help text to explain the new behaviour.

---

## Files to modify

| File | Change |
|------|--------|
| `lib/cuts/CastingUtils.ts` | Add `desiredActorCount?` to `SuggestOptions`; add post-coloring merge/split phase |
| `lib/cuts/StageTimeEngine.ts` | Add `computePairwiseSharedMinutes()` helper |
| `components/CastingManager/CastingManager.tsx` | UI input + wire desiredActorCount into runSuggest + update help text |

---

## Algorithm design

### New `SuggestOptions` field

```typescript
interface SuggestOptions {
  lineCounts?: Record<string, number>;
  forbiddenPairs?: Array<[string, string]>;
  sameActorPairs?: Array<[string, string]>;
  desiredActorCount?: number;            // NEW — if omitted, existing minimum behaviour
  sharedMinutes?: Map<string, Map<string, number>>; // NEW — pairwise shared stage time, for forced merges
}
```

### New helper: `computePairwiseSharedMinutes` (StageTimeEngine.ts)

The stage time engine already walks scenes tracking an `onStage` set. Add a new exported function (not modifying `computeStageTime`) that does the same walk and accumulates shared minutes for every pair simultaneously on stage:

```typescript
export function computePairwiseSharedMinutes(
  play: Play,
  cut: Cut,
  settings?: ProjectSettings,
): Map<string, Map<string, number>>
```

Implementation: for each kept speech unit, for every pair (a, b) currently in the `onStage` set, add `unitDurationMinutes` to `shared[a][b]`. Returns `Map<charIdA, Map<charIdB, minutes>>` (symmetric — only store a < b, look up either order).

Use the same minute-per-line formula as `buildForbiddenPairs`: `(keptLines * AVG_WORDS_PER_LINE) / wpm`.

### Post-coloring phase in `suggestMinimumCast`

After Step 7 (renumber slots), the current result has `N_actual` actors. Compare to `desiredActorCount`:

**Case A — target < N_actual (need to force merges):**

1. Build actor groups: `Map<slot, Set<rep>>` from the assignment.
2. While `currentActorCount > target`:
   a. For every pair of actor groups (i, j), compute merge cost = sum of `sharedMinutes[a][b]` for all cross-group pairs (a ∈ group_i, b ∈ group_j). If `sharedMinutes` is absent, fall back to 0 for non-simultaneous pairs and `Infinity` for simultaneous pairs (using `simultaneousMap`).
   b. Pick the pair (i, j) with the lowest merge cost.
   c. Merge group j into group i. Record all cross-group constraint violations as `forcedConflicts: Array<{charA, charB, sharedMinutes}>`.
3. Return assignments plus `forcedConflicts` in result (new field on return type, see below).

**Case B — target > N_actual (need to split actors):**

1. Collect actor groups sorted by character count DESC.
2. While `currentActorCount < target` and there exists a group with ≥ 2 characters:
   a. Take the largest group. Pick the character with the fewest lines from it.
   b. Move that character to a new solo actor slot.
3. No warnings needed — splitting is always legal. Flag in UI if target exceeds total character count.

### Updated return type

```typescript
export interface SuggestResult {
  assignments: Array<{ charId: string; actorIndex: number }>;
  forcedConflicts: Array<{ charA: string; charB: string; sharedMinutes: number }>;
  naturalMinimum: number;   // actor count the algorithm would pick without desiredActorCount
}
```

Change `suggestMinimumCast` return from array to `SuggestResult`. Update the one call site in `CastingManager.tsx` (`result.assignments` instead of `result`).

---

## UI changes (CastingManager.tsx)

### Where the input lives

Add the actor count input to the **choosing phase panel** (the Replace/Extend modal, lines 607–647). Before the Replace/Extend buttons, show:

```
Desired number of actors: [  9  ] (algorithm minimum: 9)
```

- `<input type="number" min={4} max={20}>` initialized to `naturalMinimum`.
- Store as `const [desiredCount, setDesiredCount] = useState<number | null>(null)`.
- When `null`, pass `undefined` to `suggestMinimumCast` (existing behaviour).

**When to compute natural minimum**: compute it **on mount and whenever `activeCut`/`play` change** via `useEffect([activeCut, play])`. Store in component state: `const [naturalMinimum, setNaturalMinimum] = useState<number | null>(null)`. This ensures the default is always current even if the director edits the script before clicking Suggest.

Updated `SuggestState`:

```typescript
type SuggestState =
  | { phase: "idle" }
  | { phase: "choosing"; naturalMinimum: number; desiredCount: number }
  | { phase: "preview"; groups: SuggestedGroup[]; mode: "replace" | "extend";
      forcedConflicts: Array<{charA: string; charB: string; sharedMinutes: number}>;
      naturalMinimum: number; desiredCount: number }
```

When actors don't exist yet and `handleSuggest` would previously skip straight to replace — don't skip. Show the choosing panel (it now doubles as the count picker) so the user can adjust the target before running.

### Preview panel additions

- `desiredCount < naturalMinimum`: amber banner "⚠ Forcing {N} conflicts — the algorithm merged these pairs because they share the least stage time:" + list of `forcedConflicts` (character names + shared minutes, or "never simultaneously on stage" if 0).
- `desiredCount > play.castList.length`: amber banner "⚠ Target ({desiredCount}) exceeds total parts in the play ({totalCharCount}) — some actors will have no assignment." Still allow apply.
- `desiredCount > naturalMinimum` and within total parts: no warning.

### Help text update

Add a new "Desired actor count" subsection before "Must-double links" in the `?` panel:

> **Desired actor count.** By default the algorithm finds the fewest actors the play's doubling constraints allow. Use the "Desired actors" box to override this. Setting it *lower* than the minimum forces the algorithm to merge actor groups — it will always pick the pair with the *least shared stage time*, and warn you which doublings it had to break. Setting it *higher* splits parts across more actors; no constraints are violated, but some actors may have very small roles. If you set it higher than the total number of parts (speaking or non-speaking) in the play, the app will warn you that some actors will be left unassigned.

Keep the existing "Must-double links", "About doubling", and "Practical constraints" paragraphs unchanged.

---

## Wiring (CastingManager.tsx runSuggest)

```typescript
// useEffect: keep naturalMinimum fresh whenever cut or play changes
useEffect(() => {
  if (!play || !activeCut) return;
  const dryRun = suggestMinimumCast(activeCharIds, simultaneousMap, {
    lineCounts: lineCountsForSuggest,
    forbiddenPairs,
    sameActorPairs: allSameActorPairs,
  });
  setNaturalMinimum(dryRun.naturalMinimum);
}, [activeCut, play]);

// handleSuggest: always go through choosing panel (which now has the count input)
function handleSuggest() {
  const min = naturalMinimum ?? 1;
  setSuggestState({ phase: "choosing", naturalMinimum: min, desiredCount: min });
}

// runSuggest: pass desiredActorCount + sharedMinutes when below minimum
const sharedMinutes = desiredCount < naturalMinimum
  ? computePairwiseSharedMinutes(play!, activeCut, project!.settings)
  : undefined;

const result = suggestMinimumCast(activeCharIds, simultaneousMap, {
  lineCounts: lineCountsForSuggest,
  forbiddenPairs,
  sameActorPairs: allSameActorPairs,
  desiredActorCount: desiredCount,
  sharedMinutes,
});
// result is now SuggestResult — use result.assignments, result.forcedConflicts
```

---

## Verification

1. Load a play with 15+ speaking characters (Hamlet, A Midsummer Night's Dream).
2. Click "Suggest" with no actors. Observe the natural minimum pre-filled in the input.
3. **Too low**: reduce to 4. Apply. Confirm amber warning lists forced conflicts; all characters assigned.
4. **Too high**: increase to 18. Apply. Confirm more actors, no conflicts, some actors have one small role.
5. **Natural**: leave at default. Apply. Confirm behaviour identical to before (no regressions).
6. **Must-double links**: add a link, run suggest. Confirm linked pair always on the same actor regardless of count.
7. TypeScript check: `npx tsc --noEmit` must pass.
