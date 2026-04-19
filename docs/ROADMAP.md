# Roadmap

## Done ✓

See [CHANGELOG.md](./CHANGELOG.md) for the full history of completed feature groups (Groups 1–23 + Electron packaging).

---

## Electron desktop app — remaining steps

The packaging pipeline is working (`.app` verified on Mac arm64). What's left before distributing to users:

- **App icon** — need `electron/assets/icon.icns` (Mac) and `electron/assets/icon.ico` (Windows); currently uses the default Electron blue-ball icon
- **Windows build** — `.exe` (NSIS) config is written but untested; needs a Windows machine or GitHub Actions `windows-latest` runner
- **GitHub Release** — run `npm run electron:build` on both Mac and Windows, upload `.dmg` + `.exe` to a GitHub Release so users can download
- **Auto-updates** — add `electron-updater` so users are prompted when a new version is out (optional, can add when first release ships)

---

## Deferred / N/A
- Google Drive backup integration
- **#31 Tableau-style visualization** — character presence / stage time chart using D3 or Recharts
