# Architecture Reference

Deep-dive notes on internals. See [CLAUDE.md](../CLAUDE.md) for dev commands, key files, and critical conventions.

## Component Layout

```
app/
  page.tsx                ← home page; "Open Project" file import + cached-project list
  projects/[projectId]/
    layout.tsx            ← nav bar (Save Project, view-mode dropdown, scene jumper), CutSelector
    page.tsx              ← ScriptEditor (main cutting view)
    casting/              ← CastingManager (actor-character assignments + conflict detection)
    dashboard/            ← SceneDashboard (3-tab view: Scenes & Pauses, Matrix, Rehearsal)
    export/               ← ExportMenu + CueScriptDocument (print cue scripts)
  view/page.tsx           ← read-only shared view (loads project from URL hash)

components/
  ScriptEditor/
    ScriptEditor.tsx        ← orchestrates play, computes cuts + stage time; view-mode switch
    ActBlock.tsx            ← collapsible act; filters by character/focus
    SceneBlock.tsx          ← collapsible scene, focus mode, restore-all button
    SpeechBlock.tsx         ← speech unit, line-level cuts, word-level edits, speech reassignment, running line counter
    StageDirectionBlock.tsx ← SD display; entrance/exit show character chips (add/remove)
    DiffView.tsx            ← side-by-side diff: modified (left) vs original (right)
  LineCounts/
    LineCountPanel.tsx      ← Lines / Words / Time tabs; focus-mode scoped counts
    CharacterRow.tsx        ← single character row with bar chart
    ActorRow.tsx            ← single actor row with bar chart
  CastingManager/
    CastingManager.tsx      ← builds simultaneous-pairs map, computes conflict warnings; actor rename/delete; suggest cast; ? help
    CharacterCard.tsx       ← actor dropdown with ⚠ conflicts; cut counts; alias editing; character link pills
  Dashboard/
    SceneDashboard.tsx      ← orchestrator; builds charSceneMatrix + stageTime; metric/tab state
    SceneList.tsx           ← drag-reorder scene list; pause insertion between scenes
    DashboardMatrix.tsx     ← character × scene matrix; actor-grouped headers; totals; Table/Chart
    PresenceChart.tsx       ← Tableau-style presence chart; play-level FTLN swimlane + scene-level strips; cross-linked filters
    RehearsalGroupings.tsx  ← By Actor scene breakdown + Suggested Rehearsal Blocks (side-by-side)
    IntegrityChecks.tsx     ← no-exit/no-entrance warning cards; Name Diagnostics table
```

## TEI Parsing Notes

