# Features Reference — ShakesScriptScissors

A complete list of capabilities for power users. For a full walkthrough, see the [User Guide](USER_GUIDE.md).

---

## Desktop App

| Feature | Details |
|---------|---------|
| **Native installer** | macOS DMG (arm64 + x64), Windows NSIS installer, Linux AppImage |
| **No Node.js required** | The app runs a bundled Next.js server locally; no terminal setup needed |
| **No internet after install** | Play texts are bundled; works fully offline |
| **Auto-update** | Checks for new releases on startup; prompts Restart / Later when an update downloads |
| **Auth disabled** | Desktop builds skip the login screen; the play selector opens directly |

→ [Download the latest release](https://github.com/terryago11/shakes-script-scissors/releases/latest)

---

## Play Library

| Feature | Details |
|---------|---------|
| 38 Shakespeare plays | 37 from DraCor (Folger edition via TEI P5); *The Two Noble Kinsmen* from the Folger Digital Texts directly |
| Loads on demand | Play text fetched from the DraCor API; no local installation required |
| Full text | All acts, scenes, speeches, stage directions, prologues, epilogues, inductions, and choruses |
| Folger line numbers | Each line carries a Folger Through Line Number (FTLN) for reference |

---

## Cutting

| Feature | Details |
|---------|---------|
| **Word-level cuts** | Drag across any text — from a single word to a whole speech — to mark it as cut (red strikethrough) |
| **Word insertions** | W Edit mode: click between words to insert new text; inserted words stay visible and uncut even when surrounding words are subsequently cut |
| **Speech reassignment** | Reassign a speech to a different character; original counts stay on original character |
| **Speech splitting** | Split a speech at any line boundary; Part 2 can be reassigned at split time |
| **Text insertions** | Insert new speeches after any existing speech; shown with green border |
| **Stage direction cuts** | Stage directions are cuttable; entrance/exit cuts affect on-stage tracking |
| **SD character editing** | Add or remove individual characters from any stage direction |
| **SD sync exits** | ⟳ sync exits pre-fills exit SDs from on-stage tracking |
| **SD sync entrances** | ⟳ sync entrances pre-fills an entrance SD's character list from on-stage tracking (mirrors sync exits logic) |
| **Inline stage notes** | `<stage>` elements inside a verse line or prose line (e.g. `[To Helen.]`, `[To Orlando.]`) are expanded at render time into a proper **StageDirection block** between speech parts in correct reading order (before-text → SD → after-text); the continuation is indented to show it shares the verse line |
| **Insert song/dance SD** | Edit SDs tool: hover strip between any two units → insert a new song/dance stage direction with custom text and characters |
| **Song/dance flag toggle** | Edit SDs tool: toggle the ♪ or ⊛ flag on any existing SD per production needs |
| **SD text rewrite** | Edit SDs tool: click ✎ on any stage direction to rewrite its prose text; edited SDs show a green left border and "edited" badge in Standard/Diff views, plain in Clean; restore original wording via the Restore tool; propagated to cue scripts and HTML/Word exports |
| **Restore** | Restore individual speeches, stage directions, stage direction text edits, or all cuts in a scene |
| **Undo/Redo** | 20-step undo/redo history within an edit session |
| **Edit navigation** | ← N / total edits → counter in the edit toolbar; click arrows to jump between edits in document order; auto-expands collapsed acts/scenes; pool is per active tool (cut tool shows all cut speeches, insert shows insertions, etc.); Restore tool shows all edits combined |

---

## Line Counts and Running Time

| Feature | Details |
|---------|---------|
| **Lines tab** | Before/after line counts per character and per actor |
| **Words tab** | Before/after word counts per character and per actor |
| **Time tab** | Estimated on-stage time per character and per actor, plus total show duration |
| **Colour coding** | Amber = baseline · Red = cut · Green = addition |
| **Focus-mode scoping** | Line counts scope to a single scene in focus mode |
| **Song/dance durations** | Enter custom durations for ♪/⊛ SDs; added to scene and total time |
| **Song+dance combined** | SDs matching both song and dance (e.g. "Oberon leads the Fairies in song and dance.") show ♪⊛ with violet ♪ and cyan ⊛; scene list pill has a diagonal violet/cyan stripe |
| **Intermissions** | Named pauses between scenes with custom durations |
| **Running line counter** | Scene-relative line numbers every 5 lines; mode-aware (all lines in Standard; kept lines in Clean) |

---

## Cuts (Versions)

| Feature | Details |
|---------|---------|
| **Multiple cuts per project** | Unlimited named versions (e.g. "First pass", "Matinee", "Touring") |
| **Switch between cuts** | ⚙ Settings → Cut selector |
| **Rename** | Double-click any cut name |
| **Duplicate** | Copies all marks, assignments, aliases, and links |
| **Delete** | Requires confirmation |
| **Independent per cut** | Each cut stores its own cuts, line edits, scene order, assignments, aliases, links, durations, and pauses |

---

## View Modes

| Mode | Description |
|------|-------------|
| **Standard** | All text shown; cuts appear with red strikethrough |
| **Clean** | Cut content hidden; only the surviving script is visible |
| **Diff** | Side-by-side: cut version (left) vs original (right) |

All three modes are available in the script editor and in the exported HTML file. The Script nav link is a dropdown on every page — clicking a mode navigates to the script and sets the mode in one click.

---

## Casting and Doubling

| Feature | Details |
|---------|---------|
| **Actor management** | Add, rename, delete actors; each actor gets a unique colour |
| **Actor sort** | Sort the actor list by A–Z, Lines, Words, Stage Time, or First Appearance |
| **Actor stats** | Each actor chip shows aggregated line/word/stage-time counts; chips below the min stage-time threshold get an amber border + ⚠ |
| **Character assignment** | Assign any character to any actor via dropdown |
| **Simultaneous-stage detection** | Built from entrance/exit SDs; conflicts flagged with ⚠ badge and pre-warnings in dropdown |
| **Quick-change warnings** | Flags actor exits/entrances below your threshold (default 2 min) with act/scene/line location |
| **Character aliases** | Per-cut display-name overrides; shown everywhere including cue scripts |
| **Must-double links** | Force two characters to share the same actor (sky-blue pills); feeds into Suggest; amber ⚠ badge when linked characters are assigned to different actors |
| **Compatibility list** | After assigning an actor, expand "Actor can also play" on the card to see ✓ compatible and ⚠ conflicting (quick-change / simultaneous) unassigned characters |
| **Minimum cast suggestion** | Welsh–Powell graph colouring; respects simultaneous constraints, quick-change forbidden pairs, and must-double links |
| **Suggest Replace/Extend** | When actors already exist: Replace clears and re-suggests; Extend suggests only unassigned characters and appends to the existing cast |
| **Apply suggestion** | Creates actors and assignments in one click |
| **Cut counts on cards** | Each character card shows cut line/word/time counts inline |
| **Full-cast banner** | Dismissible green banner appears once all speaking characters are assigned; links to Rehearsal tab |

---

## Scene Dashboard

| Feature | Details |
|---------|---------|
| **Scenes & Pauses tab** | Scene list with cut-only counts; actor presence chips; drag-reorder; pause insertion |
| **Act/Scene production notes** | Editable short text field on each act or scene row in Scenes & Pauses; hover to reveal pencil icon; useful for noting cue calls, staging reminders, prop warnings, etc.; stored per project (not per cut); does not appear in exports |
| **Scene subdivide** | ✂ Split button on each scene row; line-number dialog with 2-line context preview; up to 3 parts (A/B/C) per scene; sub-rows show per-part counts with × remove; inter-part pause slots; amber dividers in all script view modes |
| **Matrix tab** | Character × scene grid (lines/words/time); actor-grouped headers; subdivided scenes expand to A/B/C sub-columns with amber labels; sticky header rows; click column to filter rows (OR multi-select); click actor header to filter by all their chars; click row label to filter columns; `?` explains filter interactions; row and column totals; Time row total shows per-scene duration (not summed character times) |
| **Charts tab** | **Bar mode**: sorted horizontal bar chart of character lines/words/time. **Presence mode**: Tableau-style two-panel visualization — upper panel is a per-character FTLN swimlane (speech bars at through-line positions, act headers + dividers); lower panel shows per-scene proportional strips colored by actor; click a character name or scene label to cross-filter both panels; filters are mutually exclusive |
| **Rehearsal tab** | By-Actor scene breakdown + Suggested Rehearsal Blocks; scenes split into sub-scenes at major entrances then clustered by shared cast (complete-linkage Jaccard); Scenes/Sub-scenes toggle when director splits exist; by-character or by-actor toggle; actor chips show characters per block; full-company scenes isolated; `?` explains the algorithm; filter By Actor list by actor or character name; collapse any actor row to hide scene detail |
| **Props tab** | Algorithmic props list — scans stage directions (reliable) and speech text (heuristic) for prop keywords; stage direction refs shown in grey, dialogue refs in amber; high-confidence (action verb detected) shown with solid border, lower-confidence (demonstrative context only) with dashed border; hover any badge for a 5-word context snippet; large set pieces (bed, table, throne, coffin) excluded from dialogue detection; plurals consolidated; methodology note and legend always visible |
| **Integrity tab** | Four collapsible sections — Entrance/Exit Checks (missing paired entrance/exit SDs with ✓ when clean); Fully Removed Characters (characters with all speeches + entrance/exit SDs cut; ✓ cleanly removed or ⚠ still mentioned in SDs); Name Diagnostics |
| **Metric toggle** | Switch between Lines / Words / Time for all dashboard counts |

---

## Exporting and Importing

| Feature | Details |
|---------|---------|
| **Export HTML** | Self-contained single HTML file; embeds play data + vanilla-JS mini-app; three view modes; character filter; scene jump; print button |
| **Cue scripts — print/PDF** | Per-actor pages with lines, cues (last 2–3 words of preceding speech), and all relevant stage directions; print dialog; `@page` headers (play title, cut name, actor) and footer (page number, timestamp) |
| **Cue scripts — Download All as ZIP** | Server-side PDF generation via `pdfkit`; one PDF per actor; all bundled as a single `.zip` download; same header/footer layout as print |
| **Export full script as Word (.docx)** | From ⚙ Settings → Save & Export; exports the full current-cut script as `.docx` via the `docx` package; **Clean** mode (cuts hidden) or **Standard** mode (cuts struck through in grey, inserted words underlined in green, speech reassignments shown original→new, inserted speeches/SDs in green); one-way conversion — cannot be re-imported |
| **Import cut from Word** *(experimental)* | ⚙ Settings → "Import cut from pre-existing Word doc"; parses `<w:highlight>` annotations from a `.docx` the director marked up themselves; ignores tracked changes, insertions, SDs, and speaker labels; matches highlighted passages to canonical Folger text using speaker-block Jaccard matching + token-span alignment; produces word-level cuts; requires clear Act/Scene headings; hard-rejects if match rate < 40%; amber warning 40–69%; always creates a new cut |

---

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| Project name | *(blank)* | Optional display name for the production |
| Words per minute | 135 | Base rate for running-time calculations; presets: Slow (100) · Amateur (130) · Default (135) · Experienced (150) · Professional (180) |
| Quick-change threshold | 2.0 min | Minimum gap for a safe costume change |
| Rehearsal min block | 5 min | Minimum duration for a suggested rehearsal block |
| Rehearsal max block | 60 min | Maximum duration for a suggested rehearsal block |
| Min actor stage time | 10 min | Actors with less stage time are flagged with ⚠ in the Casting page |
| Theme | Auto | **Light** / **Dark** / **Auto** (follows OS) / **1602** (Renaissance printing-press); toggle (☼ ☽ □ ✒) also available on the login page and home page |

---

## Script Search

| Feature | Details |
|---------|---------|
| **Find in script** | **Cmd+F** (Mac) / **Ctrl+F** (Windows/Linux) or the 🔍 button in the nav bar opens a floating search bar |
| **Scope** | Searches dialogue, character names, stage directions (including SD text rewrites), delivery notes, and inserted stage directions; in Clean mode, cut content is excluded |
| **Navigation** | ↑ ↓ buttons (or Enter / Shift+Enter) step through matches; current match is outlined and scrolled into view |
| **Close** | Esc or × button |

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| **Cmd/Ctrl+F** | Open find-in-script search bar |
| **Esc** | Close search bar / exit edit mode |
| **Cmd/Ctrl+Z** | Undo (in edit mode) |
| **Cmd/Ctrl+Shift+Z** | Redo (in edit mode) |

---

## File Format

Projects are saved as `.sss.json` — a plain JSON file that can be opened with any text editor and version-controlled with git. The file contains no play text (that is always fetched live from DraCor or read from the local cache) — only the cut marks, actor assignments, and settings.

For the full data model (Project and Play type structures), see [CLAUDE.md](../CLAUDE.md#data-models).
