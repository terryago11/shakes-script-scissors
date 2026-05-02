# Roadmap

## Done ✓

See [CHANGELOG.md](./CHANGELOG.md) for the full history of completed feature groups (Groups 1–24D, Electron packaging, and auto-updates).

---

**Group 25 ✓ Done** — Script Polish, Count Audit, Audition Mode & Exports — see CHANGELOG for details.

---

## Upcoming — Group 26 — Electron Native File I/O
- **Native open/save** (`electron/main.ts`, `electron/preload.ts`, `ProjectStore.tsx`, `SettingsModal.tsx`): replace web-style import/export with native `dialog.showOpenDialog` / `showSaveDialog` IPC in Electron. Projects open/save like Word documents. Web app keeps existing download/upload flow. Cmd+S saves without dialog once a path is known.

---

## Upcoming — Group 27 — Help System
- Consolidate scattered `?` buttons into a shared `HelpPopover` component. Add a Help nav entry linking to a topic index modal. Optionally: first-time onboarding highlights on first project load (hand-rolled, no library dependency). Design discussion required before implementation.

---

## In Progress — Group 28 — Export Fidelity Audit — [full spec](./group-28-plan.md)

Deep audit and fix of HTML and Word exports to match the app's standard and clean rendering exactly. Sessions 1–3 done; Session 4 (S4-1 through S4-9) in progress.

- **28A ✓** — Baseline audit
- **28B ✓** — Feature matrix test project
- **28C ✓** — Bug fixes (Sessions 1–3): delivery notes · continuation · reassignments · consecutive SDs · song/dance · inserted SDs · sub-scene divisions · character list
- **28C S4** *(in progress)* — Inserted speech green styling · word-level edit HTML · SD diff columns · line numbers (HTML + Word) · filename date suffix · Word red cuts · Word header/footer
- **28D** — Documentation + PR

---

## Upcoming — Group 29 — Cue Script Improvements — [full spec](./group-28-plan.md#group-29--cue-script-improvements)

Overhaul the cue script export page and line buddy drill tool. Full spec lives in the Group 28 plan doc.

- **29-2** — UI cleanup: search bar on cue script page · per-actor "Export Line Buddy" button · print button in script view nav · move batch buttons to top bar · remove clutter text
- **29-3** — Line buddy redesign: scene-based scrolling layout · per-line reveal (not per-speech) · scene jump navigation · keyboard shortcuts · remove shuffle/reset/card-counter · stretch: right/wrong marking + mistake review
- **29-4** — Export fidelity: delivery notes in cue scripts · song/dance indicators in line buddy · inserted SDs · verify cue script and line buddy against clean script
- **29-D** — Documentation + PR

---

## Known Issues / Tech Debt

- **React key warning in `CastingManager`** — "Each child in a list should have a unique 'key' prop. Check the render method of `CastingManager`." Reproducible by editing a character-card alias and then switching to a different cast option. All explicit `.map()` calls in `CastingManager.tsx`, `CharacterCard.tsx`, and `CompareCastOptions.tsx` have been audited and carry `key` props; root cause not yet located. Needs browser DevTools inspection with the full component stack to pinpoint the offending list.

---

## Deferred / N/A
- Google Drive backup integration
- **#31 Tableau-style visualization** — character presence / stage time chart using D3 or Recharts
- **`buildEditIndex` traversal** (`components/ScriptEditor/ScriptEditor.tsx`): currently walks all play acts/scenes/units to build `lineToUnit` and `unitOrder` — duplicates the traversal that `computeCuts` already does. The `useEffect` that calls it must run before `unitsByScene` is computed (React hooks must precede conditional returns), so the obvious fix of passing `unitsByScene` is blocked by hook ordering. Deferred: evaluate whether memoizing `computeCuts` before the early-returns or storing `unitsByScene` in a ref is worth the restructuring cost.
