# Group 30 — Mixed improvements

## Context
Nine improvements: integrity engine correctness (reassigned speeches, insertedSDs), near-fully-cut character surfacing, "mark for removal" flag, multi-line SD edit, custom actor count unlock, doubling-conflict warnings (surface on cards + new panel), multi-select filters, scene subdivision suggestions, Electron HTML strip, and a stretch on-stage sidebar.

## Session breakdown
- **Session 1 (30-quick):** 30A + 30B-1 + 30B-2 — quick fixes + engine correctness ✅
- **Session 2 (30-integrity):** 30B-3 + 30B-4 — near-fully-cut chars + mark for removal ✅
- **Session 3 (30-casting):** 30C + 30D — doubling conflict warnings + multi-select filters ✅
- **Session 4 (30-features):** 30E + 30F — scene subdivisions + on-stage sidebar ✅

---

## 30A — Quick fixes

### 30A-1: Edit SD multi-line textarea ✅
**File:** `components/ScriptEditor/StageDirectionBlock.tsx:208`

Change `rows={Math.max(1, draftText.split("\n").length)}` → `rows={Math.max(3, draftText.split("\n").length)}` and add `overflow-y-auto max-h-40` to textarea className. This ensures at least 3 visible rows on long single-line SDs. (Enter without Shift commits; Shift+Enter inserts a real newline — existing onKeyDown already has `!e.shiftKey` guard.)

**Verify:** Load any play, open SD edit, confirm the box shows ≥3 rows; confirm Shift+Enter adds a newline; confirm Enter commits.

### 30A-2: Custom actor count outside auditions ✅
**File:** `components/CastingManager/CastingManager.tsx`

`setDraftDesiredCount` is gated at line 211 by `if (!draft) return;` — no-ops when not in audition mode. Fix:

1. Add `const [localDesiredCount, setLocalDesiredCount] = useState<number | null>(null);` near line 191.
2. Change line 691 to: `const desiredCount = isAudition ? (draft?.desiredActorCount ?? null) : localDesiredCount;`
3. Replace the `onChange` on the actor-count input (line 1128) to call `isAudition ? setDraftDesiredCount(v) : setLocalDesiredCount(v)` directly (no need for a named wrapper).

**Verify:** Open Casting tab without entering audition mode. Click Suggest. Confirm the "Desired # of actors" input is editable. Enter a number above the minimum; run Suggest; confirm the result uses that count.

### 30A-3: Electron update — strip HTML ✅
**File:** `electron/main.ts`

Add a `stripHtml` helper before `releaseNotesDetail`:
```typescript
function stripHtml(html: string): string {
  return html
    .replace(/<li[^>]*>/gi, "\n• ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n)))
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
```
Inside `releaseNotesDetail` (line 14), wrap `notes` in `stripHtml(notes)`. For the array branch (line 17), wrap `latest.note ?? ""` in `stripHtml(...)`.

**Verify:** Inspect `releaseNotesDetail` output by temporarily logging it with an HTML release note string like `"<p><strong>New:</strong></p><ul><li>Feature A</li><li>Feature B</li></ul>"`. Expected output: `"• Feature A\n• Feature B"`.

---

## 30B — Integrity engine fixes

### 30B-1: Speech reassignments — correct speaker attribution ✅
**File:** `lib/cuts/StageTimeEngine.ts:354-358`

In the `speakingKeptChars` loop:
```typescript
// Before:
speakingKeptChars.add(unit.characterId);
// After:
const effectiveSpeaker = cut.speechReassignments?.[unit.id] ?? unit.characterId;
if (effectiveSpeaker) speakingKeptChars.add(effectiveSpeaker);
```
This prevents false "no-entrance" warnings for original speakers whose speeches were reassigned, and properly flags the new speaker if they lack entrances/exits.

**Verify:** In the script editor, reassign a speech from CharA to CharB. Go to Integrity → Entrance/Exit. Confirm CharA no longer appears as a warning for that speech's contribution. Confirm CharB gets a warning if they genuinely lack an entrance/exit.

### 30B-2: InsertedSDs counted for entrance/exit warnings ✅
**File:** `lib/cuts/StageTimeEngine.ts` — after the main scene-walking loop (~line 361)

