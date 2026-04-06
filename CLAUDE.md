# shakes-script-scissors

A web tool for interactively cutting Shakespeare scripts for production. Directors and dramaturgs can load any play, mark cuts, track before/after line counts, manage multiple cut iterations, assign actors to roles (double-casting), and export individual actor cue scripts.

## Dev Commands

```bash
npm run dev      # Start dev server at http://localhost:3000
npm run build    # Production build
npm run lint     # ESLint check
npx tsc --noEmit # TypeScript check (no build output)
```

Node must be loaded via nvm:

## Auth Middleware

The app uses iron-session for password auth (`middleware.ts` at the project root). **Critical convention:**

- The file **must** be named `middleware.ts` (not `proxy.ts` or anything else)
- The exported function **must** be named `middleware` (or `default`) — not `proxy` or any other name
- Next.js only recognises middleware by filename + export name; a misnamed file/export silently breaks all routes (every page returns 404, including `/login` itself)

If you ever see all routes returning 404 with a redirect loop to `/login`, check that `middleware.ts` exists at the project root with `export async function middleware(...)`. Do **not** rename it to `proxy.ts` — this was tried twice and broke the app both times.

## Updating Play Texts

**DraCor plays (37 of 38)**: Pull the submodule.
```bash
cd shakedracor && git pull origin main && cd ..
git add shakedracor && git commit -m "chore: update DraCor submodule"
```

**The Two Noble Kinsmen (Folger source)**: Check for updates at the `folgerSource` URL in `FolgerClient.ts`, then re-run the normalizer.
```bash
curl -o /tmp/TNK-raw.xml https://www.folgerdigitaltexts.org/download/xml/TNK.xml
python3 scripts/normalize-folger-tei.py /tmp/TNK-raw.xml shakedracor/tei/the-two-noble-kinsmen.xml
cd shakedracor && git add tei/the-two-noble-kinsmen.xml && git commit -m "chore: update TNK from Folger" && cd ..
git add shakedracor && git commit -m "chore: update TNK submodule ref"
```
Both updates should be done together whenever play texts are refreshed.

 `export PATH="$HOME/.nvm/versions/node/v22.9.0/bin:$PATH"`

## Architecture

**Stack**: Next.js 16 App Router · TypeScript · Tailwind v4 · fast-xml-parser
**Storage**: Browser `localStorage` + JSON file export/import (no database, no auth)
**Data source**: DraCor API (`https://dracor.org/api/v1/corpora/shake/plays/{slug}/tei`) — same Folger TEI data, cleaner endpoint

## Key Files

| Path | Purpose |
|------|---------|
| `lib/folger/FolgerClient.ts` | Fetches TEI XML from DraCor; `PLAYS` array maps `id` → `slug` |
| `lib/folger/TeiParser.ts` | Parses TEI XML into `Play` domain objects; sets `stageType` + `isSong` on SDs; extracts `castList` names verbatim from TEI (handles both `<role><name>` and bare `<role>` formats); stores raw `<speaker>` text as `Speech.speakerTag`; `extractAllTextSkippingStages` skips inline `<stage>` children for spoken text extraction; `Line.stageNote` captures inline delivery directions from `<stage>` inside `<l>` or `<p>/<lb>` prose |
| `lib/cuts/PropsEngine.ts` | Scans `StageDirection.text` for prop keywords; returns `PropMention[]` used by the Integrity tab Props section |
| `lib/folger/PlayCache.ts` | LRU in-memory cache for parsed plays (server-side) |
| `lib/cuts/CutEngine.ts` | Pure fn: `(Play, Cut, assignments, actors)` → `LineCounts` + filtered units |
| `lib/cuts/StageTimeEngine.ts` | Computes per-character on-stage time from entrance/exit SDs; returns cut vs original minutes |
| `lib/cuts/CueScriptBuilder.ts` | Builds per-actor cue scripts from cut play |
| `lib/cuts/CastingUtils.ts` | `suggestMinimumCast` (Welsh–Powell graph colouring) + `buildForbiddenPairs` (quick-change-aware doubling constraints) |
| `lib/cuts/QuickChangeEngine.ts` | `computeQuickChanges` — walks scenes to find actor quick-changes below the threshold; warnings include act/scene/line locations |
| `lib/project/ProjectStore.tsx` | React context + localStorage persistence; all project mutations |
| `lib/project/projectUtils.ts` | `generateId()`, `defaultColors` (reds + greens excluded — reserved for UI indicators), `resolveCharacterName(charId, aliases, castList)` |
| `lib/project/projectIO.ts` | JSON export (file download) and import (file picker + Zod validation); `exportProject` / `importProject` |
| `app/api/play/[playId]/route.ts` | GET: fetch + parse + cache a play; returns `Play` JSON |
| `app/api/plays/route.ts` | GET: returns `PLAYS` listing |

