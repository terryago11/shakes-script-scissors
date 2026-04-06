# Features Reference — ShakesScriptScissors

A complete list of capabilities for power users. For a full walkthrough, see the [User Guide](USER_GUIDE.md).

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
| **Speech-level cuts** | Drag across any text to mark the whole speech as cut (red strikethrough) |
| **Line-level cuts** | Expand a speech (✂ button on left edge) to toggle individual lines |
| **Word-level cuts** | W Edit mode: click individual words to cut them |
| **Word insertions** | W Edit mode: click between words to insert new text; inserted words stay visible and uncut even when surrounding words are subsequently cut |
| **Speech reassignment** | Reassign a speech to a different character; original counts stay on original character |
| **Speech splitting** | Split a speech at any line boundary; Part 2 can be reassigned at split time |
| **Text insertions** | Insert new speeches after any existing speech; shown with green border |
| **Stage direction cuts** | Stage directions are cuttable; entrance/exit cuts affect on-stage tracking |
| **SD character editing** | Add or remove individual characters from any stage direction |
| **SD sync exits** | ⟳ sync exits pre-fills exit SDs from on-stage tracking |
| **SD sync entrances** | ⟳ sync entrances pre-fills an entrance SD's character list from on-stage tracking (mirrors sync exits logic) |
| **Inline stage notes** | `<stage>` elements inside a verse line or prose line render as italic muted `[To Helen.]` before the spoken text; extracted separately from editable line text |
| **Insert song/dance SD** | Edit SDs tool: hover strip between any two units → insert a new song/dance stage direction with custom text and characters |
| **Song/dance flag toggle** | Edit SDs tool: toggle the ♪ or ⊛ flag on any existing SD per production needs |
| **Restore** | Restore individual speeches, stage directions, or all cuts in a scene |
| **Undo/Redo** | 20-step undo/redo history within an edit session |

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
| **Character links** | Force two characters to share the same actor (sky-blue pills); feeds into Suggest |
| **Minimum cast suggestion** | Welsh–Powell graph colouring; respects simultaneous constraints, quick-change forbidden pairs, and character links |
| **Suggest Replace/Extend** | When actors already exist: Replace clears and re-suggests; Extend suggests only unassigned characters and appends to the existing cast |
| **Apply suggestion** | Creates actors and assignments in one click |
| **Cut counts on cards** | Each character card shows cut line/word/time counts inline |
| **Full-cast banner** | Dismissible green banner appears once all speaking characters are assigned; links to Rehearsal tab |

---

## Scene Dashboard

| Feature | Details |
|---------|---------|
| **Scenes & Pauses tab** | Scene list with cut-only counts; actor presence chips; drag-reorder; pause insertion |
| **Matrix tab** | Character × scene grid (lines/words/time); actor-grouped headers; sticky header rows; click column to filter rows (OR multi-select); click actor header to filter by all their chars; click row label to filter columns; `?` explains filter interactions; row and column totals; Time row total shows per-scene duration (not summed character times) |
| **Chart tab** | Sorted horizontal bar chart of character lines/words/time; actor name column always fixed-width |
| **Rehearsal tab** | By-Actor scene breakdown + Suggested Rehearsal Blocks; scenes split into sub-scenes at major entrances then clustered by shared cast (complete-linkage Jaccard); by-character or by-actor toggle; actor chips show characters per block; full-company scenes isolated; `?` explains the algorithm; filter By Actor list by actor or character name; collapse any actor row to hide scene detail |
| **Integrity tab** | Missing entrance/exit SD warnings with scene/line locations; Name Diagnostics table; Props section listing prop mentions (swords, letters, etc.) extracted from SD text |
| **Metric toggle** | Switch between Lines / Words / Time for all dashboard counts |

---

## Exporting

