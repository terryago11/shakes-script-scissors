# Gotchas

_Persistent error log — append only, never delete._

<!-- entries added here as mistakes are discovered -->
- **25C simplify**: `useMemo` cannot be placed after early returns (Rules of Hooks). `naturalMinimum` depends on `speakingChars`/`fullyCutCharIds` computed post-early-return, so it stays as an IIFE — cannot be memoized without restructuring the whole component.
- **25C CompareCastOptions**: initially looked up actors by name (case-insensitive toLowerCase) instead of stable ID — breaks silently on actor rename. Always use `actorId` for actor lookups.