## Data Models (types/)

### `Play` (parsed from TEI, never stored)
- `acts[]` → `scenes[]` → `units[]` (Speech | StageDirection)
- `Act`: `id`, `number`, `title`, `scenes[]`, `divType?` (`"prologue"|"epilogue"|"induction"` — undefined means a regular act)
- `Scene`: `id`, `number`, `title`, `units[]`, `sceneType?` (`"chorus"|"epilogue"|"prologue"` — undefined means a regular scene)
- `Speech`: `characterId` (e.g. `#Hamlet_Ham`), `characterName`, `speakerTag` (raw `<speaker>` tag text verbatim, e.g. `"GHOST OF HAMLET'S FATHER"`), `deliveryNote?` (pre-speech delivery qualifier, e.g. `"[within]"`, shown inline after the character name), `lines[]`, `lineCount`
- `StageDirection`: `id`, `text`, `characters[]`, `stageType?` (`"entrance"|"exit"|"business"|"delivery"` — `"dumbshow"` in TEI is normalised to `"business"` with `isDance: true`), `isSong?`, `isDance?`
- `Line`: `id`, `ftln` (Folger through-line number), `text`, `isSong?`, `poemIndent?` (B-rhyme in a poem stanza → indented), `partIndent?` (part="F"/part="I"+prev — shared verse fragment → proportionally indented), `partIndentChars?` (char count of preceding parts, drives indent width), `stageNote?` (inline `<stage type="delivery">` text preceding the spoken content on that line, e.g. `"To Helen."` in AWW 1.1.80; rendered as italic muted `[text]` before the line; not part of editable spoken text)

### `Project` (stored as JSON in localStorage)
- `name?: string` — optional display name (e.g. "2026 Production"); distinct from `playTitle`
- `cuts[]`: each cut has:
  - `cutMap: Record<unitId, "cut"|"kept">` — speech-level cuts
  - `lineCutMap?: Record<lineId, "cut"|"kept">` — individual line cuts within speeches
  - `stageDirectionEdits?: Record<sdId, string[]>` — full override of character list per SD
  - `sceneOrder?: string[]` — custom scene ordering (for reordering scenes)
  - `speechEdits?: Record<unitId, SpeechEdit>` — word-level track-changes edits
  - `speechReassignments?: Record<unitId, characterId>` — re-attributes a speech to a different character; afterCut counts route to the new character, original counts stay on the original
  - `characterAliases?: Record<characterId, string>` — display-name overrides per character for this cut; never alters underlying Play data; propagated to all render sites (script, line counts, matrix, cue scripts)
  - `characterLinks?: Array<[charIdA, charIdB]>` — director-specified pairs that must share the same actor; IDs stored in sorted order for stable equality checks; fed into Suggest as `sameActorPairs` overrides, which take precedence over quick-change forbidden pairs; per-cut, cloned when duplicating a cut
  - `stageDurations?: Record<stageId | speechId, number>` — director-specified extra minutes for song/dance SDs or speeches; added to total and scene running times but not attributed to individual characters
  - `pauses?: Record<"after:{sceneId}", { name: string; minutes: number }>` — named intermissions inserted between scenes; duration adds to total running time
  - `insertedSDs?: Record<insertedSDId, InsertedSD>` — director-created song/dance SDs inserted after any speech or inserted SD; each has `text`, `characters[]`, `isSong?`, `isDance?`, `afterUnitId`; rendered with green left border
  - `sdFlagOverrides?: Record<sdId, { isSong?: boolean; isDance?: boolean }>` — per-SD song/dance flag overrides; toggles TEI `isSong`/`isDance` per production needs
- `actors[]`: name + color hex
- `assignments[]`: `characterId` → `actorId` (double-casting: one actor → many characters)
- `settings?: { wordsPerMinute: number; quickChangeThresholdMinutes?: number }` — used for stage time and quick-change calculations
- Export file extension: `.sss.json`

## TEI Parsing Notes

