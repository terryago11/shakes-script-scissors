---
name: ship-docs
description: Use this skill when the user says "ship docs", "update docs", "document what we did", "write up the changelog", "update the roadmap", "push a docs PR", or any variation of wrapping up a feature group with documentation and a PR. This skill reads the current session context and git diff, updates CLAUDE.md / docs / README / CHANGELOG / ROADMAP following the project's doc rules, creates a commit and PR, then asks about merging and releasing.
version: 1.0.0
---

# ship-docs

Wraps up a feature group: updates all project documentation, commits, pushes a PR, and walks through merge + release.

---

## Step 0 — Offer /simplify

Ask the user: "Do you want to run `/simplify` first to clean up the implementation before documenting it?"

- If yes: invoke `/simplify` and wait for it to complete before continuing.
- If no: continue immediately.

---

## Step 1 — Gather context

Collect everything needed to write accurate docs.

1. **Plan file**: find the most recently modified `.md` in `/Users/terryago/.claude/plans/` and read it. This describes what was intended.
2. **Git diff**: run `git diff --name-only origin/main` to see exactly which files changed. Then run `git diff origin/main -- <key changed files>` to understand the substance of the changes.
3. **Existing docs**: read all of these files in full — always read `CLAUDE.md` first before editing any file, as it contains critical conventions:
   - `CLAUDE.md`
   - `gotchas.md` — review for mistakes made this session that should be logged; also note any pre-existing entries relevant to the work
   - `README.md`
   - `docs/CHANGELOG.md`
   - `docs/ROADMAP.md`
   - `docs/FEATURES.md`
   - `docs/USER_GUIDE.md`
   - `docs/GETTING_STARTED.md`
   - `docs/architecture.md`
   - `docs/electron.md`

---

## Step 2 — Analyse

Before writing anything, produce a short internal summary (no need to show the user) categorising every change:

| Change | CLAUDE.md? | docs? | CHANGELOG? | ROADMAP done? |
|--------|-----------|-------|-----------|--------------|
| ...    | ...       | ...   | ...       | ...          |

Rules for categorisation:
- **CLAUDE.md-worthy**: new key file, new critical convention, new `Cut` field that must be in `CutSchema`, new architecture constraint
- **docs-worthy**: any user-facing feature, new UI, new workflow, new export, new dashboard tab, new setting
- **CHANGELOG**: everything
- **ROADMAP done**: any group or deferred item that was completed

---

## Step 2B — Update gotchas.md

**Rules — append-only, never delete entries.**

Add a one-line entry for any mistake made during this session:
- Wrong assumption that caused a broken build or silent failure
- Forgotten convention that had to be corrected mid-session
- Technical constraint that tripped up an otherwise-correct plan (e.g. Rules of Hooks blocking memoization)
- Anything that wasted time or would waste time again next session

Format: `- **GroupN**: one sentence describing the mistake and the correct behaviour.`

Also include gotchas.md in the git add in Step 8 even if you add no new entries (the file should always be staged to catch any entries added earlier in the session).

---

## Step 3 — Update CLAUDE.md

**Rules — keep it lean, mission-critical only.**

Add entries only for:
- New files in the Key Files table
- New critical conventions (auth, parsing edge cases, data model invariants)
- New `Cut` fields that must also be registered in `CutSchema` in `projectIO.ts`
- New data model fields on `Play`, `Speech`, `StageDirection`, or `Line`

Do NOT add:
- Feature descriptions or UX walkthroughs (those belong in `docs/`)
- Temporary debugging notes
- Anything already obvious from reading the code

When in doubt, lean toward trimming rather than adding.

---

## Step 4 — Update docs/ files

**Rules — fully detailed, no length limit.**

Update each file only if relevant:

- **`docs/FEATURES.md`** — add new features to existing table sections; add new sections if a whole new capability area was introduced
- **`docs/USER_GUIDE.md`** — add a prose walkthrough for any new user-facing workflow or tool; update existing sections if behaviour changed
- **`docs/GETTING_STARTED.md`** — only update if the onboarding flow changed (new install step, new first-launch experience, etc.)
- **`docs/architecture.md`** — update if new engines, new key files, or structural changes to component layout
- **`docs/electron.md`** — update if Electron packaging, build commands, auto-update flow, installer config, or release steps changed

---

## Step 5 — Update README.md

**Rules — slim, points elsewhere.**

Only update if:
- A new doc file was added → add a row to the Documentation table
- The tech stack changed → update the Tech Stack section
- Known Limitations changed → update that section
- Platform/download instructions changed

Do NOT duplicate feature descriptions. Link to `docs/USER_GUIDE.md` instead.

---

## Step 6 — Update docs/CHANGELOG.md

Add a new top-level bullet under `## Done ✓` at the **top** of the list (most recent first).

Format — mirror existing entries exactly:
```
- **Group N — Title**: summary of every significant change; mention file paths for non-obvious locations; sub-bullets for bug fixes.
```

Be thorough — every changed behaviour should appear here. This is the permanent record.

---

## Step 7 — Update docs/ROADMAP.md

