# User Guide — ShakesScriptScissors

A full feature walkthrough for directors and dramaturgs using the tool in production.

> **Haven't set up the app yet?** [Download the desktop app](https://github.com/terryago11/shakes-script-scissors/releases/latest) — no terminal required. Or see the [Setup Guide](SETUP.md) for step-by-step source instructions, or the [Developer Setup in the README](../README.md#developer-setup) if you're comfortable with a terminal.

---

## Table of Contents

1. [The Script Editor](#1-the-script-editor)
2. [Making Cuts](#2-making-cuts)
3. [Word-Level Editing](#3-word-level-editing)
4. [Line Counts and Running Time](#4-line-counts-and-running-time)
5. [Managing Cuts (Versions)](#5-managing-cuts-versions)
6. [View Modes](#6-view-modes)
7. [Casting and Doubling](#7-casting-and-doubling)
8. [Scene Dashboard](#8-scene-dashboard)
9. [Exporting and Importing](#9-exporting-and-importing)
10. [Settings](#10-settings)
11. [Saving and Opening Projects](#11-saving-and-opening-projects)

---

## 1. The Script Editor

The script editor is the main working view. It shows the full play divided by act and scene.

**Navigation**
- The **scene jumper** (nav bar centre) lets you jump directly to any act and scene. Non-standard structural divisions are labelled: `pr` = prologue, `ep` = epilogue, `in` = induction, `ch` = chorus.
- Click any **act header** to collapse or expand that act.
- Click any **scene header** to collapse or expand that scene.

**Focus mode**
- Click the **⊙** button on any scene header to enter focus mode — only that scene is visible, and the Line Count panel scopes to that scene only. Click **⊙** again to exit.

**Character filter**
- In the **Line Count panel** (right sidebar), click any character or actor name to filter the script to scenes where they appear. The scene jumper greys out irrelevant scenes.

**Indicators**
- ♪ violet/italic — a sung line or song stage direction
- ⊛ cyan — a dance or dumbshow stage direction
- `[within]` after a character name — a delivery qualifier (e.g. speaking offstage)
- `[To Orlando.]` as a stage direction block between speech parts — inline delivery stage notes (e.g. `<stage>To Orlando.</stage>` embedded inside a line in the TEI) are expanded into a proper stage direction, splitting the speech into a first part, the stage direction, and a continuation below

**Finding text**
- Press **Cmd+F** (Mac) or **Ctrl+F** (Windows/Linux), or click the **🔍 magnifying glass** button in the nav bar, to open the floating search bar.
- Type any text to search dialogue, character names, stage directions, delivery notes, and inserted stage directions. In Clean mode, cut content is excluded from results.
- Use the **↑ ↓** buttons or **Enter / Shift+Enter** to step through matches. The current match is highlighted and scrolled into view.
- Press **Esc** or click **×** to close.

---

## 2. Making Cuts

### Entering edit mode

Click **✎ Edit** in the nav bar. The nav bar turns red — you are now in **Cut** mode.

### The edit toolbar (red bar)

The toolbar shows the active tool. Switch tools using the buttons:
- **✂ Cut** — drag to select and cut text
- **↺ Restore** — click to restore a cut speech or stage direction
- **⇄ Reassign** — reassign a speech to a different character
- **✂⊙ Split** — split a speech at a line boundary (optionally reassigning the second half)
- **+ Insert** — insert new text after a speech
- **W Edit** — click individual words to cut or insert them
- **✕ Done** (or press Esc) — exit edit mode

**Undo/Redo**: the toolbar includes ↩ ↪ buttons (up to 20 steps).

**Edit navigation**: when a tool is active and you have made edits, a **← N / total edits →** counter appears in the toolbar. Click the arrows to jump between edits in document order — the script scrolls to each one and expands any collapsed act or scene automatically. The count and pool update as you make or restore edits. The counter is hidden in **none** / **Done** mode.

**Help**: click **?** in the toolbar for tool-specific instructions. The Cut tool `?` also shows a "How to cut a play" guide.

### Making cuts

**Drag to cut**: in Cut mode, click and drag across any text — from a single word to whole speeches across a scene. The selection highlights in red; release to cut.

A speech with some words or lines cut shows in amber (partially cut) rather than full strikethrough.

**Restore a cut**: switch to **Restore** mode, then click **↩** on any cut speech to restore it.

**Restore all in a scene**: click the **↺ restore all** button in the scene header (visible in edit mode) to remove all cuts in that scene.

### Stage directions

Stage directions can be cut or restored the same way as speeches. Entrance and exit SDs affect the on-stage tracking and stage time calculations — see [Line Counts and Running Time](#4-line-counts-and-running-time).

**SD character list**: hover a stage direction to reveal the character chip list. Click **+** to add a character; click **×** on a chip to remove one. Use **⟳ sync exits** to pre-fill an exit SD's character list from on-stage tracking. Use **⟳ sync entrances** (on entrance SDs) to do the same for entrances.

**Edit SDs tool**: in Edit mode, select **Edit SDs** from the toolbar. A thin hover strip appears between every pair of units in the scene — click it to open the **Insert SD** modal where you can create a new song or dance stage direction (type custom text, select characters, set ♪/⊛ flags). Inserted SDs appear with a green left border and can be edited or removed via buttons that appear in Edit SDs mode. You can also toggle the ♪ or ⊛ flag on any *existing* SD in the play — useful when the TEI doesn't mark a moment as a song or dance but your production treats it as one.

**Rewriting SD text**: with **Edit SDs** active, a ✎ button appears next to every stage direction's text. Click it to open an inline editor pre-filled with the current wording — type your revised text, then press **Enter** or click away to save. Rewritten SDs display with a green left border and small "edited" badge in Standard and Diff views; in Clean view they appear without any indicator. The original TEI text is preserved and can be restored at any time by switching to the **Restore** tool and clicking **↩ restore text** on the SD. Rewrites carry through to cue scripts and HTML/Word exports.

### Speech reassignment

In **Reassign** mode, hover a character name to reveal a **⇄** icon. Click it to open a dropdown of characters in the cast — select a new character to re-attribute the speech. The original name appears with red strikethrough; the new name appears in green. Hover **↩ restore** to undo the reassignment.

Reassignments affect only the **after-cut** line counts — the original counts stay with the original character.

### Splitting speeches

In **Split** mode, hover a line boundary (between two lines) to reveal a **✂ split** button. Clicking it splits the speech into two parts at that line. Part 2 can optionally be reassigned to a different character at split time. A **⊙ merge** button on the split block restores both parts.

### Inserting text

In **Insert** mode, a **+ insert** button appears after each speech. Click it to open the insertion modal — enter text, choose a character from the cast, and confirm. Insertions appear with a green left border and "inserted" badge. They are included in line/word counts and cue scripts.

---

## 3. Word-Level Editing

In **W Edit** mode, individual words within a line become clickable.

- **Cut a word**: click a word to mark it for removal (strikethrough).
- **Insert a word**: click the space between words to open an insertion popover. Type the new word and confirm.
- **Remove an inserted word**: hover the inserted word to reveal a **×** button.
- **Edit an inserted word**: click the inserted word to re-open its popover pre-filled with the current text.

Word edits accumulate as a track-changes record per speech. They are visible in Standard and Diff view modes; Clean view shows the edited text as plain prose.

---

## 4. Line Counts and Running Time

The **Line Count panel** is the right sidebar on desktop, or the drawer opened by the floating **≡ Info** pill (visible on mobile and tablet).

### Tabs

- **Lines** — spoken line counts before and after cuts, per character and per actor.
- **Words** — word counts (useful for prose-heavy plays).
- **Time** — estimated on-stage time per character and total show duration.

**Colour key**: Amber = baseline / unchanged · Red = cut · Green = addition (e.g. a character added to a stage direction)

### Running time

Time is calculated from entrance and exit stage directions, not just from speeches. Each character accumulates time from when they enter to when they exit. Characters currently on stage all accumulate time simultaneously while a speech is being delivered.

**Words per minute** sets the base rate; adjust it in ⚙ Settings. The tool ships with common theatre rates:
- Slow: 100 wpm
- Amateur: 130 wpm
- Default: 135 wpm
- Experienced: 150 wpm
- Professional: 180 wpm

**Song and dance duration**: hover a ♪ or ⊛ stage direction to reveal a **+ time** button. Enter an estimated number of minutes; this is added to the total running time and scene durations (but not attributed to individual characters' on-stage time).

**Intermissions**: add named pauses between scenes from the Dashboard → Scenes & Pauses tab. Pause durations are included in total running time.

### Scene-relative line numbers

A small right-aligned line number appears every 5 lines in each scene, making it easy to cross-reference with physical scripts:
- **Standard mode** — numbers count all lines (including cut ones), so they match the uncut text.
- **Clean mode** — numbers count only kept lines.
- **Diff mode** — each column has its own counter.

---

## 5. Managing Cuts (Versions)

A project can hold many cuts — different versions of the script. Examples: "First pass", "Matinee", "Touring", "Director's cut".

**Switching cuts**: open ⚙ Settings → the Cut selector shows all cuts; click to switch.

**Each cut stores independently**:
- Word-level cuts
- Stage direction character list edits
- Scene ordering
- Actor assignments
- Character aliases
- Character links
- Song/dance durations
- Intermissions (pauses)

**Actions**:
- **Rename**: double-click a cut name in the selector.
- **Duplicate**: click the copy icon. The duplicate gets a new name and inherits all marks, assignments, and aliases.
- **Delete**: click the trash icon (requires confirmation).

---

## 6. View Modes

Switch modes from the **dropdown in the nav bar** (next to the play title):

- **Standard** — shows all text; cuts appear with red strikethrough. The default working view.
- **Clean** — hides cut speeches and stage directions; shows only the surviving script. Useful for reading through the cut.
- **Diff** — side-by-side: the cut version (left) next to the original (right). Useful for reviewing what changed.

All three modes support export as HTML for sharing with collaborators.

---

## 7. Casting and Doubling

Open **Casting** from the nav bar (the person icon).

### Assigning actors

Each character card shows the character name and their cut line/word/time counts. Use the actor dropdown on each card to assign an actor.

- **⚠ prefix** in the dropdown — a warning that this actor is already assigned to a character who is on stage at the same time. Assigning them will create a conflict.
- **⚠ N badge** on a character card — N of this character's simultaneous-stage partners share the same assigned actor.

### Adding and managing actors

Actors appear in the left column. Click **+ Add actor** to add one. Click an actor's name to rename it inline. Click the **×** button (with confirmation) to delete an actor and remove all their assignments.

Click **Unassign all** to clear every character-to-actor assignment at once. An inline confirmation bar appears before the action executes. In Audition Mode, this clears assignments in the current draft only without affecting the saved cast option.

### Character aliases

Hover a character name on a card to reveal a pencil icon. Click it to open an inline input — type a new display name and press Enter. The alias applies to this cut only. The original TEI name appears in muted text below when an alias is active.

### Character links

Below the line-count area on each character card, sky-blue pills show characters linked to this one. Click **+ link** to open a select of unlinked characters. Links tell the Suggest algorithm these two characters must share the same actor — useful for artistic doubling decisions you've already made.

### Suggesting a minimum cast

Click **Suggest**. The tool uses graph colouring (Welsh–Powell algorithm) to find the minimum number of actors, respecting:
- Simultaneous on-stage constraints (from entrance/exit SDs)
- Quick-change timing (gaps below your threshold are forbidden pairs)
- Character links (hard same-actor overrides)

**Desired actor count**: before running, you can enter a target number of actors. The algorithm shows the natural minimum for reference. If your target is *below* the minimum, groups are merged (least shared stage-time first) and a forced-conflict panel lists the pairs that share an actor despite overlapping on stage. If your target is *above* the minimum, large groups are split into solos.

A preview panel shows the suggested groupings. Click **Apply** to create the actors and assignments, or **Dismiss** to discard.

### Audition Mode — comparing cast options

**Audition Mode** lets you save and compare named casting configurations (e.g. "lean", "expanded", "star vehicle") without committing changes to your project.

1. Click **Auditions** in the nav bar (visible when you are on the Casting page). The nav bar turns blue — you are now in Audition Mode.
2. The chip bar shows all saved cast options. Click a chip to load that option's assignments into the editor. The current option is highlighted.
3. Make assignment changes as normal — they go into the draft only, not into the project.
4. Click **Update Option** (enabled when the draft has unsaved changes) to persist your edits back to that option.
5. Click **+ New Option** to save the current draft state as a new named option.
6. Click **Choose casting option: [name]** to apply the current draft to the project and exit Audition Mode.
7. Click **Exit Auditions ×** (or navigate away) to exit without changing the project. If the draft has unsaved changes, an inline confirmation bar appears — click "Yes, exit" to discard or "Cancel" to stay.
8. Click **Compare** to open a side-by-side modal comparing up to 3 options at once; switch between Words / Lines / Time metrics; click column headers to sort.

> **Tip:** Actors are a global pool — all cast options share the same actor names and colours. Only assignments (and optional per-option must-double links) differ between options.

### Download Casting Sheet

In Audition Mode, click **Download Casting Sheet** to save a blank casting worksheet as a `.pdf` file directly to your Downloads folder — no print dialog, no browser tab. The sheet shows:
- **Characters section**: one card per character with line/word/time stats and a blank underline for handwriting in the actor's name.
- **Actors section**: one card per actor with their name and colour swatch, plus blank ruled rows for writing in character assignments.

Because the sheet is always blank, it is safe to download at any point in the casting process without revealing current draft assignments. Open the PDF in any viewer and print from there.

### Quick-change warnings

When an actor exits as one character and re-enters as another with insufficient time for a costume change, a warning card appears:

```
[Actor] exits as [Char A] → enters as [Char B]  (X.Xm gap)
  Act 1, scene 2: ~l.47 → Act 1, scene 4: ~l.0
```

The quick-change threshold is set in ⚙ Settings (default: 2 minutes).

### The `?` help panel

Click **?** in the Casting page header for an explanation of the graph-colouring algorithm, quick-change threshold, character links, and the three kinds of doubling (deficiency / virtuoso / emergency).

---

## 8. Scene Dashboard

Open **Dashboard** by clicking the play title in the nav bar (or the grid icon).

### Tab 1 — Scenes & Pauses

Lists all scenes with their cut-only line/word/time counts. Actor presence chips show which actors appear in each scene.

**Reorder scenes**: grab the **⠿** handle and drag a scene to a new position. The script editor reflects the new order. An amber drop indicator shows where the scene will land.

**Insert a pause**: click the **⏸** button between two scenes to add a named intermission. Enter a name (e.g. "Interval") and duration in minutes. Pauses are included in total running time.

**Split a scene into sub-parts (A/B/C)**: click the **✂ Split** button on a scene row (visible on hover). Enter a scene-relative line number, review the 2-line context preview, and click **Split here**. The scene expands into A/B/C sub-rows showing per-part counts. You can add up to 3 parts (A/B/C) per scene.

- To remove a sub-part: click the **×** button on a B or C sub-row. Removing a split merges that part back into the one above it; any pause after that sub-part is also removed.
- Pauses can be inserted after any sub-part using the **⏸** button between sub-rows.
- Sub-scene dividers (amber horizontal rules labelled "Part B", "Part C") appear automatically in the script editor in all three view modes.

**Production notes**: hover any act or scene row to reveal a pencil icon. Click it to type a short note — for example "Interval after this scene (front-of-house cue)" or "Battle sequence: coordinate with fights director before tech". Notes are saved per project and visible in the Scenes & Pauses tab at all times; they do not appear in exported HTML, Word, or cue script files.

### Tab 2 — Matrix

A character × scene grid showing cut-only values (lines, words, or time — set by the metric toggle in the dashboard header).

- **Actor-grouped headers**: cast characters are grouped under their actor's name.
- **Sub-scene columns**: when a scene is subdivided, it expands to A/B/C sub-columns with amber label badges in the column headers.
- **Column click**: filter visible rows to scenes where that character appears. Click again to clear.
- **Row total**: right-edge column shows each character's total across all scenes.
- **Column total**: footer row shows each scene's total across all characters.
- **Table / Chart toggle**: Chart view shows horizontal bars per character sorted by total descending. Switch to **Presence** mode for the Tableau-style character presence chart (see Charts tab below).

### Tab 2B — Charts · Presence mode

Switch the Charts tab toggle to **Presence** for a Tableau-style two-panel visualization:

- **By line number** (upper panel): one swimlane row per character, grouped by actor. Each speech appears as a colored bar positioned at its Folger through-line number, so you can see the temporal flow of who speaks when across the whole play. Act headers span the top; act boundary dividers mark the transitions. Click any character name to filter — their bars stay highlighted while all others dim. The same filter applies to the scene strips below.
- **By scene** (lower panel): one row per scene, each strip proportionally sized to the scene's line count (longest scene = full width). Speech segments are colored by actor. Click any scene label to filter the swimlane above to only the characters who appear in that scene. Click again to clear.

Both filters are mutually exclusive — selecting a scene clears any character selection and vice versa.

### Tab 3 — Rehearsal

Two sections side by side:

- **By Actor**: each actor's scenes with cut-only counts and totals.
- **Suggested Rehearsal Blocks**: scenes grouped by shared cast using hierarchical clustering. Shows scene range, total duration, actor chips, and per-scene breakdown.

When director-defined sub-parts exist, a **Scenes / Sub-scenes** pill toggle appears in the Suggested Rehearsal Blocks header. In **Sub-scenes** mode the algorithm treats each A/B/C part as an independent unit — useful for scheduling rehearsals at sub-scene granularity once you've divided longer scenes.

### Tab 4 — Integrity

Flags potential data gaps in the TEI source:

- **Missing Exit SDs**: characters with kept speeches but no exit SD.
- **Missing Entrance SDs**: characters with kept speeches but no entrance SD.

Each warning card is expandable and shows the scenes involved and the approximate line number of the nearest complementary SD.

**Props tab**: an algorithmic props list useful as a starting point for the stage manager. Scans both stage directions (reliable — grey badges) and speech text (heuristic — amber badges). Dialogue refs carry a confidence signal: solid border = action verb detected on the same line (high confidence); dashed border = demonstrative/possessive context only (lower confidence). Large set pieces (bed, table, throne, coffin) are excluded from dialogue detection and only shown when explicitly called for in a stage direction. Hover any badge for a 5-word context snippet with the matched keyword in bold. Plurals are consolidated (sword + swords → sword). Treat all results as a starting point — verify before finalising your props list.

**Name Diagnostics** (collapsible): a developer/dramaturg table showing every character's name from each source — TEI ID, cast list, raw speaker tag, ID-normalized fallback, SD references, and resolved display name. Sky-blue rows have an active alias.

---

## 9. Exporting and Importing

### HTML export

From the **⚙ gear** menu → **Export HTML**: downloads a self-contained HTML file that collaborators can open in any browser without the app.

The file embeds the full play data and a vanilla-JS mini-app with:
- Three view modes: Clean, Standard, Diff
- Character filter sidebar (grouped by actor)
- Scene jump, sticky top bar, print button

### Word export (.docx)

From the **⚙ gear** menu → **Export as Word**: exports the full current cut as a `.docx` file.

1. Click **Export as Word** — an amber warning panel expands.
2. Choose the view mode:
   - **Clean** — cuts hidden; only the surviving script is included.
   - **Standard** — cuts shown with grey strikethrough; inserted text underlined in green; word-level cuts/insertions marked individually.
3. Click **Download Anyway** to download the file.

Note: the `.docx` is a one-way export — it cannot be re-imported into Shakespeare Script Scissors.

### Importing cuts from Word *(experimental)*

Directors who work by highlighting text in a Word document can import that `.docx` directly as a new cut:

1. Open ⚙ Settings → click **Import cut from pre-existing Word doc (experimental)**.
2. Read the explanation and check "I understand" to unlock the file picker.
3. Select your `.docx` file — the app parses it immediately.
4. Review the **preview panel**:
   - A green or amber badge shows the match rate (% of speeches matched to this play's text).
   - Counts of fully cut speeches and word-level cuts are shown.
   - Any highlighted passages that could not be matched are listed in a collapsible section — review these to spot edition mismatches.
5. Enter a name for the cut and click **Create cut**.
6. Click **View in script →** to close the modal and go straight to the new cut.

**What is read**: highlighted text only — converted to word-level cuts.

**What is ignored**: stage directions (even if highlighted), speaker names and headings, new or inserted text, Word's tracked changes (strikethrough/balloon), and any text that cannot be matched to this play's Folger edition.

**Requirements**:
- The document must have clear "Act I / Scene 1" style headings — the tool hard-rejects documents with no Act or Scene structure.
- Match rate < 40% → hard reject (wrong play or wrong edition).
- Match rate 40–69% → amber warning (some text may use a different edition — review carefully).
- Match rate ≥ 70% → green (proceed normally).

### Cue scripts

From the nav bar → **Cue Scripts** page:

1. Select an actor from the dropdown to preview their cue script.
2. Click **Print / Save PDF** to print or save that actor's script from the app.
3. Click **Download All as ZIP** to generate server-side PDFs for every actor at once and download them as a single ZIP file.
4. Click **Line Buddy (HTML)** to download a ZIP of interactive HTML cue-card files — one per actor.

Each actor's cue script shows:
- Their character(s) at the top
- All their lines, preceded by the last few words of the preceding speech (the "cue")
- Entrance and exit stage directions mentioning their characters
- Non-entrance/exit stage directions that fall within their on-stage blocks

Print settings: `@page` headers (play title and cut name top-left, actor name top-right), footer (page number, timestamp, tool attribution).

### Line Buddy — interactive cue-card drill

**Line Buddy** is a self-contained HTML flashcard app for memorising lines. Each card shows the cue (the last few words of the preceding speech), and the actor taps or presses a key to reveal their response.

**Download**: Cue Scripts page → **Line Buddy (HTML)** button downloads a ZIP containing one HTML file per actor. Open any file in a browser — no internet connection needed.

**Controls**:
- **Space** or **→** — reveal lines / advance to next card
- **←** — go back to the previous card (shown fully revealed)
- **S** — toggle shuffle mode (randomises card order)
- **Reset** button — restart from the first card in current order

A progress bar tracks how far through the deck the actor is. Cards without a preceding speech (e.g. the opening line of a scene) show "— Beginning —" as the cue. Mobile-friendly with large tap targets (minimum 44 px).

---

## 10. Settings

Click the **⚙ gear** icon in the nav bar.

| Setting | Description |
|---------|-------------|
| Project name | Optional display name for this production (e.g. "2026 Tour") |
| Words per minute | Base rate for running-time calculations |
| Quick-change threshold | Minimum costume-change time in minutes (default: 2.0) |
| Theme | **Light** / **Dark** / **Auto** (follows OS) / **1602** — a Renaissance printing-press theme with parchment background and period typography; toggle also available on the home and login pages via the ☼ ☽ □ ✒ buttons |
| Save Project (.sss.json) | Download the project file to disk — your durable backup |
| Export as HTML | Download a self-contained HTML file of the full cut script (one-way, cannot be re-imported) |
| Export as Word | Download the full cut as `.docx` (Clean or Standard mode); one-way export — see [Exporting](#9-exporting) |

---

## 11. Saving and Opening Projects

**Auto-save**: every change is automatically saved to the app's localStorage. If you close and reopen the app, your work is still there — *as long as you use the same device and haven't cleared app data.*

**Backup file**: click ⚙ → **Save Project** to download a `.sss.json` file. Keep this as your portable backup — re-export after every session.

**Open a project**: from the home page, click **Open Project** and select your `.sss.json` file, or drag it onto the home page.

### ⚠️ Storage risks

App localStorage is **ephemeral**. Your work will be lost if any of the following happen:

- You clear app data or cookies (web: "Clear browsing data" in browser settings; desktop: reinstall)
- You open the app in a private / incognito window (web only — storage is wiped when the window closes)
- You switch to a different device (or a different browser, on web)
- Storage quotas are enforced and old data is evicted
- The app is reinstalled or the computer is wiped

**Treat auto-save as a convenience, not a backup.** Download a `.sss.json` file regularly via ⚙ → **Save Project**, and store it somewhere safe (cloud storage, email, USB).

**Multiple projects**: the home page lists all projects currently stored in the app. Click a project card to open it.

---

## 12. Authentication

By default the app shows a password login page. This protects the tool when running on a shared or networked machine.

**For personal/local-only use**, authentication can be turned off entirely. Add the following line to your `.env` file and restart the server:

```
AUTH_DISABLED=true
```

When `AUTH_DISABLED=true` is set, the login page is bypassed and the home page opens directly. Only use this when the app is running on `localhost` and is not reachable from the network. See [Setup Guide](SETUP.md) for full configuration instructions.

---

## Next steps

- See [Features Reference](FEATURES.md) for a complete list of capabilities, keyboard shortcuts, and file format details.
- Use the **?** button in the Edit toolbar for cutting methodology guidance.
- Use the **?** button in the Casting page for doubling methodology guidance.
