# ShakesScriptScissors ✂

A browser-based tool for directors and dramaturgs to cut Shakespeare scripts for production. Load any of the 38 Folger Shakespeare plays, mark cuts at the speech, line, and word level, track before/after line counts and estimated running time, manage multiple cut versions, handle double-casting, and export actor cue scripts — all from a browser with no account required.

---

## Documentation

| Guide | For |
|-------|-----|
| [`docs/GETTING_STARTED.md`](docs/GETTING_STARTED.md) | First-time users — open a play, make a cut, assign an actor, export a cue script |
| [`docs/USER_GUIDE.md`](docs/USER_GUIDE.md) | Full feature walkthrough — cutting, casting, dashboard, export |
| [`docs/FEATURES.md`](docs/FEATURES.md) | Scannable feature reference — every feature in tables |
| [`docs/SETUP.md`](docs/SETUP.md) | Step-by-step setup for non-technical users (no coding experience needed) |
| [`docs/architecture.md`](docs/architecture.md) | Component layout, TEI parsing, engine internals |
| [`docs/CHANGELOG.md`](docs/CHANGELOG.md) | History of completed feature groups |
| [`docs/ROADMAP.md`](docs/ROADMAP.md) | Planned and deferred features |
| [`CLAUDE.md`](CLAUDE.md) | Architecture overview, data models, conventions (for contributors) |

---

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

Not a developer? See the [Setup Guide](docs/SETUP.md) for step-by-step instructions with no assumed technical knowledge.

---

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server at http://localhost:3000 |
| `npm run build` | Production build |
| `npm run lint` | ESLint check |
| `npm run validate` | Parse all 37 local TEI files and report line/character counts |
| `npx tsc --noEmit` | TypeScript type check |

---

## Tech Stack

**Next.js 16** App Router · **TypeScript** · **Tailwind CSS v4** · TEI data from [shakedracor](https://github.com/dracor-org/shakedracor) (Folger Shakespeare Library) · Browser `localStorage` storage (no database)

---

## Updating Play Texts

The play texts come from two maintained scholarly sources. DraCor periodically publishes corrections — fixing speech attributions, rewording stage directions, updating character names — based on ongoing editorial review of the Folger editions. The Folger Digital Texts are similarly a living edition. You would pull an update if you notice a speech wrongly attributed, a stage direction that seems incorrect, or if a correction has been announced. You do not need to update regularly — the texts are stable — but it is worth checking if something in the script looks wrong.

**DraCor plays (37 of 38)** — pull the submodule:

```bash
git submodule update --remote shakedracor
git add shakedracor
git commit -m "chore: update DraCor submodule"
```

**The Two Noble Kinsmen (Folger source)** — re-download and re-normalize whenever the Folger Digital Texts are updated:

```bash
curl -o /tmp/TNK-raw.xml https://www.folgerdigitaltexts.org/download/xml/TNK.xml
python3 scripts/normalize-folger-tei.py /tmp/TNK-raw.xml shakedracor/tei/the-two-noble-kinsmen.xml
cd shakedracor && git add tei/the-two-noble-kinsmen.xml && git commit -m "chore: update TNK from Folger" && cd ..
git add shakedracor && git commit -m "chore: update TNK submodule ref"
```

Both updates should be done together whenever play texts are refreshed.

---

## Known Limitations

**Song/dance duration is show-level only** — extra minutes assigned to a song or dance SD (via `+ time` in the script view) are added to the total show running time and each scene's duration in the Scenes & Pauses dashboard. They are *not* attributed to individual characters in the per-character stage-time panel, because on-stage tracking is driven by entrance/exit stage directions only and many Shakespeare scenes lack explicit entrance SDs. Treat song/dance durations as a show-level time budget.

---

## For contributors

See [`CLAUDE.md`](./CLAUDE.md) for architecture overview, data flow, type system, and development conventions.

Play text licensed under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) (DraCor / Folger Editions). *The Two Noble Kinsmen* from Folger Digital Texts is licensed under [CC BY-NC 3.0](https://creativecommons.org/licenses/by-nc/3.0/).
