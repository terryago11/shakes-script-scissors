# ShakesScriptScissors ✂

A web tool for interactively cutting Shakespeare scripts for production. Directors and dramaturgs can load any play, mark cuts, track before/after line counts, manage multiple cut versions, assign actors to roles (double-casting), and export individual actor cue scripts.

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

## Updating the Text

To pull the latest TEI data from DraCor:

```bash
git submodule update --remote shakedracor
git add shakedracor
git commit -m "chore: update shakedracor corpus"
```
