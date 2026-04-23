# Roadmap

## Done ✓

See [CHANGELOG.md](./CHANGELOG.md) for the full history of completed feature groups (Groups 1–24C + Electron packaging).

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

See [CHANGELOG.md](./CHANGELOG.md) for Groups 24B and 24C (completed).

## Done ✓ — Group 24D — Installer & Update UX
- **Installer experience** (`electron-builder.yml`): Windows NSIS `oneClick: false`, desktop + start menu shortcuts, file association for `.sss.json` (double-click opens app).
- **Update UX** (`electron/main.ts`): release notes shown in update dialogs (Mac + Windows); Windows download progress reflected in title bar; `checking-for-update` / `update-not-available` log entries.

## Upcoming — Group 25 — Electron Native File I/O
- **Native open/save** (`electron/main.ts`, `electron/preload.ts`, `ProjectStore.tsx`, `SettingsModal.tsx`): replace web-style import/export with native `dialog.showOpenDialog` / `showSaveDialog` IPC in Electron. Projects open/save like Word documents. Web app keeps existing download/upload flow. Cmd+S saves without dialog once a path is known.

### Group 24E — Help System (design-first, deferred)
- Consolidate scattered `?` buttons into a shared `HelpPopover` component. Add a Help nav entry linking to a topic index modal. Optionally: first-time onboarding highlights on first project load (hand-rolled, no library dependency). Design discussion required before implementation.

---

## Deferred / N/A
- Google Drive backup integration
- **#31 Tableau-style visualization** — character presence / stage time chart using D3 or Recharts
