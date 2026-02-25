# ShakesScriptScissors ✂

A tool for directors and dramaturgs to cut Shakespeare scripts for production.

## For directors and dramaturgs

ShakesScriptScissors lets you work through any of the 37 Folger Shakespeare texts and build a production cut interactively:

- **Cut speeches and lines** — mark what's out; the tool tracks before/after line counts automatically
- **Multiple versions** — keep several cuts side by side (e.g. "Workshop draft", "Final cut") and clone between them
- **Assign actors to roles** — set up your company and handle double-casting
- **Export cue scripts** — generate a personal script for each actor showing only their lines and the cues they need to listen for
- **Share cuts** — export your cut as a `.sss.json` file to hand off to collaborators, or share a read-only link

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
