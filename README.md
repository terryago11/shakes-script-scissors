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
- **Song & dance markers** — stage directions containing songs or dances are highlighted in the script: ♪ violet/italic for sung lines, ⊛ cyan for dances; directors can attach an extra duration (in minutes) to any song or dance SD via a `+ time` link — this is added to the total show running time in the Scenes & Pauses dashboard
- **Script typography** — shared verse lines split across speakers are proportionally indented so each fragment visually "completes" the iambic pentameter line (e.g. "When? / Now. / As I descended?" in Macbeth); poem stanza B-rhymes are indented per Folger convention; delivery qualifiers such as `[within]` appear inline after the character name; stage directions embedded mid-speech (e.g. "Enter Macbeth with bloody daggers." in the middle of Lady Macbeth's speech) are parsed and displayed as proper stage direction blocks

### Casting
- **Assign actors to roles** — set up your company and handle double-casting; each actor gets a colour that carries through all views
- **Conflict warnings** — characters ever simultaneously on stage are flagged; actor dropdowns show a ⚠ pre-warning before you create a clash; each warning card shows the exact act, scene, and approximate original-script line number for both the exit and entrance so you can judge whether the change is physically feasible
- **Stage direction editor** — add or remove characters from individual entrance/exit stage directions to fix gaps in the TEI data
- **Character counts in casting** — each character card shows their current cut line count, word count, and stage time at a glance
- **Actor management** — click an actor's name to rename it inline; delete shows a confirmation with how many characters are assigned
- **Character aliases** — give any character a production-specific display name (e.g. rename "FIRST PLAYER" to "Player King" for clarity); aliases apply everywhere — script view, line counts, matrix, cue scripts — while the original TEI name stays visible in muted text so the mapping is always traceable; aliases are per-cut, so different cut versions can have different names
- **Character links** — pin two characters to always share the same actor (e.g. Theseus/Oberon in MND); linked pairs appear as sky-blue pills on each character card and override the Suggest algorithm so those characters are always grouped together regardless of quick-change constraints
- **Suggest minimum cast** — click "Suggest minimum cast" to find the smallest possible company for your cut; the algorithm uses graph colouring (Welsh–Powell, sorted by line count) to group characters with no simultaneous conflicts; it respects your quick-change threshold setting — characters with too little turnaround time between scenes cannot share an actor — and honours all character links you've set; the suggestion panel shows character names under each actor slot and lets you Apply (creates the actors and assignments) or Dismiss

### Metrics
- **Running time** — stage-time tracking from entrance/exit stage directions shows per-character and total show duration, cut vs. original; configurable words-per-minute rate
- **Lines / Words / Time toggle** — switch between metrics throughout the app; counts appear on act and scene headers as well as the side panel
- **Scene focus** — zoom in on one scene; all counts update to reflect that scene only
- **Scene jumper** — the scene-jump dropdown in the nav bar shows shorthand labels (e.g. `pr:1` for a prologue, `ep:1` for an epilogue, `3:ch` for a chorus within Act 3); scenes hidden by an active character/actor filter are dimmed and disabled in the dropdown

### Scene Dashboard
- **Scenes & Pauses** — see all scenes in order with their cut counts; drag to reorder scenes; insert named pauses (intermission, breaks) between scenes with a duration that adds to total running time
- **Matrix** — character × scene grid showing who speaks (or is on stage) in each scene; columns group by actor; click a column to filter; row and column totals; toggle between Table and Chart views
- **Rehearsal planner** — per-actor scene breakdown and suggested rehearsal blocks (consecutive scenes sharing cast members)
- **Integrity** — flags characters with kept speeches but no entrance or exit stage direction; cards show which scenes they speak in and where any known complementary SD occurs (approximate line number); split into Missing Exit and Missing Entrance columns so you can fix each independently. **Name Diagnostics** — a collapsible table listing every character's name variants side by side (Folger cast list name, speaker tags, SD references, resolved display name); hover any SD reference token to see which acts/scenes it comes from; useful for spotting TEI data gaps or checking how aliases are applied

### Export
- **Export cue scripts** — generate a personal script for each actor showing only their lines plus the last few words before each entrance, exit, and speech; print or save as PDF directly from the browser; printed pages include a header (play title · cut name on the left, actor · characters on the right) and a footer (page number · date · tool name); page 1 has no header or footer
- **Export cut as HTML** — download a self-contained `.html` file of the full cut script that opens in any browser without a server; the file includes three view modes (Clean, Standard with strikethrough, Diff side-by-side), a character filter sidebar grouped by actor, a sticky header with scene-jump navigation, and a Print button; all print headers and footers are baked into the file at export time
- **Save / Open Project** — download your cut as a `.sss.json` file and reopen it later; share with collaborators or import on another machine

### Appearance
- **Dark mode** — the tool respects your system preference automatically, or you can pin it to light or dark using the sun/moon/monitor toggle on the home page or in the settings panel
- **Settings panel** — click the ⚙ gear in the nav to access project name, words-per-minute (slider with presets), quick-change threshold, theme, and save/export options all in one place
- **Responsive layout** — works on tablet landscape (1024px) as the primary target; on smaller screens the nav collapses script controls behind a `☰` menu, nav link labels hide to icon-only, and the line-count panel shifts to a bottom drawer toggled by an `≡ Info` pill; the script editor goes full-width; the scene dashboard tabs scroll horizontally

---

## Known Limitations

- **Song/dance duration is show-level only** — the extra minutes you assign to a song or dance SD (via `+ time` in the script view) are added to the total show running time and to each scene's duration in the Scenes & Pauses dashboard. They are *not* attributed to individual characters in the per-character stage-time panel. This is because on-stage character tracking is driven by entrance/exit stage directions only, and many Shakespeare scenes lack explicit entrance SDs — making per-character attribution unreliable for these moments. Treat song/dance durations as a show-level time budget.

---

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
- **TEI data**: [shakedracor](https://github.com/dracor-org/shakedracor) submodule (Folger Shakespeare Library texts, 37 plays) + *The Two Noble Kinsmen* sourced directly from [Folger Digital Texts](https://www.folgerdigitaltexts.org/) and normalized via `scripts/normalize-folger-tei.py`.
- **Storage**: Browser `localStorage` + JSON file export/import (no database, no auth)

## Data Format

Projects are exported as `.sss.json` files and can be imported back into the tool. Share a `.sss.json` with collaborators to hand off a cut.

## For contributors

See [`CLAUDE.md`](./CLAUDE.md) for architecture overview, data flow, type system, and development conventions.

## Updating the Text

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
