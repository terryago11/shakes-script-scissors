# Roadmap

## Done ✓

See [CHANGELOG.md](./CHANGELOG.md) for the full history of completed feature groups (Groups 1–24D, Electron packaging, and auto-updates).

---

**Group 25 ✓ Done** — Script Polish, Count Audit, Audition Mode & Exports — see CHANGELOG for details.

**Group 28 ✓ Done** — Export Fidelity Audit — see CHANGELOG for details.

**Group 29 ✓ Done** — Cue Script Improvements — see CHANGELOG for details.

**Group 30 (in progress)** — Mixed improvements — [full spec](./group-30-plan.md)
- **30A ✓** — Quick fixes: SD textarea min rows · custom actor count outside audition mode · Electron HTML strip
- **30B ✓** — Integrity engine: speech reassignment attribution · insertedSDs in entrance/exit checks · near-fully-cut character surfacing · "mark for removal" flag
- **30C ✓** — Doubling conflict warnings panel + actor/character card badges
- **30D ✓** — Multi-select scene/character filters in DashboardMatrix and PresenceChart
- **30E** — Scene subdivision suggestions in Scenes & Pauses *(next)*
- **30F** — Who's on stage sidebar in Script editor *(next)*

---

## Skipped — Group 26 — Electron Native File I/O *(deferred)*
- **Native open/save** (`electron/main.ts`, `electron/preload.ts`, `ProjectStore.tsx`, `SettingsModal.tsx`): replace web-style import/export with native `dialog.showOpenDialog` / `showSaveDialog` IPC in Electron. Projects open/save like Word documents. Web app keeps existing download/upload flow. Cmd+S saves without dialog once a path is known.

---

## Skipped — Group 27 — Help System *(deferred)*
- Consolidate scattered `?` buttons into a shared `HelpPopover` component. Add a Help nav entry linking to a topic index modal. Optionally: first-time onboarding highlights on first project load (hand-rolled, no library dependency). Design discussion required before implementation.

---

## Done ✓ — Group 28 — Export Fidelity Audit — [full spec](./group-28-plan.md)

Deep audit and fix of HTML and Word exports to match the app's standard and clean rendering exactly. All sessions complete and verified.

- **28A ✓** — Baseline audit
- **28B ✓** — Feature matrix test project
- **28C ✓** — Bug fixes (Sessions 1–4): delivery notes · continuation · reassignments · consecutive SDs · song/dance · inserted SDs · sub-scene divisions · character list · inserted speech green · word-level HTML diff · SD diff columns · line numbers (HTML + Word) · filename date suffix · Word red cuts · Word header/footer
- **28D ✓** — Documentation + PR

---

## Known Issues / Tech Debt

- **React key warning in `CastingManager`** — "Each child in a list should have a unique 'key' prop. Check the render method of `CastingManager`." Reproducible by editing a character-card alias and then switching to a different cast option. All explicit `.map()` calls in `CastingManager.tsx`, `CharacterCard.tsx`, and `CompareCastOptions.tsx` have been audited and carry `key` props; root cause not yet located. Needs browser DevTools inspection with the full component stack to pinpoint the offending list.

---

## Deferred / N/A
- Google Drive backup integration
- **#31 Tableau-style visualization** — character presence / stage time chart using D3 or Recharts
- **`buildEditIndex` traversal** (`components/ScriptEditor/ScriptEditor.tsx`): currently walks all play acts/scenes/units to build `lineToUnit` and `unitOrder` — duplicates the traversal that `computeCuts` already does. The `useEffect` that calls it must run before `unitsByScene` is computed (React hooks must precede conditional returns), so the obvious fix of passing `unitsByScene` is blocked by hook ordering. Deferred: evaluate whether memoizing `computeCuts` before the early-returns or storing `unitsByScene` in a ref is worth the restructuring cost.