- **Completed groups**: remove their `## Upcoming — Group N` section entirely. Do not leave a stub or "Done" marker — completed groups live in CHANGELOG only.
- **Completed deferred items**: remove them from `## Deferred / N/A`.
- **Temp plan file references**: if ROADMAP has a note like `*(temp — summarize in CHANGELOG.md and delete after implementation)*`, remove that note along with the group section once it's been documented.

---

## Step 8 — Commit and create PR

**Important**: `main` is branch-protected — direct pushes are rejected. Always work on a feature branch.

```bash
export PATH="$HOME/.nvm/versions/node/v22.9.0/bin:$PATH"
export PATH="/opt/homebrew/bin:$PATH"

# Create a feature branch for the docs PR (from current HEAD, which is already on a feature branch or main)
git checkout -b docs/group-N-<short-title>

git add CLAUDE.md README.md gotchas.md docs/
git commit -m "docs: update CLAUDE.md, docs, CHANGELOG, ROADMAP for Group N"
git push -u origin docs/group-N-<short-title>

gh pr create \
  --title "docs: Group N — <short title> documentation" \
  --body "$(cat <<'EOF'
## Summary
- Updated CLAUDE.md: <what changed>
- Updated docs/FEATURES.md, USER_GUIDE.md: <what was added>
- CHANGELOG: added Group N entry
- ROADMAP: removed completed Group N section

## No code changes
Documentation-only PR.

🤖 Generated with [Claude Code](https://claude.ai/code)
EOF
)"
```

Report the PR URL to the user. **Do not switch back to `main` after pushing** — leave the working directory on the docs branch so the user can inspect or amend before the PR is merged.

---

## Step 9 — Merge and release

Ask the user: "PR is up at [URL]. Do you want to wait for CI to pass and then merge? And do you want to cut a release, or wait?"

### If merging

First check whether auto-merge is enabled:
```bash
export PATH="/opt/homebrew/bin:$PATH"
gh repo view --json autoMergeAllowed
```

- **`autoMergeAllowed: true`**: run `gh pr merge --squash --auto [URL]`
- **`autoMergeAllowed: false`**: tell the user auto-merge is off and offer to enable it:
  ```bash
  gh api repos/terryago11/shakes-script-scissors --method PATCH --field allow_auto_merge=true
  ```
  Then re-run `gh pr merge --squash --auto [URL]`.

### If cutting a release

1. **Draft release notes** based on the CHANGELOG entry just written. Show the user a markdown block in this format:

```markdown
## What's New in vX.Y.Z

### Group N — Title
- Feature 1: one-line description
- Feature 2: one-line description
- Bug fix: description
```

The CI workflow (`release-notes` job) will automatically prepend a download table above this text — do not include an Installation section in the draft notes.

Also recommend a version bump: patch for bug fixes / small features; minor for a named feature group; major for breaking changes or a milestone release.

2. Ask the user to confirm or edit the draft.

3. Once confirmed, run:
```bash
export PATH="$HOME/.nvm/versions/node/v22.9.0/bin:$PATH"
export PATH="/opt/homebrew/bin:$PATH"

# Bump version in package.json and create git tag locally
npm version patch   # or minor / major per recommendation
# NOTE: do NOT git push directly — main is branch-protected.
# Route the version bump through a PR instead:
git checkout -b chore/bump-vX.Y.Z
git push -u origin chore/bump-vX.Y.Z
gh pr create --title "chore: bump version to vX.Y.Z" --body "Version bump for Group N release."
gh pr merge --squash --auto

# After the PR merges, reset local main and retag the squash commit:
git checkout main && git reset --hard origin/main
git tag vX.Y.Z
git push origin vX.Y.Z
```

**STOP after pushing the tag.** Do NOT run `gh release create` manually.

`.github/workflows/release.yml` fires on every `v*` tag push and:
1. Creates the draft release automatically (`create-release` job)
2. Builds and attaches the macOS DMG and Windows EXE installers (`release` job)
3. Prepends the download table to the release body (`release-notes` job)

After the tag is pushed, write the release notes to `/tmp/release-notes.md` and apply them to the **workflow-created** draft (never create a second one):

```bash
# Find the workflow-created draft (it will have an empty body)
RELEASE_ID=$(gh api repos/terryago11/shakes-script-scissors/releases \
  --jq '[.[] | select(.draft==true and .tag_name=="vX.Y.Z")] | sort_by(.id) | first | .id')

cat > /tmp/release-notes.md << 'NOTES'
<confirmed release notes here>
NOTES

gh api repos/terryago11/shakes-script-scissors/releases/$RELEASE_ID \
  --method PATCH \
  --field "body=$(cat /tmp/release-notes.md)"
```

Then report the draft release URL (`https://github.com/terryago11/shakes-script-scissors/releases/tag/vX.Y.Z`) to the user. The user will publish manually once the CI-attached installer assets appear.

**Never** call `gh release create` after pushing a tag — it creates a duplicate draft. If you accidentally do, immediately delete the duplicate (the one with your notes body) and patch your notes onto the workflow-created draft (the one with the empty body).
