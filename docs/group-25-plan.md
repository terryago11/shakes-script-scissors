# Group 25 Implementation Plan — Count Audit, Audition Mode & Exports

> **25A (Edit Navigation + Expanded Search) is complete.** This document covers 25B–25D.

---

## Group 25B — Matrix/Character Count Audit & Fix

> **⚠ Use Claude Opus model for this sub-group. Prompt user before starting.**

### Root Cause

`buildCharSceneMatrix` (`components/Dashboard/SceneDashboard.tsx` lines ~45–103) recomputes counts independently from CutEngine and does **not** apply word-level edits (`speechEdits`). CutEngine applies them (checking `keptText.trim().length > 0`, `CutEngine.ts` ~line 167). Row totals use CutEngine's `sceneLineTotals` (correct), but **character cells** recompute via `buildCharSceneMatrix` and over-count.

### Fix: CutEngine as sole source of truth

1. **`lib/cuts/CutEngine.ts`** — add `byCharacterByScene: Record<charId, Record<sceneId, { lines: Counts; words: Counts }>>` to `LineCounts`. Populate inside the existing per-scene/per-speech loop alongside `byCharacter` and `byScene`.

2. **`components/Dashboard/SceneDashboard.tsx`** — pass `lineCounts.byCharacterByScene` into `DashboardMatrix`; remove `buildCharSceneMatrix` recomputation.

3. **`components/Dashboard/DashboardMatrix.tsx`** — consume `byCharacterByScene` for cell values. Keep fallback for back-compat.

### Integrity check (required, not optional)

Build a utility (dev + production, not gated) that compares CutEngine output vs matrix cell values and throws a clear error if they diverge. The check must verify **exact word count equality** (not ±1, not "≤"). Test matrix:

| Pass | Cut state |
|------|-----------|
| P1 | No cuts at all — all kept |
| P2 | Some speeches cut at speech level |
| P3 | Some lines cut within speeches (`lineCutMap`) |
| P4 | Word-level edits applied (`speechEdits`) |
| P5 | Reassignments (`speechReassignments`) |
| P6 | Combination: cuts + line cuts + word edits + reassignments |

For each pass: run CutEngine → record `byCharacter` totals → run matrix build → compare per-character word counts **exactly**. Log a summary table. Assert zero discrepancies before marking 25B done.

### Files to change

- `lib/cuts/CutEngine.ts` — add `byCharacterByScene` to `LineCounts` + populate
- `components/Dashboard/SceneDashboard.tsx` — use authoritative data, remove recompute
- `components/Dashboard/DashboardMatrix.tsx` — consume new prop
- `lib/cuts/countIntegrityCheck.ts` (new) — integrity check utility called from SceneDashboard in all envs

---

## Group 25C — Audition Mode + Suggest Cast Actor Count

### 25C-1: Named Casting Snapshots

**Data model (`types/project.ts`)**:
```typescript
interface CastingSnapshot {
  id: string;
  name: string;
  actors: Actor[];
  assignments: ActorAssignment[];
  createdAt: string; // ISO
}
// Added to Project:
castingSnapshots?: CastingSnapshot[];
```
`Project.actors` / `Project.assignments` remain the **active** (applied) casting. Snapshots are saved alternatives that don't affect any engines until explicitly applied.

**Schema (`lib/project/projectIO.ts`)**: Add `CastingSnapshotSchema` and `castingSnapshots` (optional array) to `ProjectSchema`. Must be added explicitly — fields not in schema are stripped on import.

