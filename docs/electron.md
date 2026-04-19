# Electron Desktop App

## Commands

```bash
npm run electron:build    # Full build: next build → cp -rL standalone → esbuild → electron-builder
npm run electron:release  # Same as build, but publishes artifacts to GitHub Releases (needs GH_TOKEN)
npm run electron:dev      # Bundle main.ts with esbuild then open Electron window (spawns next dev automatically)
npm run electron:typecheck # TypeScript type-check electron/main.ts (no emit)
```

## Key Conventions

- `next.config.ts` has `output: "standalone"` — required for Electron packaging; do not remove.
- `electron:build` creates `.next/standalone-resolved` (a symlink-dereferenced copy via `cp -rL`) before calling electron-builder. This step is necessary because electron-builder's `extraResources` silently strips `node_modules` and `.next` directories; the `afterPack` hook (`electron/afterPack.js`) copies them manually instead.
- `electron/main.ts` is compiled by **esbuild** (not tsc) via `electron:bundle`. esbuild bundles `electron-updater` and all its deps into the single `electron/main.js` output — this is required because `electron-builder.yml` excludes `node_modules` from the ASAR. `tsconfig.electron.json` is type-check-only (`noEmit: true`).
- `electron/main.js` (bundled from `main.ts`) and `dist-electron/` are gitignored.
- Icons live in `electron/assets/` — `icon.icns` (macOS), `icon.png` (Linux), `icon.ico` (Windows). Regenerate from `icon.svg` via `bash scripts/generate-icons.sh` (uses macOS built-ins; `brew install imagemagick` for `.ico`).
- Auto-updates: `electron-updater` checks for new GitHub Releases on startup (production only).
  - **Windows**: downloads the new installer in the background; shows "Restart / Later" dialog when done; installs silently on restart.
  - **macOS**: app is not code-signed, so Squirrel.Mac rejects unsigned installs. Instead, shows "Version X.X.X is available" dialog with a "Download" button that opens the GitHub Releases page. User manually installs the new `.dmg`.
  - Logs: macOS → `~/Library/Logs/shakes-script-scissors/main.log`; Windows → `%APPDATA%\ShakesScriptScissors\logs\main.log`.

## Smoke Test

1. `npm run electron:build` → open `dist-electron/ShakesScriptScissors-<version>-arm64.dmg` → drag to Applications.
2. Launch — play selector should appear, no login prompt (auth disabled in desktop build).
3. Check auto-update: `log stream --predicate 'process == "ShakesScriptScissors"'` — expect `[updater] checkForUpdates` succeeding or a non-fatal 404 (no release yet). Both are fine.
4. Cmd+Q should exit cleanly (Next.js server terminated by `before-quit` handler).

## Publishing a Release

Releases are built by the `release.yml` GitHub Actions workflow, triggered by any `v*` tag. Do **not** run `electron:release` locally.

```bash
# 1. Merge all changes to main first, then:
npm version patch          # or minor / major — bumps package.json + creates git tag
git push origin tag v<x.y.z>   # triggers the Release workflow on GitHub Actions
```

2. The workflow builds macOS (arm64 + x64 DMG + ZIP) and Windows (NSIS) in parallel and uploads artifacts as a draft release.
3. Go to the repo's **Releases page**, open the draft, and click **Publish release** — this makes auto-update live for existing users.

> The macOS `.zip` target is required alongside `.dmg` — `electron-updater` needs it to detect the update (even though it can't install it automatically on unsigned builds).
