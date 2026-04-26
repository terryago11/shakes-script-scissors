# Roadmap

## Done ✓

See [CHANGELOG.md](./CHANGELOG.md) for the full history of completed feature groups (Groups 1–24D, Electron packaging, and auto-updates).

---

## Upcoming — Group 25 — Script Polish, Count Audit, Audition Mode & Exports — [implementation plan](./group-25-plan.md)

**25A ✓ Done** — see CHANGELOG for details.

**25B ✓ Done** — see CHANGELOG for details.

**25C — Audition Mode + Suggest Cast Actor Count**
- Named casting snapshots (`CastingSnapshot` type, `castingSnapshots?: CastingSnapshot[]` on `Project`); snapshot bar in Casting page with Save / Switch / Apply / Rename / Delete; "Audition Mode" toggle; persistent "changes won't affect your project until you Apply" banner.
- Desired actor count input in Suggest flow; post-colouring merge (below minimum) and split (above minimum) phases; forced-conflict preview panel.

**25D — Exports: Casting Grid & Line Buddy**
- Printable casting grid HTML (character + actor cards, `@media print`, cut-line borders) triggered from Audition Mode.
- Line Buddy interactive HTML export (per-actor cue-card drill: cue → reveal → advance; Space/arrow key nav; progress bar; shuffle mode; mobile-friendly); ZIP delivery from Cue Scripts tab.

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
- **`buildEditIndex` traversal** (`components/ScriptEditor/ScriptEditor.tsx`): currently walks all play acts/scenes/units to build `lineToUnit` and `unitOrder` — duplicates the traversal that `computeCuts` already does. The `useEffect` that calls it must run before `unitsByScene` is computed (React hooks must precede conditional returns), so the obvious fix of passing `unitsByScene` is blocked by hook ordering. Deferred: evaluate whether memoizing `computeCuts` before the early-returns or storing `unitsByScene` in a ref is worth the restructuring cost.
