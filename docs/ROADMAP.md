# Roadmap

## Done ✓

See [CHANGELOG.md](./CHANGELOG.md) for the full history of completed feature groups (Groups 1–24D, Electron packaging, and auto-updates).

---

**Group 25 ✓ Done** — Script Polish, Count Audit, Audition Mode & Exports — see CHANGELOG for details.

**Group 28 ✓ Done** — Export Fidelity Audit — see CHANGELOG for details.

**Group 29 ✓ Done** — Cue Script Improvements — see CHANGELOG for details.

**Group 30 ✓ Done** — Mixed improvements — see CHANGELOG for details.

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
- **On Stage sidebar — per-entrance/exit granularity**: currently updates per scene boundary (one snapshot per scene via `computeOnStageByScene`). Finer tracking would require snapshotting after every entrance/exit SD and a unit-level IntersectionObserver (currently only `id="scene-${sceneId}"` anchors exist). Would need `data-unit-id` scroll observers added to `SceneBlock` to know the reader's current position within a scene.
- **#31 Tableau-style visualization** — character presence / stage time chart using D3 or Recharts
- **`buildEditIndex` traversal** (`components/ScriptEditor/ScriptEditor.tsx`): currently walks all play acts/scenes/units to build `lineToUnit` and `unitOrder` — duplicates the traversal that `computeCuts` already does. The `useEffect` that calls it must run before `unitsByScene` is computed (React hooks must precede conditional returns), so the obvious fix of passing `unitsByScene` is blocked by hook ordering. Deferred: evaluate whether memoizing `computeCuts` before the early-returns or storing `unitsByScene` in a ref is worth the restructuring cost.
