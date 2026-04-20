# Getting Started with ShakesScriptScissors

ShakesScriptScissors is a tool for directors and dramaturgs to cut Shakespeare scripts for production. Your work lives in the app and in files you save to your computer.

> **Haven't installed the app yet?** The easiest option is to [download the desktop app installer](https://github.com/terryago11/shakes-script-scissors/releases/latest) — no terminal required. For browser / self-hosted use, see the [Setup Guide](SETUP.md).

---

## What you can do

- Load any of the 38 Shakespeare plays (37 from DraCor + *The Two Noble Kinsmen* from the Folger edition)
- Mark cuts at the word level with strikethrough display
- Track before/after line counts and estimated running time
- Manage multiple versions of a cut (e.g. "First pass", "Matinee", "Touring")
- Assign actors to characters for double-casting
- Detect simultaneous-stage conflicts and quick-change issues
- Export individual cue scripts for actors (PDF or HTML)
- Export the full cut as a self-contained HTML mini-app to share with collaborators

---

## Opening a play

1. Open **ShakesScriptScissors** (or, if running from source, go to `http://localhost:3000`)
2. Click **New Project**
3. Select a play from the list — it loads automatically from the DraCor API
4. A new project is created with an empty "Cut 1" ready to edit

---

## Making your first cut

1. Click **✎ Edit** in the nav bar to enter edit mode
2. The toolbar turns red — you are now in **Cut** mode by default
3. **Click and drag** across any text to cut it — from a single word to a whole speech. The selection turns red with strikethrough.
4. To restore a cut: switch to **Restore** mode (↺ in the toolbar) and click **↩** on any speech
5. Click **✕ Done** (or press Esc) to exit edit mode

The **?** button in the edit toolbar shows a guide to cutting methodology and tool-specific instructions.

---

## Understanding line counts

The **Line Count panel** (right sidebar on desktop, tap **≡ Info** on tablet) shows:
- **Lines** tab — spoken line counts before and after cuts for each character
- **Words** tab — word counts
- **Time** tab — estimated on-stage time at your production's words-per-minute setting

Amber = baseline / unchanged · Red = cut · Green = added

---

## Saving your work

Your project is **auto-saved in the app** (localStorage) every time you make a change.

> ⚠️ **App storage — fragile by design.** Your work lives only in the app's localStorage. It will be **permanently lost** if you clear app data, switch to a different device, use a private/incognito window (web), or if storage quotas are enforced. **Do not rely on auto-save alone.**

To create a portable backup file:

- Click the **⚙ gear** icon → **Save Project** → saves a `.sss.json` file to your computer

**Re-export after every session.** If in doubt, download a fresh `.sss.json` before closing the tab.

To open a saved project: from the home page, click **Open Project** and select your `.sss.json` file, or drag it onto the page.

---

## Managing cuts

A project can have multiple cuts — different versions of the script:

- The **Cut selector** (in the ⚙ settings panel) shows all cuts and lets you switch, rename, duplicate, or delete them
- Each cut stores its own marks, line counts, actor assignments, and scene order independently

---

## Exporting

From the **⚙ gear** menu:
- **Export HTML** — downloads a self-contained HTML file of the cut script (Standard / Clean / Diff view) that collaborators can open in any browser without needing the app
- From the **Export** page (nav → Export): generate **cue scripts** per actor — printable PDF-style pages showing each actor's lines, cues, and stage directions

---

## Assigning your first actor

Actors are the people in your company. Characters are the roles they play.

1. Click **Casting** in the nav bar (the person icon)
2. Click **+ Add actor** and type an actor's name (e.g. "Jane Smith")
3. Find a character card — it shows the character's name and line count
4. Use the dropdown on that card to assign Jane to the character
5. The card now shows Jane's name and colour

Repeat for your full company. The tool will flag if two characters you've assigned to the same actor are ever on stage simultaneously.

---

## Generating a cue script

A cue script is a personal copy for one actor showing only their lines plus the last few words of each speech before they speak — the "cue" they listen for.

1. Click **Export** in the nav bar (or navigate to Cue Scripts)
2. Select an actor from the dropdown — a preview of their script appears
3. Click **Print / Save PDF** to save it from the app, or click **Download All as ZIP** to generate PDFs for every actor at once

---

## Next steps

- Read the [User Guide](USER_GUIDE.md) for a full feature walkthrough
- Read the [Features Reference](FEATURES.md) for a complete list of capabilities
- Use the **?** button in the Edit toolbar for cutting methodology guidance
- Use the **?** button in the Casting page for doubling methodology guidance
