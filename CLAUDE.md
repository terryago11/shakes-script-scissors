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
| `lib/project/projectUtils.ts` | `generateId()`, `defaultColors` (reds + greens excluded — reserved for UI indicators), `resolveCharacterName(charId, aliases, castList)`, `getEffectiveSceneOrder(play, cut)` (returns custom sceneOrder with any missing scenes appended — use this instead of `cut.sceneOrder ?? defaultOrder` in all engines) |
| `lib/project/projectIO.ts` | JSON export (file download) and import (file picker + Zod validation); `exportProject` / `importProject`. **When adding a new field to `Cut` in `types/project.ts`, also add it to `CutSchema` here — fields not in the schema are silently stripped on import.** |
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
  - `sdTextEdits?: Record<sdId, string>` — cosmetic prose rewrites for stage directions; display-only (no effect on on-stage tracking or stage time); edited SDs show green left border + "edited" badge in standard/diff modes, plain in clean mode; ↩ restore text available in Restore tool; propagated to cue scripts and HTML/Word exports
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
    PresenceChart.tsx       ← Tableau-style presence chart (Chart tab → Presence mode); two panels: play-level FTLN swimlane (Panel 1) + scene-level proportional strips (Panel 2); character and scene click-filters cross-linked between panels
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

---

See [ROADMAP.md](./ROADMAP.md) for planned and deferred features.