The DraCor TEI format uses:
- `<l xml:id="ftln-N">` for verse lines
- `<p xml:id="p-N"><lb xml:id="ftln-N"/>text</p>` for prose (multiple `<lb>` per `<p>` = multiple lines)
- `<lg xml:id="stz-N">` for stanzas/songs (contains `<l>` children)
- `<l part="I|F" prev="#ftln-N">` — shared verse lines split across speakers; `part="I"` (no prev) starts the chain, `part="I"+prev` marks middle fragments, `part="F"` closes it; `partIndentChars` stores the cumulative preceding-text length for proportional indentation
- `<stage>` elements inside `<sp>`: pre-first-line stages (e.g. `<stage type="location">, within</stage>`) become `Speech.deliveryNote`; stages that appear between lines split the speech into multiple `Speech` + `StageDirection` units; `<stage>` elements **inside** `<l>` verse or `<p>/<lb>` prose (e.g. `<stage type="delivery">To Helen.</stage>`) become `Line.stageNote` — extracted separately via `extractAllTextSkippingStages` so the stage text does not appear in `line.text`
- Top-level body divs: `act`, `prologue`, `epilogue`, `induction` — all collected in document order; `divType` on `Act` distinguishes non-act structural divs
- Scene-level div types: `scene`, `chorus`, `epilogue`, `prologue` — `sceneType` on `Scene` distinguishes non-scene units
- `<div type="act" n="1">` and `<div type="scene" n="1">`
- `<sp who="#CharId_PlayId">` for speeches
- `<castItem sameAs="#CharId_PlayId">` for cast list
- `<stage type="entrance|exit|...">` for stage directions (type drives on-stage tracking)
- `<stage type="dumbshow">` — silent mime/action sequences (e.g. The Mousetrap in *Hamlet*); parsed with `isDance: true` and `stageType` normalised to `"business"` so they display with the ⊛ cyan indicator and accept duration overrides
- `<gap>` — editorial placeholder for missing/unclear text in the source Folger edition; rendered as `[…]` (occurs ~4 times across Hamlet, All's Well, Titus Andronicus)

`fast-xml-parser` is configured with `preserveOrder: true` so elements maintain document order.

**Two `<castItem>` formats** handled by the parser:
- `<role><name>King Claudius</name></role>` — named characters (has `<name>` child)
- `<role>A Lord</role>` — minor characters (text directly in `<role>`, no `<name>` child)
TEI-authored names are used verbatim; `normalizeCharacterName` is only applied to the ID-stem as a last-resort fallback when no TEI name exists.

**Known DraCor data gaps**: Some exit SDs are missing characters (e.g. "All but Hamlet exit" may omit Voltemand/Cornelius). Use the SD character editor to fix per-production.

**FDT → DraCor normalization**: The raw Folger Digital Texts TEI uses `<div1>`/`<div2>`, `<milestone unit="ftln">`, `<ab>`, and word-level `<w>`/`<c>`/`<pc>` tags. DraCor normalizes all of this to TEI P5 (`<div type="act|scene">`, `<l xml:id="ftln-N">`, `<p>/<lb>`). Elements present in raw FDT but **absent from DraCor corpus files** (verified across all 38 plays): `<sound>`, `<foreign>`, `<hi>`, `<app>`, `<fw>`, `<stage type="modifier">`. The `<stage type="dumbshow">` type **is** present (13 plays) and handled as described above.

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
    CastingManager.tsx      ← builds simultaneous-pairs map, computes conflict warnings (with act/scene/line locations); actor inline rename + delete-with-confirmation; "Suggest minimum cast" button + Apply/Dismiss panel; ? help button with algorithm explanation; passes line/word/time counts + alias + link props to CharacterCard
    CharacterCard.tsx       ← actor dropdown with ⚠ prefix for conflicting actors; shows cut line/word/time counts inline; alias editing (pencil icon → inline input, original name shown muted); character link pills (sky-blue) + "link with…" select
  Dashboard/
    SceneDashboard.tsx      ← orchestrator; builds charSceneMatrix + stageTime; metric/tab state
    SceneList.tsx           ← drag-reorder scene list; pause insertion between scenes
    DashboardMatrix.tsx     ← character × scene matrix; actor-grouped headers; totals; Table/Chart
    RehearsalGroupings.tsx  ← By Actor scene breakdown + Suggested Rehearsal Blocks (side-by-side)
    IntegrityChecks.tsx     ← Integrity tab: side-by-side no-exit / no-entrance warning cards; Name Diagnostics collapsible table (Character ID · Folger Cast List · Folger Speaker Name · ID-Normalized · SD References · Resolved)
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

### Quick-change warnings (`lib/cuts/QuickChangeEngine.ts`)

`computeQuickChanges` detects actor turnaround gaps below `settings.quickChangeThresholdMinutes` (default 2.0 min). Each `QuickChangeWarning` carries:
- `exitSceneId` / `enterSceneId` — which scenes contain the costume change
- `exitActNum`, `exitSceneNum`, `exitApproxLine` — 1-based act and scene numbers, plus scene-relative original-text line count at point of exit
- `enterActNum`, `enterSceneNum`, `enterApproxLine` — same for the entrance
- `gapMinutes` — gap between exit and entrance in estimated minutes

Displayed in `CastingManager` as a two-row card per warning:
```
[actor name] exits as [Char A] → enters as [Char B]  (X.Xm gap)
  Act 1, scene 2: ~l.47 → Act 1, scene 4: ~l.0  (original lines)
```

`exitApproxLine` counts all speech `lineCount`s in the scene up to that point regardless of cut status, so the number matches the uncut script for physical reference.

## Character Aliases (`Cut.characterAliases`)

Per-cut display-name overrides stored as `Record<characterId, string>`. Key behaviours:
- **Never alters `Play` data** — the TEI character ID and cast-list name are untouched
- **Propagated everywhere** via `resolveCharacterName(charId, aliases, castList)` in `lib/project/projectUtils.ts`; falls back to `characterIdToName(charId)` if no cast entry
- **Alias editing in CharacterCard**: hover the character name → pencil icon → inline `<input>` → Enter/blur to confirm; original TEI name shown in muted text below when an alias is set
- **Cue script**: `buildCueScript` accepts `characterAliases` and uses resolved names for character headers and speaker labels
- **Cloned with the cut**: duplicating a cut copies `characterAliases`; aliases are independent per cut
- Cleared by setting `alias = null` (key is deleted from the map)

## Character Links (`Cut.characterLinks`)

Director-specified same-actor pairs stored as `Array<[charIdA, charIdB]>` (IDs in lexicographic order for stable equality). Key behaviours:
- **UI**: sky-blue pills below the line-count area on each CharacterCard; `+ link` button opens an inline `<select>` of unlinked characters; × button removes the link; link is bidirectional (both cards show the pill)
- **Store action**: `TOGGLE_CHARACTER_LINK` adds the sorted pair if absent, removes it if present
- **Suggest integration**: links feed into `handleSuggest` as additional `sameActorPairs`, which union-find merges before graph colouring — this overrides any quick-change forbidden-pair constraint between the linked characters, encoding the director's dramaturgical decision
- **Help text**: `?` button in CastingManager header shows a panel explaining the graph-colouring algorithm, quick-change threshold, and how links work

## Minimum Cast Suggestion (`lib/cuts/CastingUtils.ts`)

`suggestMinimumCast(speakingCharIds, simultaneousMap, options)` finds the minimum actor count using Welsh–Powell greedy graph colouring:

1. **`buildForbiddenPairs(play, cut, settings)`** — walks the cut play tracking cumulative minutes; any actor pair with gap < `quickChangeThresholdMinutes` is added to the forbidden set
2. **Sort by degree × line count** — characters sorted descending by simultaneous-pair count (most constrained first), tie-broken by line count
3. **Union-find for same-actor merges** — `sameActorPairs` (from existing assignments + character links) are merged into groups; each group is coloured as a unit
4. **Greedy colouring** — each character (or merged group) is assigned the lowest-indexed slot not used by any simultaneous-on-stage neighbour or forbidden-pair neighbour
5. **"Prefer least-loaded" slot** — among valid slots, picks the one with the fewest total lines to balance the cast

Result displayed in CastingManager as a preview panel: "Suggested minimum: N actors" → grouped character lists → **Apply** (creates `Actor` objects with `defaultColors`, dispatches `BULK_SET_CAST`) / **Dismiss**.

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

**Name Diagnostics** — collapsible developer/dramaturg table at the bottom of the Integrity tab. Shows every character's name across all sources side by side: TEI ID, Folger Cast List name, raw `<speaker>` tag text, ID-normalized fallback, SD References (name tokens + pronouns extracted from SD prose, with act/scene/`~l.N` hover tooltips per token), and the resolved display name. SD token extraction filters possessive qualifiers (`"Gravedigger"` excluded from `"Gravedigger's companion"`) and qualified-ID context words (`"Fortinbras"` excluded from `SOLDIERS.FORTINBRAS`). Sky-blue rows have an active alias for the current cut.

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
- **Group 10**: Character aliases (`characterAliases` per-cut, propagated to all render sites including cue scripts); suggest minimum cast (Welsh–Powell graph colouring, quick-change-aware forbidden pairs, union-find for same-actor merges, Apply/Dismiss panel); character links (`characterLinks` per-cut, sky-blue pills on CharacterCard, feed into Suggest as hard same-actor constraints); quick-change warning locations (act/scene/original-line for both exit and entrance)
- **Parser + Diagnostics**: TEI cast list parser fixes — bare `<role>` fallback, removed length-heuristic, verbatim TEI names; `Speech.speakerTag` field (raw `<speaker>` text); Name Diagnostics table in Integrity tab (SD reference token extraction with possessive/qualifier filtering, CSS hover tooltips for act/scene/line locations)

- **Group 11**: "Save / Export ▾" nav dropdown (save JSON or export HTML); dynamic self-contained HTML mini-app export (pre-rendered data + embedded vanilla JS; three view modes Clean/Standard/Diff; character filter sidebar grouped by actor; sticky topbar with mode switcher, scene jump, print button; `@page` margin boxes baked in at export time); PDF cue scripts with `@page` headers (play title/cut name top-left, actor/characters top-right) and footer (page number + timestamp + tool attribution); white background on all print views

- **Group 12**: Settings modal (⚙ gear in nav → project name, WPM, quick-change threshold); copyright/attribution footer (home page) citing DraCor + Folger Editions CC BY-SA 4.0; `SECURITY.md` (allowlist API, localStorage-only, 0 `npm audit` vulns after `npm audit fix`); The Two Noble Kinsmen — not in DraCor corpus, local Folger TEI normalizer (`scripts/normalize-folger-tei.py`) converts raw Folger word-tokenized XML to DraCor-compatible format; mirrored at `shakedracor/tei/the-two-noble-kinsmen.xml`; `noLocal` flag removed; TNK loads with 3,291 lines + 42 cast members

- **Group 13**: Dark mode (`ThemeContext` light/dark/auto, `sss_theme` localStorage key, flat sun/moon/monitor SVG toggle); settings modal expanded — project name, WPM slider with presets (Slow/Amateur/Experienced/Professional), quick-change threshold, theme toggle, Save/Export all in one gear panel; nav decluttered — Cut Selector and Save/Export dropdown moved into settings, scissors-only logo with hover-reveal Shakespeare-head swap + wiggle + "ShakesScriptScissors" label slide-in (overlay, no layout shift); flat SVG icons for all nav links + gear; project title as dashboard link with always-visible DashboardIcon; Dashboard removed from nav links; easter egg: Shakespeare face animation (speech bubble left, quill-circle right) fires on cut-mode exit ("Scratch it out!") and on scene restore-all ("Scratch it back in!"); contrast audit — `dark:text-stone-500` → `dark:text-stone-400` globally for WCAG AA compliance

- **Group 14**: Responsive design — tablet landscape (1024px = `lg:`) as primary breakpoint, mobile (375px) as secondary; nav bar collapses ✂ Cut mode + scene jump behind `☰` hamburger dropdown below `lg:`, nav link labels hide below `md:`, project title responsive `max-w` with truncation; `LineCountPanel` sidebar `hidden lg:block` on desktop, bottom drawer below `lg:` toggled by floating `≡ Info` pill (visible on all screen sizes including mobile); script editor full-width on tablet; `SceneDashboard` header `flex-wrap` + subtabs `overflow-x-auto`; `CastingManager` character grid adds `xl:grid-cols-3`; all via Tailwind `md:`/`lg:`/`xl:` breakpoints + minimal `useState` for drawer toggle

- **Group 15 — Script Features**
  - SD "sync exits" button (renamed from "auto-fill"): pre-fills exit SD character list from on-stage tracking; button label is "⟳ sync exits"
  - Song & dance highlighting: ♪ violet/italic for sung lines, ⊛ cyan for dance SDs; `+ time` inline duration editor on song/dance SDs; durations stored in `Cut.stageDurations` and added to show running time
  - Epilogues, prologues, inductions, and choruses parsed from TEI: `Act.divType`, `Scene.sceneType`; `PROLOGUE`/`EPILOGUE`/`INDUCTION`/`CHORUS` rendered in script and scene jumper (`pr:1`, `ep:1`, `in:1`, `3:ch`)
  - Scene jumper: hidden scenes disabled/dimmed when character/actor filter active; non-standard scene labels (`pr`, `ep`, `ch`, `in`) passed through
  - Poem B-rhyme indentation: odd-position lines in `<lg>` poem stanzas indented per Folger layout
  - Split verse line (shared-line) proportional indentation: `part="F"` and `part="I"+prev=` lines indented by cumulative preceding-part character count in `ch` units
  - Mid-speech stage directions: `<stage>` elements inside `<sp>` split the speech into Speech+StageDirection segments (e.g. "Enter Macbeth with bloody daggers." mid-Lady-Macbeth)
  - Pre-speech delivery notes: `<stage type="location">` before first line becomes `Speech.deliveryNote`, shown as italic `[within]` after the character name
  - **Split speech**: `Cut.speechSplits?: Record<unitId, { splitAtLineIndex: number; newCharacterId?: string }>`. Hover a line boundary → "✂ split" button; a "⊙ merge" button restores. `expandUtils.ts` expands splits into `:s1`/`:s2` virtual units before cut engine runs. Part 2 can optionally be reassigned to a different character at split time.
  - **Insert text**: `Cut.insertions?: Record<insertionId, Insertion>`. Freestyle mode (plain text + character from cast) via `InsertionModal`; inserted units appear after a target speech with green left border + "inserted" badge. Counts included in line/word totals and cue scripts. `InsertionBlock.tsx` handles rendering in all view modes.
  - **Edit mode toolbar**: red toolbar replaces nav bar when any edit tool is active (Cut, Reassign, Split, Insert, Word Edit, Restore); undo/redo (20-step history via `UNDO`/`REDO` store actions); `? ` toggle button shows per-tool help bubble (persists across tool switches, fixed-position over toolbar); toolbar row is `overflow-x-auto` so Done button stays accessible on narrow viewports; inactive undo/redo buttons render as dimmed white text
  - **Word-level edits in edit mode**: "Word Edit" tool activates click-to-select word edits; `BULK_ADD_EDIT_OPS` accumulates cut and insert ops in `speechEdits[unitId].ops`; `REMOVE_EDIT_OP` removes a single op by index; inserted words show a `×` hover button to delete, or click to edit via pre-filled popover; leading-space logic ensures correct word spacing when inserting at end of line

- **Group 15f — Edit mode polish**
  - **Clean view overhaul**: inserted words render as plain `<span>` (no green styling); reassigned speeches show only the new character name (no strikethrough diff); split indicators and "split" badge hidden; "cont." label hidden; entire character-name header row hidden when `isClean && isContinuation` in both `SpeechBlock` and `InsertionBlock`
  - **Diff view**: right column uses `origUnitsByScene` (raw unexpanded play units) so insertions and split Part 2 rows are absent on the original side; Part 1 row shows the full pre-split original speech on the right; Part 2 (`:s2`) row right column is a blank cell ("merged cell" effect); insertions render as `InsertionBlock` (green) on the left, "inserted" muted label on the right
  - **Cont. bug fixes**: `SceneBlock` cont. loop skips `:s2` units (already handled by split block) and skips insertion units in the speech branch (they are handled via `insAfterMap` on the preceding unit) — prevents false "cont." on both split-reassigned Part 2 and insertions
  - **Cue script improvements**: non-entrance/exit SDs that fall while `inActorBlock` are now included (e.g. "Knock." between Lady Macbeth's speeches); `speechReassignments` respected for both actor ownership and speaker label in cue script output
  - **TeiParser fix**: `extractAllText` now inserts a space between adjacent text runs from different elements, fixing cases like "Thunder.Enter the three Witches." → "Thunder. Enter the three Witches."

- **Group 16**: TEI verification + user docs
  - `<stage type="dumbshow">` normalised to `isDance: true` / `stageType "business"` (13 plays); `<gap>` emits `[…]`; absent DraCor elements documented (`<sound>`, `<foreign>`, `<hi>`, `<app>`, `<fw>`)
  - Edit toolbar `?` overlay: scrollable "How to cut a play" guide section for Cut tool (Malone & Huber attr.)
  - CastingManager `?` panel: third section "About doubling" — Sprague taxonomy, thematic pairs, practical constraints (Gamboa attr.)
  - `docs/GETTING_STARTED.md`, `docs/USER_GUIDE.md`, `docs/FEATURES.md` — non-technical user guides
  - **TeiParser fix**: `parseSpeech` embedded-SD emitter now handles `type="mixed"` by expanding to sub-stages (same logic as `parseSceneUnits`), and handles `type="dumbshow"` with `isDance: true`; fixes mid-speech mixed SDs (e.g. Hamlet 2.2 `stg-1626`) showing combined text with no characters

- **Group 18a**: Bugs + quick UI fixes — cut tool with inserted words (`data-inserted` attr + `resolveSelection.ts` skip); login page dark mode; cut name shown in nav; version + git date in footer, copyright in Settings modal; Default (135) WPM preset; quick-change threshold removed from CastingManager (read-only, points to Settings); dashboard nav active style; `@ Xwpm` appended to running time displays; dashboard header subtitle (acts · scenes · characters · actors); license switched to CC BY-NC-SA 4.0

- **Group 18b** (v5.18): Word-edit insert stability — `applyEditsToLine` now uses a deterministic sort (`cut-start < cut-end < insert` at equal positions) and **splits cuts when an insert falls inside a cut range**, so an inserted word always stays visible in its original position between surrounding cuts; login page theme toggle (light/dark/auto, same as home page); nav draft/cut name always shown regardless of cut count or project name; WPM presets reordered Slow(100) → Amateur(130) → Default(135) → Experienced(150) → Professional(180); `≡ Info` drawer button visible on all screen sizes below `lg:` (removed `hidden md:block`); version bump to v5.18

- **Group 18b (dashboard features)**: Chart tab — `DashboardMatrix` now accepts `viewType` prop from parent; `SceneDashboard` adds a 5th "Chart" tab that renders a sorted bar chart while the Matrix tab shows the table only (no internal toggle). Sticky matrix headers — actor row `sticky top-0 z-30`, character row `sticky top-7 z-20`, corner cell `sticky left-0 top-0 z-40`, scrollable container `max-h-[70vh] overflow-auto`. Row total fix — `SceneDashboard` computes `sceneTimings` (words/wpm per scene) and passes to `DashboardMatrix`; `getRowTotal` in Time metric uses scene duration directly instead of summing per-character stage times (which double-counted simultaneous actors). Clean mode — `ActBlock`, `SceneBlock`, `LineCountPanel` read `useViewMode()` and suppress `/ original` denominators and `−X%` deltas; passes `hideOriginal={isClean}` to `CharacterRow` and `ActorRow`. Matrix click improvements — `filterCharIds` is now a `Set<string>` for OR-based multi-select; `handleActorHeaderClick` toggles all actor chars at once; `handleRowLabelClick` toggles a scene column filter; `?` help tooltip explains filter interactions.

- **Group 18b (dashboard + rehearsal)**: Rehearsal Blocks overhauled — complete-linkage hierarchical clustering with Jaccard similarity (threshold 0.33) on character/actor sets; scenes split into sub-scenes at major entrances (≥2 chars entering after dialogue has begun); "★ Full company" label only when ALL assigned actors are called; by-character/by-actor toggle (actor mode maps char IDs → actor IDs before Jaccard, collapsing doubling); onstage non-speakers included in sub-scene char sets via entrance/exit SD tracking; actor chips show characters they play in that block; large full-cast scenes (≥10 min, ≥80% of max speaking-character count) isolated as their own blocks regardless of clustering; `?` help button explains the algorithm; min/max block duration editable in Settings (default 5–60 min). CastingManager help text now links directly to the Rehearsal tab (`/projects/[id]/dashboard?tab=rehearsal`). Login page dark mode toggle repositioned to `fixed top-4 right-4` — same location as the home page. Scene list: song item label shows first **sung** line, not first prose preamble line. Song+dance SDs (matching both `\bsong\b` and `\bdance\b` regexes) now show **♪⊛** with ♪ in violet and ⊛ in cyan; scene list pill gets a diagonal violet/cyan stripe background; `+ time` tooltip reads "song & dance". Clean mode: speech block headers no longer show `/ original` count — only the cut count is displayed.

- **Group 18c — Casting improvements**: Six UX improvements to the Casting and Rehearsal pages. **#16 Suggest Replace/Extend** — when actors already exist, Suggest now shows a choice modal: _Replace_ clears the cast and suggests from scratch (dispatches `BULK_SET_CAST`); _Extend_ suggests only unassigned characters and appends them starting from the next actor number (new `EXTEND_CAST` store action). **#17 Actor stats + min stage time** — each actor chip shows `N lines · M words · X min` below the character names; chips with stage time below the configurable threshold (`minActorStageTimeMinutes`, default 10, new in `ProjectSettings`) get an amber border + ⚠ badge; the threshold is set in a new Settings field. **#18 Sort actors** — Sort dropdown (A–Z / Lines / Words / Stage Time / First Appearance) appears in the Actors section header when 2+ actors exist; First Appearance walks play units to find each actor's earliest speech position. **#20 Script nav dropdown everywhere** — `NavScriptMenu` now renders for the Script link on all pages (not just the script page); clicking a mode option calls `router.push()` to navigate to the script page AND sets the view mode in one click. **#21 Full-cast banner** — dismissible green banner above the Characters grid once every active speaking character is assigned, linking to the Rehearsal tab. **#30 Collapsible actors + search in Rehearsal** — "By Actor" section now has a search input (filters by actor name or any assigned character name) and a ▾/▸ collapse toggle per actor row.

- **Group 19a — 1602 Renaissance theme**: Fourth theme mode added to the light/dark/auto picker. `Theme` type extended to `"light" | "dark" | "auto" | "1602"`; `ThemeContext` reads/writes `sss_theme` localStorage key on mount and `setTheme`; separate `useEffect` adds/removes `renaissance` class on `<html>` (distinct from `dark`). Google Fonts (`IM Fell English`, `IM Fell English SC`, `UnifrakturMaguntia`) loaded via `<link>` in `app/layout.tsx`. `globals.css` adds `@custom-variant renaissance` + a comprehensive CSS block: parchment Tailwind color-token overrides (`--color-stone-*`, `--color-amber-*`), textured linen background gradient, `border-radius: 0 !important` everywhere, woodcut-brown `#6b3f1e` borders/scrollbar, IM Fell English SC headings and buttons, UnifrakturMaguntia nav, double-rule `<hr>`/`.border-t` dividers, `❧` ornament before `.border-t`, sepia strikethrough colour, justified text. `ThemeToggle` and `SettingsModal` each add a quill SVG icon and `"1602"` entry. Files: `lib/ui/ThemeContext.tsx`, `app/globals.css`, `app/layout.tsx`, `components/ThemeToggle.tsx`, `components/SettingsModal/SettingsModal.tsx`.

- **Group 19 — Song/dance tool, sync entrances, props, polish**
  - **#4 Edit SDs tool** (renamed from "SD Chars"): hover strip between units opens `InsertedSDModal` to insert a new song/dance SD; inserted SDs stored in `Cut.insertedSDs`, rendered by `InsertedSDBlock.tsx` with green left border; song/dance flag toggle on existing SDs via `Cut.sdFlagOverrides`; insert zones interleaved before and after each inserted SD so you can insert between two inserted SDs; edit/remove buttons on `InsertedSDBlock` appear only in Edit SDs mode
  - **#6 Sync entrances**: ⟳ sync entrances button on entrance SDs; pre-fills character list from `getExpectedEntrantsAtUnit` (walks forward for later exits, backward for prior entrances — mirrors sync exits logic); `lib/cuts/StageTimeEngine.ts`
  - **#2 Props list**: `lib/cuts/PropsEngine.ts` scans `StageDirection.text` for a curated prop keyword list; new "Props" collapsible section in the Integrity tab (`IntegrityChecks.tsx`); returns `{ prop, sdId, sceneId, actNum, sceneNum }[]`
  - **Inline delivery stage notes**: `Line.stageNote` — `<stage>` elements inside `<l>` or `<p>/<lb>` prose (e.g. `<stage type="delivery">To Helen.</stage>` in AWW 1.1.80) are extracted into `stageNote` and not included in `line.text`; `extractAllTextSkippingStages` added to `TeiParser.ts`; rendered as italic muted `[text]` before the line in `SpeechBlock.tsx`
  - **Mobile hamburger**: clicking Edit in the hamburger dropdown closes the menu (`onActivated` callback in `NavEditModeButton`)
  - **Info pill**: `≡ Info` pill moved to `bottom-16 left-4` (was `bottom-4 right-4`) to avoid overlap with Next.js dev tools badge

---

### Group 20 — Self-contained improvements

- **#15 Compare two cuts** — Diff view dropdown to pick "original" side (any cut version, not just uncut TEI)
- **#25 Act/scene descriptions** — short editable description field per act or scene
- **#33 Fix "X" character listings** — investigate TEI `#X_Play` IDs surfacing as bare "X"

### Group 21 — Export enhancements

- **#26 ZIP cue scripts as PDFs** — server-side PDF generation, download as ZIP
- **#27 Export to Word (.docx)** — docx library integration with one-way-conversion warning

### Group 22 — Heavy structural features

- **#7 SD rewrite** — two-layer model (cosmetic text + character list); new `sdTextEdits?: Record<sdId, string>` in Cut
- **#24 Scene subdivide** — split a scene into A/B/C sub-parts; new data model for scene parts

### Group 23 — Word import

- **#34 Word import** — parse a marked-up Word doc back into cuts (highly complex)

---

### Deferred / N/A
- Google Drive backup integration
- GUI/installer for non-technical users (would require Electron or web installer wizard)
- **#31 Tableau-style visualization** — character presence / stage time chart using D3 or Recharts
