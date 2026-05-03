# Gotchas

_Persistent error log — append only, never delete._

<!-- entries added here as mistakes are discovered -->
- **Group 25D release**: manually calling `gh release create` after pushing a tag duplicates the draft — `.github/workflows/release.yml` already creates the draft on tag push; read the release workflow before cutting any release. When two drafts exist for the same tag, electron-builder splits assets across them unpredictably — deleting either draft loses the assets uploaded to it; fix by re-running only the affected build job (`gh run rerun <run-id> --job <job-id>`).
- **25C simplify**: `useMemo` cannot be placed after early returns (Rules of Hooks). `naturalMinimum` depends on `speakingChars`/`fullyCutCharIds` computed post-early-return, so it stays as an IIFE — cannot be memoized without restructuring the whole component.
- **25C CompareCastOptions**: initially looked up actors by name (case-insensitive toLowerCase) instead of stable ID — breaks silently on actor rename. Always use `actorId` for actor lookups.
- **25D casting sheet PDF**: replacing the `window.open`+`document.write` approach left `lib/cuts/CastingGridExporter.ts` with no importers — it is now dead code; delete it or repurpose before the next refactor pass.
- **25D casting sheet PDF**: `useState` placed after an early return in `CastingManager` — ESLint `react-hooks/rules-of-hooks` error. Always add new `useState` calls with the other state declarations at the TOP of the component, before any early returns.
- **Group 28 simplify**: inlined date-suffix logic used `_`-prefixed variable names (`_now`, `_dd`, etc.) — underscore prefix conventionally means "unused" in TypeScript; the correct fix is to extract to a shared `exportDateSuffix()` utility and call it directly.
- **Group 29**: `git diff origin/main -- app/projects/[projectId]/layout.tsx` fails in zsh with "no matches found" because zsh expands `[...]` as a glob. Always quote paths containing brackets: `'app/projects/[projectId]/layout.tsx'`.
- **Group 29**: the preview browser cannot navigate to `file://` URLs or serve a test HTML from a separate port (middleware intercepts). To verify a generated HTML file, write a tsx script using `parseTei` + the builder + the exporter and check the output structurally — or write the file to `/public/` then delete after inspection.
- **Group 29**: `expandInsertedSDs` existed in `expandUtils.ts` but was not called in `getEffectiveUnitsInOrder` in `CutEngine.ts` — inserted SDs were silently missing from cue scripts. Always verify that all `cut.*` expansion helpers are wired into every traversal point.
