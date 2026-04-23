# Roadmap

## Done ✓

See [CHANGELOG.md](./CHANGELOG.md) for the full history of completed feature groups (Groups 1–24D, Electron packaging, and auto-updates).

---

## Upcoming — Group 25 — Suggest Cast: Desired Actor Count — [implementation plan](./group-25-plan.md) *(temp — summarize in CHANGELOG.md and delete after implementation)*

Add a "Desired # of actors" number input (min 4, max 20) to the Suggest Cast flow.

- **Natural minimum pre-computed** (`CastingManager.tsx`): computed on mount and whenever `activeCut`/`play` changes via `useEffect`; shown as the default value in the input so the director always sees an up-to-date recommendation before clicking Suggest.
- **Too few actors — forced merges** (`CastingUtils.ts`): if the target is below the algorithm's natural minimum, a post-colouring merge phase greedily merges actor groups by lowest shared stage time (new `computePairwiseSharedMinutes` helper in `StageTimeEngine.ts`). Forced conflicts reported back to UI.
- **Too many actors — splits** (`CastingUtils.ts`): if the target exceeds the natural minimum, characters are split off from crowded groups into solo slots (always legal). If the target exceeds the total number of parts in the play, an amber warning flags that some actors will be unassigned.
- **New return type** (`SuggestResult`): `{ assignments, forcedConflicts, naturalMinimum }` — replaces the previous bare array return.
- **Preview panel**: amber warning banner lists forced conflicts (character names + shared minutes) when count is below minimum; unassigned-actors banner when count exceeds total parts.
- **Help text update**: new "Desired actor count" subsection in the `?` panel explaining all three cases.

---

## Upcoming — Group 26 — Electron Native File I/O
- **Native open/save** (`electron/main.ts`, `electron/preload.ts`, `ProjectStore.tsx`, `SettingsModal.tsx`): replace web-style import/export with native `dialog.showOpenDialog` / `showSaveDialog` IPC in Electron. Projects open/save like Word documents. Web app keeps existing download/upload flow. Cmd+S saves without dialog once a path is known.

---

## Upcoming — Group 27 — Help System
- Consolidate scattered `?` buttons into a shared `HelpPopover` component. Add a Help nav entry linking to a topic index modal. Optionally: first-time onboarding highlights on first project load (hand-rolled, no library dependency). Design discussion required before implementation.

---

## Deferred / N/A
- Google Drive backup integration
- **#31 Tableau-style visualization** — character presence / stage time chart using D3 or Recharts