| Feature | Details |
|---------|---------|
| **Export HTML** | Self-contained single HTML file; embeds play data + vanilla-JS mini-app; three view modes; character filter; scene jump; print button |
| **Cue scripts** | Per-actor pages with lines, cues (last 2–3 words of preceding speech), and all relevant stage directions |
| **Print / PDF** | Browser print dialog; `@page` headers (play title, cut name, actor) and footer (page number, timestamp) |

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

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| **Esc** | Exit edit mode |
| **Cmd/Ctrl+Z** | Undo (in edit mode) |
| **Cmd/Ctrl+Shift+Z** | Redo (in edit mode) |

---

## Data Model

### Project (stored as `.sss.json`)

```
Project
  name?           — optional display name
  playId          — links to the DraCor play slug
  cuts[]
    name
    cutMap          — Record<unitId, "cut"|"kept">
    lineCutMap      — Record<lineId, "cut"|"kept">
    stageDirectionEdits — Record<sdId, characterId[]>
    sceneOrder?     — custom scene ordering
    speechEdits?    — word-level track-changes per speech
    speechReassignments? — Record<unitId, characterId>
    speechSplits?   — Record<unitId, { splitAtLineIndex, newCharacterId? }>
    insertions?     — Record<insertionId, Insertion>
    characterAliases? — Record<characterId, string>
    characterLinks? — Array<[charIdA, charIdB]>
    stageDurations? — Record<stageId|speechId, minutes>
    pauses?         — Record<"after:{sceneId}", { name, minutes }>
    insertedSDs?    — Record<insertedSDId, InsertedSD>  (song/dance SDs added by director)
    sdFlagOverrides? — Record<sdId, { isSong?, isDance? }>  (per-production flag overrides)
  actors[]
    name, color
  assignments[]
    characterId → actorId
  settings?
    wordsPerMinute
    quickChangeThresholdMinutes
```

### Play (parsed from TEI, never stored)

```
Play
  acts[]
    divType?  — "prologue"|"epilogue"|"induction" (undefined = regular act)
    scenes[]
      sceneType? — "chorus"|"epilogue"|"prologue" (undefined = regular scene)
      units[]
        Speech
          characterId, characterName, speakerTag
          deliveryNote?   — inline stage qualifier, e.g. "[within]"
          lines[]         — each line has id, ftln, text, stageNote?
          lineCount
          isSong?
        StageDirection
          text, characters[]
          stageType?  — "entrance"|"exit"|"business"|"delivery"|"mixed"
          isSong?, isDance?
  castList[]
    id, name
```

---

## File Format

Projects are saved as `.sss.json` — a plain JSON file that can be opened with any text editor and version-controlled with git. The file contains no play text (that is always fetched live from DraCor or read from the local cache) — only the cut marks, actor assignments, and settings.

---

## Supported Plays

All 38 Shakespeare plays:

*All's Well That Ends Well · Antony and Cleopatra · As You Like It · The Comedy of Errors · Coriolanus · Cymbeline · Hamlet · Henry IV Part 1 · Henry IV Part 2 · Henry V · Henry VI Part 1 · Henry VI Part 2 · Henry VI Part 3 · Henry VIII · Julius Caesar · King John · King Lear · Love's Labour's Lost · Macbeth · Measure for Measure · The Merchant of Venice · The Merry Wives of Windsor · A Midsummer Night's Dream · Much Ado About Nothing · Othello · Pericles · Richard II · Richard III · Romeo and Juliet · The Taming of the Shrew · The Tempest · Timon of Athens · Titus Andronicus · Troilus and Cressida · Twelfth Night · The Two Gentlemen of Verona · The Two Noble Kinsmen · The Winter's Tale*

Play text is licensed under [Creative Commons Attribution-ShareAlike 4.0](https://creativecommons.org/licenses/by-sa/4.0/) (DraCor / Folger Editions). *The Two Noble Kinsmen* text from the Folger Digital Texts is licensed under [CC BY-NC 3.0](https://creativecommons.org/licenses/by-nc/3.0/).
