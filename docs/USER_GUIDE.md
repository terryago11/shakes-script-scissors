# User Guide — ShakesScriptScissors

A full feature walkthrough for directors and dramaturgs using the tool in production.

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
9. [Exporting](#9-exporting)
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
- `[To Helen.]` before a line in italic muted text — an inline delivery stage note embedded in the TEI (e.g. a direction to address a specific character mid-speech); not part of the editable spoken text

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

**Help**: click **?** in the toolbar for tool-specific instructions. The Cut tool `?` also shows a "How to cut a play" guide.

### Speech-level cuts

**Drag to cut**: in Cut mode, click and drag across any text. The selection highlights in red; release to cut. You can drag across multiple speeches.

**Restore a speech**: switch to **Restore** mode, then click **↩** on any cut speech to restore it (plus any line cuts within it).

**Restore all in a scene**: click the **↺ restore all** button in the scene header (visible in edit mode) to remove all cuts in that scene.

### Line-level cuts

1. In Cut mode, click **✂** on the left edge of a speech to expand line-level controls.
2. Toggle individual lines to cut or restore them.
3. A speech with some lines cut shows in amber (partially cut) rather than full strikethrough.

### Stage directions

Stage directions can be cut or restored the same way as speeches. Entrance and exit SDs affect the on-stage tracking and stage time calculations — see [Line Counts and Running Time](#4-line-counts-and-running-time).

**SD character list**: hover a stage direction to reveal the character chip list. Click **+** to add a character; click **×** on a chip to remove one. Use **⟳ sync exits** to pre-fill an exit SD's character list from on-stage tracking. Use **⟳ sync entrances** (on entrance SDs) to do the same for entrances.

**Edit SDs tool**: in Edit mode, select **Edit SDs** from the toolbar. A thin hover strip appears between every pair of units in the scene — click it to open the **Insert SD** modal where you can create a new song or dance stage direction (type custom text, select characters, set ♪/⊛ flags). Inserted SDs appear with a green left border and can be edited or removed via buttons that appear in Edit SDs mode. You can also toggle the ♪ or ⊛ flag on any *existing* SD in the play — useful when the TEI doesn't mark a moment as a song or dance but your production treats it as one.

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
- Speech, line, and word-level cuts
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

### Character aliases

Hover a character name on a card to reveal a pencil icon. Click it to open an inline input — type a new display name and press Enter. The alias applies to this cut only. The original TEI name appears in muted text below when an alias is active.

### Character links

Below the line-count area on each character card, sky-blue pills show characters linked to this one. Click **+ link** to open a select of unlinked characters. Links tell the Suggest algorithm these two characters must share the same actor — useful for artistic doubling decisions you've already made.

### Suggesting a minimum cast

Click **Suggest minimum cast**. The tool uses graph colouring (Welsh–Powell algorithm) to find the minimum number of actors, respecting:
- Simultaneous on-stage constraints (from entrance/exit SDs)
- Quick-change timing (gaps below your threshold are forbidden pairs)
- Character links (hard same-actor overrides)

A preview panel shows the suggested groupings. Click **Apply** to create the actors and assignments, or **Dismiss** to discard.

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

### Tab 2 — Matrix

A character × scene grid showing cut-only values (lines, words, or time — set by the metric toggle in the dashboard header).

- **Actor-grouped headers**: cast characters are grouped under their actor's name.
- **Column click**: filter visible rows to scenes where that character appears. Click again to clear.
- **Row total**: right-edge column shows each character's total across all scenes.
- **Column total**: footer row shows each scene's total across all characters.
- **Table / Chart toggle**: Chart view shows horizontal bars per character sorted by total descending.

### Tab 3 — Rehearsal

Two sections side by side:

- **By Actor**: each actor's scenes with cut-only counts and totals.
- **Suggested Rehearsal Blocks**: consecutive scenes sharing at least one actor are grouped into a block. Shows scene range, total duration, actor chips, and per-scene breakdown.

### Tab 4 — Integrity

Flags potential data gaps in the TEI source:

- **Missing Exit SDs**: characters with kept speeches but no exit SD.
- **Missing Entrance SDs**: characters with kept speeches but no entrance SD.

Each warning card is expandable and shows the scenes involved and the approximate line number of the nearest complementary SD.

**Props** (collapsible): scans all kept stage directions for prop keywords (swords, letters, keys, torches, etc.) and lists each mention with its act, scene, and stage direction. Useful for compiling a props list for the stage manager.

**Name Diagnostics** (collapsible): a developer/dramaturg table showing every character's name from each source — TEI ID, cast list, raw speaker tag, ID-normalized fallback, SD references, and resolved display name. Sky-blue rows have an active alias.

---

## 9. Exporting

### HTML export

From the **⚙ gear** menu → **Export HTML**: downloads a self-contained HTML file that collaborators can open in any browser without the app.

The file embeds the full play data and a vanilla-JS mini-app with:
- Three view modes: Clean, Standard, Diff
- Character filter sidebar (grouped by actor)
- Scene jump, sticky top bar, print button

### Cue scripts

From the nav bar → **Export** page:

1. Select the actors you want to generate scripts for (or select all).
2. Click **Generate Cue Scripts**.
3. Print or save as PDF from your browser's print dialog.

Each actor's cue script shows:
- Their character(s) at the top
- All their lines, preceded by the last few words of the preceding speech (the "cue")
- Entrance and exit stage directions mentioning their characters
- Non-entrance/exit stage directions that fall within their on-stage blocks

Print settings: `@page` headers (play title and cut name top-left, actor name top-right), footer (page number, timestamp, tool attribution).

---

## 10. Settings

Click the **⚙ gear** icon in the nav bar.

| Setting | Description |
|---------|-------------|
| Project name | Optional display name for this production (e.g. "2026 Tour") |
| Words per minute | Base rate for running-time calculations |
| Quick-change threshold | Minimum costume-change time in minutes (default: 2.0) |
| Theme | **Light** / **Dark** / **Auto** (follows OS) / **1602** — a Renaissance printing-press theme with parchment background and period typography; toggle also available on the home and login pages via the ☼ ☽ □ ✒ buttons |

---

## 11. Saving and Opening Projects

**Auto-save**: every change is automatically saved to your browser's localStorage. If you close and reopen the browser, your work is still there.

**Backup file**: click ⚙ → **Save Project** to download a `.sss.json` file. Keep this as your portable backup — localStorage can be cleared by the browser.

**Open a project**: from the home page, click **Open Project** and select your `.sss.json` file, or drag it onto the home page.

**Multiple projects**: the home page lists all projects currently stored in your browser. Click a project card to open it.

---

## Next steps

- See [Features Reference](FEATURES.md) for a complete list of capabilities, keyboard shortcuts, and file format details.
- Use the **?** button in the Edit toolbar for cutting methodology guidance.
- Use the **?** button in the Casting page for doubling methodology guidance.
