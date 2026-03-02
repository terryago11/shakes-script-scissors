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
    export/               ← ExportMenu + CueScriptDocument (print cue scripts)
  view/page.tsx           ← read-only shared view (loads project from URL hash)

components/
  ScriptEditor/
    ScriptEditor.tsx        ← orchestrates play, computes cuts + stage time; view-mode switch
    ActBlock.tsx            ← collapsible act with drag-reorder; filters by character/focus
    SceneBlock.tsx          ← collapsible scene, focus mode, restore-all button
    SpeechBlock.tsx         ← speech unit, line-level cuts, word-level edits
    StageDirectionBlock.tsx ← SD display; entrance/exit show character chips (add/remove)
    DiffView.tsx            ← side-by-side diff: modified (left) vs original (right)
  LineCounts/
    LineCountPanel.tsx      ← Lines / Words / Time tabs; focus-mode scoped counts
    CharacterRow.tsx        ← single character row with bar chart
    ActorRow.tsx            ← single actor row with bar chart
  CastingManager/
    CastingManager.tsx      ← builds simultaneous-pairs map, computes conflict warnings
    CharacterCard.tsx       ← actor dropdown with ⚠ prefix for conflicting actors
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

### Not Started (Phase 3+)
- **Group 8**: Scene Dashboard (`/dashboard`); Insert Pause; quick-change doubling warning
- **Group 9**: Script integrity (no-exit warning, all-cut grey-out, reassign speech)
- **Group 10**: Global character rename (`characterAliases`); suggest minimum cast
- **Group 11**: Self-contained HTML export; PDF export of cue scripts
- **Stretch**: Insert text; Google Drive backup; SD "All" expansion; Settings panel (WPM UI)
