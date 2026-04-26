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

## Electron Desktop App

See [docs/electron.md](docs/electron.md) for commands, conventions, smoke test, and release steps.

## Auth Middleware

The app uses iron-session for password auth (`middleware.ts` at the project root). **Critical convention:**

- The file **must** be named `middleware.ts` (not `proxy.ts` or anything else)
- The exported function **must** be named `middleware` (or `default`)
- Next.js only recognises middleware by filename + export name; a misnamed file/export silently breaks all routes (every page returns 404, including `/login` itself)

If you ever see all routes returning 404 with a redirect loop to `/login`, check that `middleware.ts` exists at the project root with `export async function middleware(...)`. Do **not** rename it to `proxy.ts` — this was tried twice and broke the app both times.

**Disabling auth** (`AUTH_DISABLED=true` in `.env`): the middleware returns `NextResponse.next()` immediately; the `/api/auth/me` and `/api/auth/login` routes return `{ isLoggedIn: true }` / `{ ok: true }` without touching iron-session. `app/login/page.tsx` is a **server component** that calls `redirect("/")` when the flag is set — the client form lives in `app/login/LoginForm.tsx`. Do not add `"use client"` to `page.tsx`; it must stay a server component to read the env var at render time.

## Gotchas

`gotchas.md` at the project root is a **persistent, append-only error log**.

- **When to add**: Any time a mistake is made during a session — wrong assumption, broken convention, silent failure, etc. — add a one-line summary to `gotchas.md`. Never delete entries.
- **When to review**: At the start of every session, when auditing code, when verifying/finishing a feature group, and when troubleshooting unexpected behaviour.

## Updating Play Texts

**DraCor plays (37 of 38)**: Pull the submodule.
```bash
cd shakedracor && git pull origin main && cd ..
git add shakedracor && git commit -m "chore: update DraCor submodule"
```

**The Two Noble Kinsmen (Folger source)**: TNK is not in DraCor — its normalized XML lives in `tei/` in the main repo (not in the shakedracor submodule, which is a read-only external repo). Check for updates at the `folgerSource` URL in `FolgerClient.ts`, then re-run the normalizer.
```bash
curl -L -o /tmp/TNK.zip https://flgr.sh/txtfssTNKxml
unzip -o /tmp/TNK.zip -d /tmp/TNK_extracted
python3 scripts/normalize-folger-tei.py /tmp/TNK_extracted/the-two-noble-kinsmen_XML_FolgerShakespeare/TNK.xml tei/the-two-noble-kinsmen.xml
git add tei/the-two-noble-kinsmen.xml && git commit -m "chore: update TNK from Folger"
```
Both updates should be done together.

## Architecture

**Stack**: Next.js 16 App Router · TypeScript · Tailwind v4 · fast-xml-parser  
**Storage**: Browser `localStorage` + JSON file export/import (no database)  
**Data source**: DraCor API (`https://dracor.org/api/v1/corpora/shake/plays/{slug}/tei`)

## Key Files

