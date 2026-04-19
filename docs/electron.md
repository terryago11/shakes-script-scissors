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
- Auto-updates: `electron-updater` checks for new GitHub Releases on startup (production only). When a download completes, a "Restart / Later" dialog appears.

## Smoke Test

1. `npm run electron:build` → open `dist-electron/ShakesScriptScissors-<version>-arm64.dmg` → drag to Applications.
2. Launch — play selector should appear, no login prompt (auth disabled in desktop build).
3. Check auto-update: `log stream --predicate 'process == "ShakesScriptScissors"'` — expect `[updater] checkForUpdates` succeeding or a non-fatal 404 (no release yet). Both are fine.
4. Cmd+Q should exit cleanly (Next.js server terminated by `before-quit` handler).

## Publishing a Release

1. Create a GitHub PAT with `repo` scope.
2. `npm version patch` — bumps `package.json` + creates a git tag.
3. `GH_TOKEN=<token> npm run electron:release` — builds and uploads artifacts.
4. Go to the repo's Releases page and publish the draft to make auto-update live.
