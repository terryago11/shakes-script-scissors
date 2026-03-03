# shakes-script-scissors

A web tool for interactively cutting Shakespeare scripts for production. Directors and dramaturgs can load any play, mark cuts, track before/after line counts, manage multiple cut iterations, assign actors to roles (double-casting), and export individual actor cue scripts.

## Dev Commands

```bash
npm run dev      # Start dev server at http://localhost:3000
npm run build    # Production build
npm run lint     # ESLint check
npx tsc --noEmit # TypeScript check (no build output)
```

Node must be loaded via nvm: `export PATH="$HOME/.nvm/versions/node/v22.9.0/bin:$PATH"`

## Architecture

**Stack**: Next.js 16 App Router · TypeScript · Tailwind v4 · fast-xml-parser
**Storage**: Browser `localStorage` + JSON file export/import (no database, no auth)
**Data source**: DraCor API (`https://dracor.org/api/v1/corpora/shake/plays/{slug}/tei`) — same Folger TEI data, cleaner endpoint

## Key Files

| Path | Purpose |
|------|---------|
| `lib/folger/FolgerClient.ts` | Fetches TEI XML from DraCor; `PLAYS` array maps `id` → `slug` |
| `lib/folger/TeiParser.ts` | Parses TEI XML into `Play` domain objects; sets `stageType` + `isSong` on SDs |
| `lib/folger/PlayCache.ts` | LRU in-memory cache for parsed plays (server-side) |
| `lib/cuts/CutEngine.ts` | Pure fn: `(Play, Cut, assignments, actors)` → `LineCounts` + filtered units |
| `lib/cuts/StageTimeEngine.ts` | Computes per-character on-stage time from entrance/exit SDs; returns cut vs original minutes |
| `lib/cuts/CueScriptBuilder.ts` | Builds per-actor cue scripts from cut play |
| `lib/project/ProjectStore.tsx` | React context + localStorage persistence; all project mutations |
| `lib/project/projectUtils.ts` | `generateId()`, `defaultColors` (reds + greens excluded — reserved for UI indicators) |
| `lib/project/projectIO.ts` | JSON export (file download) and import (file picker + Zod validation); `exportProject` / `importProject` |
| `app/api/play/[playId]/route.ts` | GET: fetch + parse + cache a play; returns `Play` JSON |
| `app/api/plays/route.ts` | GET: returns `PLAYS` listing |

## Data Models (types/)

### `Play` (parsed from TEI, never stored)
- `acts[]` → `scenes[]` → `units[]` (Speech | StageDirection)
- `Speech`: `characterId` (e.g. `#Hamlet_Ham`), `lines[]`, `lineCount`
- `StageDirection`: `id`, `text`, `characters[]`, `stageType?` (`"entrance"|"exit"|"business"|"delivery"`), `isSong?`
- `Line`: `id`, `ftln` (Folger through-line number), `text`

### `Project` (stored as JSON in localStorage)
- `name?: string` — optional display name (e.g. "2026 Production"); distinct from `playTitle`
- `cuts[]`: each cut has:
  - `cutMap: Record<unitId, "cut"|"kept">` — speech-level cuts
  - `lineCutMap?: Record<lineId, "cut"|"kept">` — individual line cuts within speeches
  - `stageDirectionEdits?: Record<sdId, string[]>` — full override of character list per SD
  - `sceneOrder?: string[]` — custom scene ordering (for reordering scenes)
  - `speechEdits?: Record<unitId, SpeechEdit>` — word-level track-changes edits
- `actors[]`: name + color hex
- `assignments[]`: `characterId` → `actorId` (double-casting: one actor → many characters)
- `settings?: { wordsPerMinute: number }` — used for stage time calculation
- Export file extension: `.sss.json`

## TEI Parsing Notes

The DraCor TEI format uses:
- `<l xml:id="ftln-N">` for verse lines
- `<p xml:id="p-N"><lb xml:id="ftln-N"/>text</p>` for prose (multiple `<lb>` per `<p>` = multiple lines)
- `<lg xml:id="stz-N">` for stanzas/songs (contains `<l>` children)
- `<div type="act" n="1">` and `<div type="scene" n="1">`
- `<sp who="#CharId_PlayId">` for speeches
- `<castItem sameAs="#CharId_PlayId">` for cast list
- `<stage type="entrance|exit|...">` for stage directions (type drives on-stage tracking)

`fast-xml-parser` is configured with `preserveOrder: true` so elements maintain document order.

**Known DraCor data gaps**: Some exit SDs are missing characters (e.g. "All but Hamlet exit" may omit Voltemand/Cornelius). Use the SD character editor to fix per-production.

