# Getting Started with ShakesScriptScissors

ShakesScriptScissors is a browser-based tool for directors and dramaturgs to cut Shakespeare scripts for production. No account, installation, or server required — your work lives in your browser and in files you save to your computer.

---

## What you can do

- Load any of the 38 Shakespeare plays (37 from DraCor + *The Two Noble Kinsmen* from the Folger edition)
- Mark cuts at the speech, line, and word level with strikethrough display
- Track before/after line counts and estimated running time
- Manage multiple versions of a cut (e.g. "First pass", "Matinee", "Touring")
- Assign actors to characters for double-casting
- Detect simultaneous-stage conflicts and quick-change issues
- Export individual cue scripts for actors (PDF or HTML)
- Export the full cut as a self-contained HTML mini-app to share with collaborators

---

## Opening a play

1. Visit the app (local: `http://localhost:3000`)
2. Click **New Project**
3. Select a play from the list — it loads automatically from the DraCor API
4. A new project is created with an empty "Cut 1" ready to edit

---

## Making your first cut

1. Click **✎ Edit** in the nav bar to enter edit mode
2. The toolbar turns red — you are now in **Cut** mode by default
3. **Click and drag** across any text to cut it; the selection turns red with strikethrough
4. To cut individual lines: click **✂** on the left of any speech to expand line-level controls, then toggle individual lines
5. To restore a speech: switch to **Restore** mode (↺ in the toolbar) and click **↩** on any speech
6. Click **✕ Done** (or press Esc) to exit edit mode

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

Your project is **auto-saved to your browser** (localStorage) every time you make a change. To create a portable backup file:

- Click the **⚙ gear** icon → **Save Project** → saves a `.sss.json` file to your computer

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

## Next steps

- Read the [User Guide](USER_GUIDE.md) for a full feature walkthrough
- Read the [Features Reference](FEATURES.md) for a complete list of capabilities
- Use the **?** button in the Edit toolbar for cutting methodology guidance
- Use the **?** button in the Casting page for doubling methodology guidance
