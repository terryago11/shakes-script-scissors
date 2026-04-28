# Gotchas

_Persistent error log — append only, never delete._

<!-- entries added here as mistakes are discovered -->
- **Group 25D release**: manually calling `gh release create` after pushing a tag duplicates the draft — `.github/workflows/release.yml` already creates the draft on tag push; read the release workflow before cutting any release. When two drafts exist for the same tag, electron-builder splits assets across them unpredictably — deleting either draft loses the assets uploaded to it; fix by re-running only the affected build job (`gh run rerun <run-id> --job <job-id>`).
- **25C simplify**: `useMemo` cannot be placed after early returns (Rules of Hooks). `naturalMinimum` depends on `speakingChars`/`fullyCutCharIds` computed post-early-return, so it stays as an IIFE — cannot be memoized without restructuring the whole component.
- **25C CompareCastOptions**: initially looked up actors by name (case-insensitive toLowerCase) instead of stable ID — breaks silently on actor rename. Always use `actorId` for actor lookups.