Read `types/insertedsd.ts` first to confirm field names (`stageType`, `characters`, `id`). Then, after the existing loop, walk `cut.insertedSDs`:
```typescript
if (cut.insertedSDs) {
  for (const sd of Object.values(cut.insertedSDs)) {
    if ((cut.cutMap[sd.id] ?? "kept") === "cut") continue;
    if (sd.stageType === "exit") {
      for (const c of sd.characters ?? []) exitedAnywhereChars.add(c);
    } else if (sd.stageType === "entrance") {
      for (const c of sd.characters ?? []) enteredAnywhereChars.add(c);
    }
  }
}
```

**Verify:** Add a custom entrance SD for a character that originally has no entrance SD in the TEI. Confirm the "no-entrance" warning clears on the Integrity tab.

### 30B-3: Near-fully-cut characters surfaced in integrity
**File:** `lib/cuts/StageTimeEngine.ts`

Extend `StageTimeResult["warnings"]` item type to also allow `type: "entrance-only"` and `type: "few-lines"` with optional `lineCount?: number`.

After the existing warning-generation loop, add:
1. **Presence-only**: characters in `(enteredAnywhereChars ∪ exitedAnywhereChars) \ speakingKeptChars` → push `{ characterId, type: "entrance-only" }`.
2. **Few lines**: while walking speeches already (for `speakingKeptChars`), also accumulate `keptLinesByChar: Map<string, number>` counting `unit.lines.filter(l => (cut.lineCutMap?.[l.id] ?? "kept") === "kept").length`. After the loop, for each char in `speakingKeptChars` with `keptLinesByChar.get(charId) < 10`, push `{ characterId, type: "few-lines", lineCount }`.

**File:** `components/Dashboard/IntegrityChecks.tsx`

In `EntranceExitSection`, add two columns alongside the existing "Missing Exit" / "Missing Entrance" grid:
- "Presence-only" — warning type `"entrance-only"`: "These characters appear in kept stage directions but have no kept speeches. They appear on stage but never speak."
- "Nearly cut" — warning type `"few-lines"`: "These characters have fewer than 10 kept lines. Consider cutting completely." Show the line count alongside each name.

**Verify:** Load Hamlet, cut all of a minor character's speeches but keep their entrance SD. Confirm they appear under "Presence-only". Then cut 90% of another character's lines but leave <10 — confirm they appear under "Nearly cut."

### 30B-4: "Mark for removal" flag
**Files:** `types/project.ts`, `lib/project/projectIO.ts` (CutSchema)

Add `markedForRemoval?: string[]` to the `Cut` interface. Add it to `CutSchema` in `projectIO.ts` (`.optional().default([])` pattern matching other optional array fields). Add `TOGGLE_CHAR_MARKED_FOR_REMOVAL` action to the ProjectStore reducer in `lib/project/ProjectStore.tsx`.

**Behavioral rule**: merge `markedForRemoval` IDs into the exclusion set alongside `fullyCutCharIds` everywhere:
- `CastingManager.tsx` line 496: extend `fullyCutCharIds` to also include `new Set(activeCut?.markedForRemoval ?? [])`. This single change propagates the flag through all existing guards (`suggestMinimumCast`, matrix building, actor stats, filter counts, `isFullyCut` prop).
- CharacterCard: `isFullyCut` already greys out the card and disables casting. No additional changes needed to CharacterCard props — the merged set handles it.

**Integrity tab** (`IntegrityChecks.tsx`): Merge "Marked for Removal" into the existing "Fully Removed Characters" section, now renamed "Removed / Flagged Characters". Each character row gets a status pill:
- `⚑ Marked` — in `markedForRemoval` but still has kept lines/SDs
- `⚑ Marked · ✓ Fully cut` — in `markedForRemoval` and fully cut
- `✓ Auto-detected` — fully cut (all speeches+SDs cut) but not explicitly marked
Each `⚑ Marked` row shows the two checklist items inline: `X speeches remaining` / `Y SDs remaining`. A small `× Unmark` button triggers `TOGGLE_CHAR_MARKED_FOR_REMOVAL`.

**Where to set the flag**: Add a "⚑ Mark for removal" option to the existing character overflow / three-dot menu on `CharacterCard`. The CastingManager already passes callbacks for alias, links, etc. — add `onToggleMarkedForRemoval?: () => void` prop.

**Verify:** Mark a character for removal. Confirm they appear greyed-out in the cast list. Confirm Suggest ignores them. Confirm they appear in Integrity → "Removed / Flagged Characters" with an incomplete checklist. Cut their speeches one by one; confirm the checklist updates. Cut their SDs; confirm both items go green. Click Unmark; confirm they leave the section.

---

