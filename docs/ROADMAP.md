# Roadmap

## Done ✓

See [CHANGELOG.md](./CHANGELOG.md) for the full history of completed feature groups (Groups 1–23 + Electron packaging).

---

## Electron desktop app — remaining steps

The packaging pipeline is working (`.app` verified on Mac arm64). What's left before distributing to users:

- **App icon** — need `electron/assets/icon.icns` (Mac) and `electron/assets/icon.ico` (Windows); currently uses the default Electron blue-ball icon
- **Windows build** — `.exe` (NSIS) config is written but untested; needs a Windows machine or GitHub Actions `windows-latest` runner
- **GitHub Release** ⚠️ untested — the full release pipeline (version bump → build → publish → auto-update on a user machine) has not been run end-to-end yet; do a dry run before distributing to real users. Steps to ship:
  1. Bump the version and create a git tag: `npm version patch` (or `minor` / `major`)
  2. Push the tag: `git push --follow-tags`
  3. Build and publish from Mac: `GH_TOKEN=<token> npm run electron:release` → uploads `.dmg` + `latest-mac.yml`
  4. Build and publish from Windows: same command on a Windows machine → uploads `.exe` + `latest.yml`
  - `GH_TOKEN` needs `repo` scope (or use `GITHUB_TOKEN` in GitHub Actions)
  - electron-builder creates the GitHub Release automatically if it doesn't exist; subsequent runs for other platforms add their artifacts to the same release
  - After the first release, `electron-updater` on installed copies will detect `latest-mac.yml` / `latest.yml` and prompt users to update
- **Auto-updates** ✓ — `electron-updater` integrated; uses esbuild to bundle into main.js; prompts "Restart / Later" on update-downloaded; publish config points to GitHub Releases

---

## Upcoming — Groups 24B–24E

### Group 24B — Search & Navigation
- **Search through collapsed sections** (`ScriptEditor.tsx`, `ActBlock.tsx`, `SceneBlock.tsx`): navigating to a match inside a collapsed act/scene leaves it invisible. Fix: lift collapse state to ScriptEditor; auto-expand before scrolling to match.
- **Sticky act/scene context strip** (`ScriptEditor.tsx`): no indicator of current position while scrolling. Fix: render a minimal sticky header below the nav bar showing current act + scene title, driven by the existing `activeSceneId` IntersectionObserver.

### Group 24C — Casting UX
- **Pre-assignment compatibility list** (`CastingManager.tsx`): after assigning Actor X to a character, show an expandable "Who else can this actor play?" list on the chip — compatible unassigned characters (✓) vs conflicts with reason (⚠).
- **Character link terminology + validation** (`CastingManager.tsx`, `CharacterCard.tsx`): rename "Link" → "Must double"; add amber warning on CharacterCard when linked characters are manually assigned to different actors.
- **Fully-removed character integrity check** (`IntegrityChecks.tsx`): add "Fully removed characters" section in Dashboard → Integrity tab — lists characters with all speeches + entrance/exit SDs cut, flagging any remaining non-entrance/exit SD mentions.
- **Line count tooltip** (`LineCountPanel.tsx`): add tooltip explaining that each kept line (including short partial lines) counts as 1. No counting logic changes.

### Group 24D — Electron Native File I/O + Installer
- **Native open/save** (`electron/main.ts`, `electron/preload.ts`, `ProjectStore.tsx`, `SettingsModal.tsx`): replace web-style import/export with native `dialog.showOpenDialog` / `showSaveDialog` IPC in Electron. Projects open/save like Word documents. Web app keeps existing download/upload flow. Cmd+S saves without dialog once a path is known.
- **Installer experience** (`electron-builder.yml`): Windows NSIS — `oneClick: false`, desktop + start menu shortcuts, finish screen. File association for `.sss.json` (double-click opens app). Improved update UX (download notification + restart prompt with release notes).

### Group 24E — Help System (design-first, deferred)
- Consolidate scattered `?` buttons into a shared `HelpPopover` component. Add a Help nav entry linking to a topic index modal. Optionally: first-time onboarding highlights on first project load (hand-rolled, no library dependency). Design discussion required before implementation.

---

## Deferred / N/A
- Google Drive backup integration
- **#31 Tableau-style visualization** — character presence / stage time chart using D3 or Recharts
