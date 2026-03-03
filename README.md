# ShakesScriptScissors ✂

A tool for directors and dramaturgs to cut Shakespeare scripts for production.

## For directors and dramaturgs

ShakesScriptScissors lets you work through any of the 37 Folger Shakespeare texts and build a production cut interactively:

### Cutting the script
- **Cut speeches and lines** — mark what's out at the speech or individual-line level; the tool tracks before/after counts (lines, words, minutes) automatically
- **Word-level edits** — make track-changes edits within individual lines for fine-grained alterations
- **Three view modes** — Standard (strikethrough), Clean (cuts hidden, final script only), or Diff (side-by-side comparison with original)
- **Multiple cut versions** — keep several cuts side by side (e.g. "Workshop draft", "Final cut") and switch between them from the nav bar
- **Speech reassignment** — hover a character's name in the script to reassign that speech to a different character; the original name shows in red strikethrough and the new name in green; hit ↩ restore to undo
- **Running line counter** — every 5 lines a right-aligned scene-relative line number appears, so you can quickly orient yourself in the script; in Standard view it counts all lines, in Clean view it counts only kept lines

### Casting
- **Assign actors to roles** — set up your company and handle double-casting; each actor gets a colour that carries through all views
- **Conflict warnings** — characters ever simultaneously on stage are flagged; actor dropdowns show a ⚠ pre-warning before you create a clash
- **Stage direction editor** — add or remove characters from individual entrance/exit stage directions to fix gaps in the TEI data
- **Character counts in casting** — each character card shows their current cut line count, word count, and stage time at a glance
- **Actor management** — click an actor's name to rename it inline; delete shows a confirmation with how many characters are assigned

### Metrics
- **Running time** — stage-time tracking from entrance/exit stage directions shows per-character and total show duration, cut vs. original; configurable words-per-minute rate
- **Lines / Words / Time toggle** — switch between metrics throughout the app; counts appear on act and scene headers as well as the side panel
- **Scene focus** — zoom in on one scene; all counts update to reflect that scene only

### Scene Dashboard
- **Scenes & Pauses** — see all scenes in order with their cut counts; drag to reorder scenes; insert named pauses (intermission, breaks) between scenes with a duration that adds to total running time
- **Matrix** — character × scene grid showing who speaks (or is on stage) in each scene; columns group by actor; click a column to filter; row and column totals; toggle between Table and Chart views
- **Rehearsal planner** — per-actor scene breakdown and suggested rehearsal blocks (consecutive scenes sharing cast members)
- **Integrity** — flags characters with kept speeches but no entrance or exit stage direction; cards show which scenes they speak in and where any known complementary SD occurs (approximate line number); split into Missing Exit and Missing Entrance columns so you can fix each independently

### Export
- **Export cue scripts** — generate a personal script for each actor showing only their lines plus the last few words before each entrance, exit, and speech (printed directly from the browser)
- **Save / Open Project** — download your cut as a `.sss.json` file and reopen it later; share with collaborators or import on another machine

**The tool currently runs locally** — there's no website to visit yet. Ask a developer on your team to set it up (see the Setup section below). Once it's running, you just open a browser and use it like any other web app. Your work is saved automatically in the browser and can be exported as a file for safekeeping.

## Setup

Requires Node.js v22 via nvm.

```bash
# 1. Install dependencies
export PATH="$HOME/.nvm/versions/node/v22.9.0/bin:$PATH"
npm install

# 2. Check out the Shakespeare TEI corpus (37 plays, ~15MB)
git submodule update --init

# 3. Start the dev server
npm run dev
# → http://localhost:3000
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server at http://localhost:3000 |
| `npm run build` | Production build |
| `npm run lint` | ESLint check |
| `npm run validate` | Parse all 37 local TEI files and report line/character counts |
| `npx tsc --noEmit` | TypeScript type check |

## Tech Stack

- **Next.js 16** App Router · **TypeScript** · **Tailwind CSS v4**
- **TEI data**: [shakedracor](https://github.com/dracor-org/shakedracor) submodule (Folger Shakespeare Library texts, 37 plays). The Two Noble Kinsmen falls back to the DraCor API.
- **Storage**: Browser `localStorage` + JSON file export/import (no database, no auth)

## Data Format

Projects are exported as `.sss.json` files and can be imported back into the tool. Share a `.sss.json` with collaborators to hand off a cut.

## For contributors

See [`CLAUDE.md`](./CLAUDE.md) for architecture overview, data flow, type system, and development conventions.

## Updating the Text

To pull the latest TEI data from DraCor:

```bash
git submodule update --remote shakedracor
git add shakedracor
git commit -m "chore: update shakedracor corpus"
```