| Path | Purpose |
|------|---------|
| `lib/folger/FolgerClient.ts` | Fetches TEI XML from DraCor; `PLAYS` array maps `id` → `slug` |
| `lib/folger/TeiParser.ts` | Parses TEI XML into `Play` domain objects |
| `lib/folger/PlayCache.ts` | LRU in-memory cache for parsed plays (server-side) |
| `lib/cuts/CutEngine.ts` | Pure fn: `(Play, Cut, assignments, actors)` → `LineCounts` + filtered units |
| `lib/cuts/StageTimeEngine.ts` | Per-character on-stage time from entrance/exit SDs |
| `lib/cuts/CueScriptBuilder.ts` | Builds per-actor cue scripts from cut play |
| `lib/cuts/CastingUtils.ts` | `suggestMinimumCast` (Welsh–Powell graph colouring) + `buildForbiddenPairs` |
| `lib/cuts/QuickChangeEngine.ts` | `computeQuickChanges` — actor quick-change warnings with act/scene/line locations |
| `lib/cuts/PropsEngine.ts` | Scans stage directions and speech text for prop keywords; returns `PropReference[]` with `source`, `confidence`, and context fields |
| `lib/project/ProjectStore.tsx` | React context + localStorage persistence; all project mutations |
| `lib/project/projectUtils.ts` | `generateId()`, `defaultColors`, `resolveCharacterName()`, `getEffectiveSceneOrder()` |
| `lib/project/projectIO.ts` | JSON export/import with Zod validation (`exportProject` / `importProject`) |
| `app/api/play/[playId]/route.ts` | GET: fetch + parse + cache a play |
| `app/api/plays/route.ts` | GET: returns `PLAYS` listing |
| `lib/ui/SearchContext.tsx` | React context sharing `searchOpen`/`setSearchOpen` between nav `NavSearchButton` and `ScriptEditor` |
| `lib/ui/EditNavContext.tsx` | React context for edit navigation: ordered `editIndex` (unitIds per active tool's edits), `editIndexIdx`, `editNavGeneration` (increments on navigate to trigger scroll), `setEditIndex`, `navigateEdit` |

**Critical conventions in key files:**
- `projectIO.ts`: When adding a new field to `Cut` in `types/project.ts`, also add it to `CutSchema` — fields not in the schema are silently stripped on import.
- `projectUtils.ts`: Always use `getEffectiveSceneOrder(play, cut)` instead of `cut.sceneOrder ?? defaultOrder` in engines — it appends any missing scenes.
- `defaultColors` excludes reds and greens (reserved for cut/addition UI indicators).
- `TeiParser.ts` `splitProseByLb`: `<q>/<lg>` nodes with `<l>` children inside `<p>` are now routed to `extractLgLines` (flush pending text first). The `<l>` child guard is precise — `type="letter"` bodies with `<lb>` not `<l>` are unaffected.
- `DashboardMatrix.tsx` accepts optional `sceneLineTotals?: Map<string, number>` and `sceneWordTotals?: Map<string, number>` props (passed from `SceneDashboard`). When present, `getRowTotal` and `grandTotal` read from these Maps instead of summing per-character cells (which inflated counts for multi-speaker speeches).

## Data Models

### `Play` (parsed from TEI, never stored)
- `acts[]` → `scenes[]` → `units[]` (`Speech | StageDirection`)
- `Act`: `id`, `number`, `title`, `scenes[]`, `divType?` (`"prologue"|"epilogue"|"induction"`)
- `Scene`: `id`, `number`, `title`, `units[]`, `sceneType?` (`"chorus"|"epilogue"|"prologue"`)
- `Speech`: `characterId`, `characterName`, `speakerTag` (raw `<speaker>` text), `deliveryNote?`, `lines[]`, `lineCount`
- `StageDirection`: `id`, `text`, `characters[]`, `stageType?` (`"entrance"|"exit"|"business"|"delivery"`; dumbshow → `"business"` + `isDance: true`), `isSong?`, `isDance?`
- `Line`: `id`, `ftln`, `text`, `isSong?`, `poemIndent?`, `partIndent?`, `partIndentChars?`, `stageNote?`, `stageNotePre?`
  - `stageNote`: inline `<stage>` text extracted from a verse/prose line; `expandStageNotes` in `expandUtils.ts` splits the speech around it at render time
  - `stageNotePre`: spoken text *before* the inline `<stage>`; when set, `text` holds the after-portion; both halves are preserved in correct reading order

### `Project` (stored in localStorage, exported as `.sss.json`)
- `name?` — display name distinct from `playTitle`
- `cuts[]` — each cut has:
  - `cutMap: Record<unitId, "cut"|"kept">` — speech-level cuts
  - `lineCutMap?: Record<lineId, "cut"|"kept">` — line-level cuts within speeches
  - `stageDirectionEdits?: Record<sdId, string[]>` — character list overrides per SD
  - `sceneOrder?: string[]` — custom scene ordering (use `getEffectiveSceneOrder`, not this directly)
  - `speechEdits?: Record<unitId, SpeechEdit>` — word-level track-changes
  - `speechReassignments?: Record<unitId, characterId>` — afterCut counts route to new char; original counts stay on original
  - `characterAliases?: Record<characterId, string>` — display-name overrides; never alters Play data
  - `characterLinks?: Array<[charIdA, charIdB]>` — must-share-actor pairs; IDs in lexicographic order
  - `stageDurations?: Record<stageId|speechId, number>` — extra minutes for song/dance SDs or speeches
  - `pauses?: Record<"after:{sceneId}", { name: string; minutes: number }>` — named intermissions
  - `insertedSDs?: Record<insertedSDId, InsertedSD>` — director-created SDs after any speech/inserted SD
  - `sdFlagOverrides?: Record<sdId, { isSong?: boolean; isDance?: boolean }>`
  - `sdTextEdits?: Record<sdId, string>` — cosmetic SD prose rewrites (display-only)
- `actors[]`: name + color hex
- `assignments[]`: `characterId` → `actorId`
- `settings?: { wordsPerMinute: number; quickChangeThresholdMinutes?: number }`

## UI Conventions

**Colors**:
| Color | Meaning |
|-------|---------|
| Amber | Baseline / unchanged |
| Red | Cut (lines removed, stage time reduced) |
| Green | Addition (character added to SD, stage time exceeds original) |
| Actor colors | Blue, amber, violet, teal, fuchsia, slate, orange, cyan — **no reds or greens** |

**View modes** (toggled from Script nav dropdown):
- `"standard"` — cuts shown with strikethrough (default)
- `"clean"` — cut speeches/SDs hidden; final script only
- `"diff"` — side-by-side: modified left, original right (`DiffView.tsx`)

---

See [docs/ROADMAP.md](./docs/ROADMAP.md) for planned features and [docs/architecture.md](./docs/architecture.md) for component layout, TEI parsing details, and engine internals.