## 30C — Doubling conflict warnings (item 6) ✅

### 30C-1: Warnings panel ✅
**File:** `components/CastingManager/CastingManager.tsx` — after quick-change warnings panel (line ~1493)

Build `conflictsList` from existing `conflictsPerChar` + `simultaneousMap`:
```typescript
const conflictsList: Array<{ actorId: string; charA: string; charB: string }> = [];
const _seen = new Set<string>();
for (const [charId] of conflictsPerChar) {
  const myActor = charToActor[charId];
  if (!myActor) continue;
  for (const otherCharId of simultaneousMap.get(charId) ?? new Set()) {
    if (charToActor[otherCharId] !== myActor) continue;
    const key = [charId, otherCharId].sort().join("|");
    if (_seen.has(key)) continue;
    _seen.add(key);
    conflictsList.push({ actorId: myActor, charA: charId, charB: otherCharId });
  }
}
```

Render a "Doubling Conflicts" section with a `🚫` icon per row, showing: actor color dot + name, then `CharA + CharB — simultaneously on stage`. Style matches quick-change cards (amber border, same structure).

Also check `suggestState.phase === "preview" && suggestState.forcedConflicts?.length > 0` — if present (they were forced below natural minimum), show a sub-section "Forced conflicts from last suggest:" listing each pair with shared-minutes if available. First verify that `SuggestResult.forcedConflicts` is actually plumbed into `suggestState` — if not, note it as a follow-up.

### 30C-2: Surface on actor cards ✅
In the actor-card render loop (~line 1320), compute `actorConflictCount` = number of entries in `conflictsList` where `actorId === actor.id`. Next to the existing `⚠` low-time badge (line 1378), add:
```tsx
{actorConflictCount > 0 && (
  <span className="text-red-500 text-xs" title={`${actorConflictCount} doubling conflict${actorConflictCount > 1 ? "s" : ""}`}>🚫 {actorConflictCount}</span>
)}
```
Also add `actorQuickChangeCount` = number of quick-change warnings for this actor, and show `⚡ N` if > 0.

### 30C-3: Character card badges ✅
`CharacterCard.tsx` already shows `⚠ N` for `conflictCount`. Add a quick-change badge: add optional prop `hasQuickChange?: boolean` to CharacterCard. Pass it from CastingManager by checking whether `quickChangeResult.warnings` contains this character's ID (`exitCharacterId` or `enterCharacterId`). Render as `⚡` next to the conflict badge when true.

**Verify:** Assign the same actor to two simultaneously-on-stage characters. Confirm:
1. Both CharacterCards show `⚠ 1`.
2. The actor card shows `🚫 1`.
3. A "Doubling Conflicts" section appears below quick-change warnings with the pair listed.
Then create a quick-change. Confirm the character card shows `⚡` and the actor card shows `⚡ 1`.

---

## 30D — Multi-select filters (item 5) ✅

### DashboardMatrix ✅
**File:** `components/Dashboard/DashboardMatrix.tsx:79-82`