## Line Counts (verified)
- MND: 2200 spoken lines (1749 verse `<l>` + 451 prose `<lb>`) ✓
- Hamlet: ~4058 spoken lines ✓

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
    CastingManager.tsx      ← builds simultaneous-pairs map, computes conflict warnings; actor inline rename + delete-with-confirmation; passes line/word/time counts to CharacterCard
    CharacterCard.tsx       ← actor dropdown with ⚠ prefix for conflicting actors; shows cut line/word/time counts inline
  Dashboard/
    SceneDashboard.tsx      ← orchestrator; builds charSceneMatrix + stageTime; metric/tab state
    SceneList.tsx           ← drag-reorder scene list; pause insertion between scenes
    DashboardMatrix.tsx     ← character × scene matrix; actor-grouped headers; totals; Table/Chart
    RehearsalGroupings.tsx  ← By Actor scene breakdown + Suggested Rehearsal Blocks (side-by-side)
    IntegrityChecks.tsx     ← Integrity tab: side-by-side no-exit / no-entrance warning cards
```

## Stage Time Engine (`lib/cuts/StageTimeEngine.ts`)

On-stage tracking uses **entrance/exit SDs only** — no fallback from speech presence.

- `onStageOrig`: driven by `sd.characters` (raw TEI data, unaffected by edits)
- `onStage`: driven by `getEffectiveCharacters(sd, edits)` (applies `stageDirectionEdits`)
- Time accumulates for **all characters currently on stage** per speech, not just the speaker
- Adding a character to an SD → their **cut** stage time increases; original unchanged
- Removing a character from an SD → their **cut** stage time decreases; original unchanged

`StageTimeResult` returns:
- `byCharacter`: `{ minutes, originalMinutes, scenes[] }` per character
- `totalMinutes` / `originalTotalMinutes`: total show duration
- `warnings`: `Array<{ characterId, type: "no-exit" | "no-entrance" }>` — characters with kept speeches but no matching entrance/exit SD anywhere in the play. Filtered to non-empty `characterId` to skip TEI data gaps (`<sp>` with no `who=` attribute).

## Doubling Conflict Detection (`CastingManager.tsx`)

`computeSimultaneousMap` walks entrance/exit SDs to build `Map<charId, Set<charId>>` of characters ever simultaneously on stage. From this:
- `conflictCount` badge (⚠ N) on a character card = N of their simultaneous partners share the same assigned actor
- Actor dropdown shows `⚠ ActorName` as a **pre-warning** before assigning, if that actor is already assigned to a simultaneous-on-stage character

## UI Color Conventions

| Color | Meaning |
|-------|---------|
| Amber | Baseline / unchanged |
| Red | Cut (lines removed, stage time reduced) |
| Green | Addition (character added to SD, stage time exceeds original) |
| Actor colors | Blue, amber, violet, teal, fuchsia, slate, orange, cyan — **no reds or greens** |

## View Modes (`lib/ui/ViewModeContext.tsx`)

Three modes toggled from the Script nav dropdown:
- **Standard** (`"standard"`) — cuts shown with strikethrough (default)
- **Clean** (`"clean"`) — cut speeches/SDs hidden; final script only
- **Diff** (`"diff"`) — side-by-side: modified left, original right (`DiffView.tsx`)

## MetricContext (`lib/ui/MetricContext.tsx`)

Global context providing `metric: "lines" | "words" | "time"` and `wpm: number` (synced from `project.settings.wordsPerMinute`). Act and scene headers read from this to display the correct unit. Switching to the Time tab in `LineCountPanel` sets `metric = "time"`, which causes all act/scene headers to show minutes instead of counts.

## Character ID Normalization (`lib/folger/TeiParser.ts`)

`characterIdToName(id: string): string` — exported utility that converts a raw TEI character ID (e.g. `#PLAYERS_Ham`, `#SOLDIERS.FORTINBRAS_Ham`) to a readable name using the same normalization as the cast list. Used as a fallback in `LineCountPanel` when a character appears in stage directions but has no formal `<castItem>` entry.

## Scene Dashboard (`app/projects/[projectId]/dashboard/`)

Three-tab overview page for production planning. All counts reflect the **cut** (not original) unless noted.

### Tab 1 — Scenes & Pauses (`SceneList.tsx`)
- Lists scenes in `effectiveSceneOrder` with line / word / running-time count for each scene
- **Drag-reorder**: grab handle (`⠿`) to move scenes; amber drop-indicator bar; dispatches `SET_SCENE_ORDER`
- **Insert Pause**: click ⏸ between any two scenes to add a named intermission/break with a duration in minutes; pauses appear in the scene list and are included in total running time

### Tab 2 — Matrix (`DashboardMatrix.tsx`)
- Character × scene grid showing cut-only values (`linesAfterCut`, `wordsAfterCut`, stage-time `minutes`)
- **Actor-grouped column headers**: cast characters grouped under a spanning actor name row (left-aligned, actor-colored); uncast characters in their own group
- **Column click** → filter visible rows to scenes where that character appears; click again to clear
- **Row total** column (right edge) and **column total** footer row; grand total in bottom-right
- Fully-cut scenes (all speeches removed) are dimmed at 30% opacity
- **Table / Chart toggle**: Chart view renders horizontal bars per character sorted by total descending, with actor name column always fixed-width so counts stay aligned