The DraCor TEI format uses:
- `<l xml:id="ftln-N">` for verse lines
- `<p xml:id="p-N"><lb xml:id="ftln-N"/>text</p>` for prose (multiple `<lb>` per `<p>` = multiple lines)
- `<lg xml:id="stz-N">` for stanzas/songs (contains `<l>` children)
- `<l part="I|F" prev="#ftln-N">` — shared verse lines split across speakers; `part="I"` (no prev) starts the chain, `part="I"+prev` marks middle fragments, `part="F"` closes it; `partIndentChars` stores cumulative preceding-text length for proportional indentation
- `<stage>` inside `<sp>`: pre-first-line stages become `Speech.deliveryNote`; stages between lines split the speech into multiple Speech + SD units; `<stage>` **inside** `<l>` or `<p>/<lb>` become `Line.stageNote` (extracted via `extractAllTextSkippingStages`)
- Top-level body divs: `act`, `prologue`, `epilogue`, `induction` — `divType` on `Act` distinguishes non-act structural divs
- Scene-level div types: `scene`, `chorus`, `epilogue`, `prologue` — `sceneType` on `Scene`
- `<sp who="#CharId_PlayId">` for speeches; `<castItem sameAs="#CharId_PlayId">` for cast list
- `<stage type="entrance|exit|...">` drives on-stage tracking
- `<stage type="dumbshow">` — parsed with `isDance: true`, `stageType` normalised to `"business"` (⊛ cyan indicator)
- `<gap>` — rendered as `[…]` (~4 occurrences across Hamlet, All's Well, Titus Andronicus)

`fast-xml-parser` configured with `preserveOrder: true`.

**Two `<castItem>` formats**: `<role><name>King Claudius</name></role>` (named) vs `<role>A Lord</role>` (minor). TEI-authored names used verbatim; `normalizeCharacterName` only applied as ID-stem fallback.

**Known DraCor data gaps**: Some exit SDs omit characters (e.g. "All but Hamlet exit"). Fix per-production via SD character editor.

**FDT → DraCor normalization**: Raw Folger TEI uses `<div1>`/`<div2>`, `<milestone unit="ftln">`, word-level `<w>`/`<c>`/`<pc>`. DraCor normalizes to TEI P5. Elements absent from DraCor corpus: `<sound>`, `<foreign>`, `<hi>`, `<app>`, `<fw>`, `<stage type="modifier">`.

## Stage Time Engine (`lib/cuts/StageTimeEngine.ts`)

On-stage tracking uses **entrance/exit SDs only** — no fallback from speech presence.

- `onStageOrig`: driven by `sd.characters` (raw TEI, unaffected by edits)
- `onStage`: driven by `getEffectiveCharacters(sd, edits)` (applies `stageDirectionEdits`)
- Time accumulates for **all characters on stage** per speech, not just the speaker
- Adding a character to an SD → their cut stage time increases; original unchanged
- Removing → cut stage time decreases; original unchanged

`StageTimeResult`: `byCharacter` (`{ minutes, originalMinutes, scenes[] }`), `totalMinutes`/`originalTotalMinutes`, `warnings` (`"no-exit"|"no-entrance"` — filtered to non-empty `characterId`).

## Doubling Conflict Detection (`CastingManager.tsx`)

`computeSimultaneousMap` walks entrance/exit SDs → `Map<charId, Set<charId>>` of characters ever simultaneously on stage.
- `conflictCount` badge (⚠ N) = N simultaneous partners sharing the same actor
- Actor dropdown shows `⚠ ActorName` as pre-warning before assignment

### Quick-change warnings (`lib/cuts/QuickChangeEngine.ts`)

`computeQuickChanges` detects turnaround gaps below `settings.quickChangeThresholdMinutes` (default 2.0 min). Each `QuickChangeWarning` carries exit/enter scene IDs, act/scene numbers, `exitApproxLine`/`enterApproxLine` (scene-relative original-text line count), and `gapMinutes`.

`exitApproxLine` counts all speech `lineCount`s in the scene up to exit regardless of cut status — matches uncut script for physical reference.

## Minimum Cast Suggestion (`lib/cuts/CastingUtils.ts`)

Welsh–Powell greedy graph colouring:

1. `buildForbiddenPairs(play, cut, settings)` — walks cut play tracking cumulative minutes; pairs with gap < threshold are forbidden
2. Sort characters descending by simultaneous-pair count, tie-break by line count
3. Union-find merges `sameActorPairs` (existing assignments + character links) into groups
4. Greedy colouring — lowest slot not used by any simultaneous/forbidden neighbour
5. Prefer least-loaded slot among valid options to balance cast

## Character Aliases

Per-cut display-name overrides (`Record<characterId, string>`). Never alters `Play` data. Propagated via `resolveCharacterName()`. Alias editing: hover name → pencil → inline input → Enter/blur. Cleared by deleting the key. Cloned when duplicating a cut.

## Character Links

Same-actor pairs (`Array<[charIdA, charIdB]>`, lexicographic order for stable equality). `TOGGLE_CHARACTER_LINK` store action. Links feed into `handleSuggest` as `sameActorPairs` — overrides quick-change forbidden pairs (encodes dramaturgical decision).

## Scene Dashboard Tabs

**Tab 1 — Scenes & Pauses** (`SceneList.tsx`): drag-reorder via grab handle, dispatches `SET_SCENE_ORDER`; ⏸ inserts named intermissions with durations.

**Tab 2 — Matrix** (`DashboardMatrix.tsx`): character × scene grid, cut-only values. Actor-grouped column headers. Column click filters rows. Table/Chart toggle (Chart = horizontal bars by total descending). `buildCharSceneMatrix` routes afterCut counts via `speechReassignments`.

**Tab 3 — Rehearsal** (`RehearsalGroupings.tsx`): By Actor (scenes per actor) + Suggested Rehearsal Blocks (consecutive scenes sharing ≥1 actor, multi-scene only).

**Tab 4 — Integrity** (`IntegrityChecks.tsx`): Missing Exit/Entrance SD cards with expandable scene lists and `~l.N` locations. Name Diagnostics: collapsible table showing TEI ID · Cast List · Speaker tag · ID-normalized · SD References · Resolved, sky-blue rows for aliased characters.

## Speech Reassignment

`Cut.speechReassignments?: Record<unitId, characterId>`. Hover name → `⇄` icon → dropdown. Reassigned: original in red strikethrough, new in green. `↩ restore` clears reassignment + cuts. `buildCharSceneMatrix`: original counts on `unit.characterId`, afterCut on reassigned ID.

## Running Line Counter

Scene-relative line number every 5 lines (`text-stone-700`). Standard mode: counts all lines (original position). Clean mode: kept lines only. Diff mode: left = kept, right = all. `SceneBlock` pre-computes `speechStartLines: Map<unitId, offset>`; `SpeechBlock` receives `speechLineOffset`.

## MetricContext (`lib/ui/MetricContext.tsx`)

`metric: "lines"|"words"|"time"` + `wpm: number`. Act/scene headers read metric. Switching to Time tab in `LineCountPanel` sets `metric = "time"` → all headers show minutes.

## Character ID Normalization

`characterIdToName(id)` in `TeiParser.ts` — fallback for characters in SDs with no `<castItem>` entry (e.g. `#PLAYERS_Ham` → readable name).

---

## Data Model

See [CLAUDE.md](../CLAUDE.md#data-models) for the authoritative `Play` and `Project` type definitions with inline annotations.