Change `filterSceneId: string | null` to `filterSceneIds: Set<string>`. Update `handleRowLabelClick` to toggle scene into/out of the set (don't clear others). Update filtered-scene logic wherever `filterSceneId` is checked to use `.has()`. Add a "Clear filters" button (small, muted) that appears when `filterSceneIds.size > 0 || filterCharIds.size > 0`.

### PresenceChart ✅
**File:** `components/Dashboard/PresenceChart.tsx:29-40`

Change both `selectedCharId: string | null` and `selectedSceneId: string | null` to `Set<string>` (rename to `selectedCharIds`, `selectedSceneIds`). Remove mutual-exclusion between char and scene filters. Update `toggleChar` and `toggleScene` to add/remove from sets. Update filter application to use `.has()`. Add "Clear" link.

**Verify:** In DashboardMatrix, click two different scene rows — confirm both stay highlighted. Click a third — confirm it also adds. Click one again — confirm it deselects. Repeat for PresenceChart characters.

---

## 30E — Scene subdivisions in Scenes & Pauses (item 7) ✅

### Extract subdivision utility
**File:** Check whether `buildSubScenes` in `RehearsalGroupings.tsx` is importable or is a local function. If local, extract it to `lib/cuts/SceneSubdivisionUtils.ts` (or a shared location). Confirm it takes `(scene: Scene, activeCut: Cut, wpm: number)` and returns `SubScene[]`.

### SceneDashboard
**File:** `components/Dashboard/SceneDashboard.tsx`

In the "Scenes & Pauses" tab render, after computing `columnEntries`, loop over scenes and call `buildSubScenes(scene, activeCut, wpm)` for each. Collect results as `detectedSubdivisions: Map<sceneId, SubScene[]>`. Pass as prop to `SceneList`.

### SceneList
**File:** `components/Dashboard/SceneList.tsx`

Accept `detectedSubdivisions?: Map<string, SubScene[]>` prop. For each scene row that has `> 1` detected subdivisions AND no existing manual splits, show a collapsed "Suggested splits" disclosure:
```
⊕ 3 natural subdivisions detected [Show]
```
When expanded, list each subdivision entry with character set and line range. Each row has an `[Apply split here]` button calling `onAddSceneSplit(sceneId, partIdx)`. Verify the exact signature of `onAddSceneSplit` in `SceneDashboard` before implementing.

**Verify:** Load a play with a long scene (e.g., Hamlet 3.4). Open Scenes & Pauses. Confirm the "Suggested splits" disclosure appears. Click Apply — confirm the scene splits in the Rehearsal tab.

---

## 30F — Who's on stage sidebar (stretch) ✅

### Utility function
**File:** `lib/cuts/StageTimeEngine.ts`

Add `computeOnStageByScene(play, cut): Map<sceneId, Set<charId>>`. Walk scenes in canonical act order; maintain an `onStage: Set<string>` tracking chars; on each kept entrance SD add chars, on each kept exit SD remove chars. Store the snapshot at the end of each scene. Use `getEffectiveCharacters` for SD character lists and `activeCut.cutMap` for kept/cut checks. Carry state across scenes within the same act.

### ScriptEditor integration
**File:** `components/ScriptEditor/ScriptEditor.tsx`

1. Compute `onStageByScene` using the new utility (memoized on `play` + `activeCut`).
2. Add `const [sidebarMode, setSidebarMode] = useState<"info" | "onstage">("info")`.
3. In the desktop sidebar slot (`w-72 sticky`, line ~1124), add a 2-tab toggle strip at the top: `[Info] [On Stage]`. Show `LineCountPanel` when `sidebarMode === "info"`, show `<OnStageSidebar>` when `"onstage"`.
4. Tablet bottom drawer: reuse the same `sidebarMode`. Toggle button text becomes `"≡ Info"` / `"≡ On Stage"`.
5. Create `components/ScriptEditor/OnStageSidebar.tsx`. Props: `play`, `activeCut`, `onStageByScene`, `visibleSceneId`, `actors`, `assignments`, `characterAliases`. Renders scene label + per-character row (colored dot, char name, actor name below).
6. `visibleSceneId` tracking: `useEffect` with `IntersectionObserver` on all `[data-scene-id]` elements (threshold 0.15), tracking topmost visible entry. Verify `SceneBlock.tsx` / `ActBlock.tsx` sets `data-scene-id` before implementing.

**Verify:** Navigate to Script tab. Click "On Stage" tab in right sidebar. Scroll through script. Confirm character list updates at scene boundaries. Assign an actor; confirm color dot appears.

---

## Critical files

| File | Group |
|------|-------|
| `components/ScriptEditor/StageDirectionBlock.tsx` | 30A-1 |
| `components/CastingManager/CastingManager.tsx` | 30A-2, 30C-1, 30C-2 |
| `electron/main.ts` | 30A-3 |
| `lib/cuts/StageTimeEngine.ts` | 30B-1, 30B-2, 30B-3, 30F |
| `types/project.ts` | 30B-4 |
| `lib/project/projectIO.ts` | 30B-4 (CutSchema) |
| `lib/project/ProjectStore.tsx` | 30B-4 (new action) |
| `components/Dashboard/IntegrityChecks.tsx` | 30B-3, 30B-4 |
| `components/CastingManager/CharacterCard.tsx` | 30C-3, 30B-4 (new prop) |
| `components/Dashboard/DashboardMatrix.tsx` | 30D |
| `components/Dashboard/PresenceChart.tsx` | 30D |
| `components/Dashboard/SceneDashboard.tsx` | 30E |
| `components/Dashboard/SceneList.tsx` | 30E |
| `components/Dashboard/RehearsalGroupings.tsx` | 30E (extract utility) |
| `components/ScriptEditor/ScriptEditor.tsx` | 30F |
| `components/ScriptEditor/OnStageSidebar.tsx` | 30F (new file) |