### Tab 3 — Rehearsal (`RehearsalGroupings.tsx`)
Two sections rendered side-by-side:
- **By Actor**: for each actor, list of scenes they appear in (via any of their characters) with cut-only line/word/time values and totals
- **Suggested Rehearsal Blocks**: consecutive scenes sharing at least one actor are grouped into a single "block" (multi-scene blocks only); shows scene range, duration, actor chips, and per-scene breakdown

`SceneDashboard.tsx` orchestrates all tabs: builds `charSceneMatrix` (via `buildCharSceneMatrix` helper) and `actorSceneMatrix` (for SceneList actor presence chips), calls `computeStageTime` and `computeCuts`, derives `cutSceneIds`.

### Tab 4 — Integrity (`IntegrityChecks.tsx`)
Side-by-side columns: **Missing Exit SDs** (left) and **Missing Entrance SDs** (right). Each character appears as an expandable card showing:
- Scenes where they have kept speeches
- Known complementary SD locations (e.g. known entrance when exit is missing) with approximate scene-relative line number (`~l.N`)
- "Both are missing" when neither SD exists

Badge on the tab button shows total warning count. `buildCharDetails` uses `findSdsForChar()` to walk the play counting kept lines before each matching SD to compute the approximate line number.

`buildCharSceneMatrix` respects `speechReassignments`: original counts go to `unit.characterId`, afterCut counts go to `reassignments[unit.id] ?? unit.characterId`. Fully-cut characters are defined as having all speeches cut AND all entrance/exit SDs cut.

## Speech Reassignment (`SpeechBlock.tsx`)

A speech can be reassigned to a different character via `Cut.speechReassignments?: Record<unitId, characterId>`. In the script view:
- Hover the character name → faint border + `⇄` icon appears above the name; click to open a dropdown
- Once reassigned: original name shown with red strikethrough, new name in green; hover affordance is hidden
- `↩ restore` button appears on hover and clears the reassignment (plus any cuts) in one click
- Reassignment is reflected in dashboard `buildCharSceneMatrix`: afterCut counts route to the new character, original counts stay on the original

## Running Line Counter (`SceneBlock.tsx` + `SpeechBlock.tsx`)

A right-aligned scene-relative line number appears every 5 lines, displayed in `text-stone-700`:
- **Standard mode**: counts ALL lines (including cut ones) — numbers reflect position in the full original text
- **Clean mode**: counts only kept lines — numbers reflect position in the cut script
- **Diff mode**: left column counts kept lines; right column counts all lines (each column independent)

`SceneBlock` pre-computes `speechStartLines: Map<unitId, offset>` before rendering; `SpeechBlock` receives the offset as `speechLineOffset` and builds `lineNumMap` per-line.

## Cue Script Format

For each actor: their lines preceded by the last 2–3 words of the previous speech (the "cue"). Stage directions mentioning their characters are included. Both **entrance and exit** SDs emit a cue entry so the actor knows exactly when to enter or exit. Stage direction character lists respect `stageDirectionEdits`. Printed directly from the browser via `window.print()` with Tailwind `print:` styles.

---

## Roadmap

### Done ✓
- **Group 1**: Jump-to-scene dropdown, scene focus mode
- **Group 2**: Filter by character/actor, cue name normalization, character normalization
- **Group 3**: Word-level track-changes edits within lines; line-level cuts within speeches
- **Group 4**: Scene drag-reorder (cross-act); drop indicators; read-only `/view` page
- **Group 5**: Stage time engine; SD character add/remove; doubling conflict detection with pre-warnings; Time tab in LineCountPanel (running time, by-actor, by-character with cut/original, red/green/amber bars)
- **Group 6**: README user-facing section; gitignore cleanup
- **Group 7**: Save/Open Project UI; 3-mode view toggle (Standard / Clean / Diff); focus-mode scene counts in LineCountPanel; character filter hides empty acts; Time metric in act/scene headers; cue script entrance + exit SD cues; play title subtitle in nav; `characterIdToName` fallback for unrecognized stage-direction characters
- **Group 8**: Scene Dashboard (`/dashboard`) with 3 subtabs — Scenes & Pauses (drag-reorder, pause insertion), Matrix (character × scene line/word/time counts, actor-grouped headers, column filter, row + column totals, Table/Chart toggle with sorted bar chart), Rehearsal (By Actor breakdown + Suggested Rehearsal Blocks side-by-side); scene reorder moved exclusively to Dashboard; metric toggle (Lines/Words/Time) in dashboard header
- **Group 9**: Script Integrity — Dashboard Integrity tab (side-by-side no-exit / no-entrance warnings with scene/line location of complementary SD); speech reassignment (hover char name → dropdown, restore clears it); running scene-relative line counter every 5 lines (mode-aware: Standard=all lines, Clean/Diff=kept lines); fully-cut character defined as all speeches + all entrance/exit SDs cut; CharacterCard shows cut line/word/time counts; actor inline rename + delete-with-confirmation in CastingManager

### Not Started (Phase 3+)
- **Group 10**: Global character rename (`characterAliases`); suggest minimum cast
- **Group 11**: Self-contained HTML export; PDF export of cue scripts
- **Stretch**: Insert text; Google Drive backup; SD "All" expansion; Settings panel (WPM UI)