**UI (`components/CastingManager/CastingManager.tsx`)**:
- "Audition Mode" toggle in the casting page toolbar opens a horizontal snapshot bar above the character grid
- Snapshot bar: named snapshot chips + **Save Current As Snapshot** / **Switch** (loads a snapshot's actors+assignments into the UI without applying to project) / **Apply** (writes to `project.actors` + `project.assignments`) / **Rename** / **Delete**
- In audition mode the UI operates on a local copy of the selected snapshot. Persistent banner: "Audition Mode — changes won't affect your project until you Apply." Confirm dialog on dirty exit.
- Small label in actor panel: "Actors are shared across all cuts." (already true in data model — just surface it in UI)

**Store mutations (`lib/project/ProjectStore.tsx`)**: `saveCastingSnapshot`, `applyCastingSnapshot`, `deleteCastingSnapshot`, `renameCastingSnapshot`

**Files to change**:
- `types/project.ts`
- `lib/project/projectIO.ts`
- `lib/project/ProjectStore.tsx`
- `components/CastingManager/CastingManager.tsx`

---

### 25C-2: Suggest Cast — Desired Actor Count

**New helper (`lib/cuts/StageTimeEngine.ts`)**:
```typescript
export function computePairwiseSharedMinutes(
  play: Play, cut: Cut, settings?: ProjectSettings,
): Map<string, Map<string, number>>
```
For each kept speech unit, for every pair (a, b) currently `onStage`, accumulate `unitDurationMinutes` into `shared[a][b]`. Returns a symmetric map (store a < b, look up either order).

**New return type + option (`lib/cuts/CastingUtils.ts`)**:
```typescript
export interface SuggestResult {
  assignments: Array<{ charId: string; actorIndex: number }>;
  forcedConflicts: Array<{ charA: string; charB: string; sharedMinutes: number }>;
  naturalMinimum: number;
}

// Added to SuggestOptions:
desiredActorCount?: number;
sharedMinutes?: Map<string, Map<string, number>>;
```

**Post-colouring phase in `suggestMinimumCast`**:
- **Target < natural minimum**: greedy merge — pick pair of actor groups with lowest pairwise shared stage time, merge, record as `forcedConflict`. Repeat until count = target.
- **Target > natural minimum**: split — move lowest-line character from largest group to solo slot. Repeat until count = target or all groups solo.

**UI (`components/CastingManager/CastingManager.tsx`)**:
- `naturalMinimum` computed on mount + on `activeCut`/`play` change via `useEffect`
- "Desired # of actors: [ N ] (algorithm minimum: N)" shown in Replace/Extend choosing panel
- `handleSuggest` always shows choosing panel (doubles as count picker even when no actors exist yet)
- Preview panel: amber warning for forced conflicts (list pairs + shared minutes) or unassigned-actors warning if target > total parts
- Help text: add "Desired actor count" subsection

**Files to change**:
- `lib/cuts/StageTimeEngine.ts`
- `lib/cuts/CastingUtils.ts`
- `components/CastingManager/CastingManager.tsx`

---

## Group 25D — Exports: Casting Grid & Line Buddy

### 25D-1: Casting Grid Print Sheet

**What**: A fun, offline-friendly printable HTML for physical rehearsal room use. Print once, cut out the cards, pin them on a board. Two sections:
1. **Character cards**: name, assigned actor, line/word/stage-time, must-double notes — one card per character, cut-out friendly
2. **Actor cards**: name, characters assigned with per-character stats + totals — one card per actor

**UI trigger**: "Print Casting Sheet" button **inside Audition Mode** (in the snapshot bar or as an action on the active/applied snapshot). Printing a snapshot prints that snapshot's casting.

**Implementation**:
- New `lib/cuts/CastingGridExporter.ts` — `exportCastingGrid(...): string` — self-contained HTML with `@media print` CSS (inline styles, no Tailwind, no external deps), cut-line borders for physical cutting
- Opens in new tab → browser print → physical paper or PDF

**Files to change/create**:
- `lib/cuts/CastingGridExporter.ts` (new)
- `components/CastingManager/CastingManager.tsx` — add button in audition mode

---

### 25D-2: Line Buddy Interactive HTML Export

**What**: Self-contained, offline-capable interactive HTML for line learning. Per-actor: see cue → guess line → reveal → advance.

**UI trigger**: New **"Line Buddy (Interactive HTML)"** option in the **Cue Scripts tab** (`components/CueScript/ExportMenu.tsx`), alongside Print PDF / Download ZIP.

**UX flow**:
1. Export dialog: choose actor(s) (default all; one HTML per actor, delivered as a ZIP)
2. Generated HTML is fully self-contained (inline JS + CSS, zero network deps)
3. Card shows: **Cue** (last 3 words of preceding speech, italicised) + character name
4. Space / → reveals the actor's line; ← / → navigates; progress bar at top
5. Optional shuffle mode for random-order drilling
6. Responsive + touch-friendly (large tap targets) — works in any mobile browser

**Getting it onto mobile**: AirDrop (iOS/macOS), email/messaging attachment, or cloud storage (iCloud Drive / Google Drive → Files app → open in Safari).

**Implementation**:
- New `lib/cuts/LineBuddyExporter.ts` — `exportLineBuddy(actorCueScript, actor, play): string` — builds on `CueScriptBuilder.buildCueScript` output
- New `app/api/export/line-buddy-zip/route.ts` (same pattern as `cue-scripts-zip`)
- `components/CueScript/ExportMenu.tsx` — add "Line Buddy" option

**Files to change/create**:
- `lib/cuts/LineBuddyExporter.ts` (new)
- `app/api/export/line-buddy-zip/route.ts` (new)
- `components/CueScript/ExportMenu.tsx`

---

## Verification

| Item | Test |
|------|------|
| 25B Matrix fix | Run 6-pass integrity check (no cuts → speech cuts → line cuts → word edits → reassignments → combined). Assert **exact** word count equality per character per scene in all passes. Zero discrepancies before marking done. |
| 25C-1 Audition | Save 2 snapshots → switch between → apply one → exit → project casting matches applied snapshot. Export + reimport preserves `castingSnapshots`. |
| 25C-2 Suggest | Natural minimum pre-fills input. Count below min → amber forced-conflict warning. Count above → more actors, no warnings. Default → identical to previous behaviour. `npx tsc --noEmit` passes. |
| 25D-1 Casting grid | In audition mode, click Print Casting Sheet → new tab with character + actor cards; print CSS hides nav; cards have cut-line borders. |
| 25D-2 Line Buddy | Export from Cue Scripts tab → ZIP → open HTML in desktop Chrome → Space reveals line → → advances → progress bar updates. Open same HTML in iPhone Safari via Files app. |

## Implementation order

1. **25B** — highest correctness impact; use **Opus** model; **prompt user before starting**
2. **25C-1** — audition mode snapshots
3. **25C-2** — suggest cast actor count
4. **25D-1** — casting grid print sheet
5. **25D-2** — line buddy interactive HTML
