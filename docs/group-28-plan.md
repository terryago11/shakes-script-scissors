# Group 28 — Export Fidelity Audit

**Goal:** Make HTML and Word exports match the app's "standard" and "clean" rendering exactly — same content, same structure, same styling — so a director's export is indistinguishable in fidelity from what they see on screen.

---

## Confirmed Bugs

| # | Bug | HTML | Word |
|---|-----|------|------|
| 1 | Speech reassignments ignored | Character name always from original | Partially wired; clean mode shows wrong speaker |
| 2 | Delivery notes uppercase | N/A (not rendered) | `renderScriptDocx.ts` lines 138/152/155 call `.toUpperCase()` |
| 3 | Consecutive SDs not exported | Likely filter/skip bug | Expansion produces wrong type |
| 4 | Character header repeated in continuous speech | No continuation detection | No continuation detection |
| 5 | Song/dance indicators absent | Not rendered | Not rendered |
| 6 | Inserted SDs not distinguished | No green indicator | Renders as speech-like block |
| 7 | Edited SD badge missing in clean | Suppression incomplete | (correct — no badge in clean) |
| 8 | Sub-scene divisions absent | Rendered (sub-divider div) | Not implemented |
| 9 | Character list missing from Word | N/A | Not implemented |

---

## Files to Modify

| File | Role |
|------|------|
| `lib/cuts/HtmlExporter.ts` | HTML export — data building + embedded JS render engine |
| `lib/export/renderScriptDocx.ts` | Word export — full-script DOCX renderer |

Reference (ground truth — do not modify):
- `components/ScriptEditor/SpeechBlock.tsx` — speech rendering
- `components/ScriptEditor/SceneBlock.tsx` — continuation detection (lines 145–207)
- `components/ScriptEditor/StageDirectionBlock.tsx` — SD rendering

---

## Sub-Groups

### 28A — Baseline Audit

**Goal:** Establish that the exports are structurally correct before layering in any edits. Export a vanilla play with no cuts and no changes, then verify that every speech and stage direction appears in both exports exactly as the app renders them. Any discrepancy found here is a structural bug that will compound every other test — fix it before proceeding to 28B.

**Steps:**
1. Open Hamlet in the app. Create a new, empty cut with no changes applied.
2. Export HTML (standard mode) and Word (standard mode).
3. Compare to the app's standard view, scene by scene, act by act.
4. Repeat for clean mode exports vs. the app's clean view.
5. Document every discrepancy: missing units, wrong order, wrong text, wrong structure, wrong styling.

**Checklist:**
- [ ] All acts/scenes present in correct order
- [ ] Every speech present with correct speaker name
- [ ] Every SD present with correct text and brackets
- [ ] Inline stage notes (stageNote/stageNotePre) expanded correctly into their own SD blocks
- [ ] No character header repeated within a continuous run of same-speaker speeches
- [ ] Character list appears at top of Word document (all normal, no strikethrough, no color)

---

### 28B — Feature Matrix Test Project

**Goal:** Create a single comprehensive test project that exercises every feature in the app, then export and verify that each feature is rendered identically in HTML and Word in both view modes. This project will be the reference used to verify every 28C fix.

Create one cut of Hamlet named **"Full Feature Test"** that applies the following:

| Feature | Where / How |
|---------|-------------|
| Speech cut | Cut 2–3 speeches in Act 1 Scene 2 |
| Line-level cut | Cut 2–3 lines within a long speech |
| Word cut | Cut a phrase within a kept line |
| Word insert | Insert a bracketed director note within a kept line |
| Speech insert | Insert a whole new speech (director-authored) after an existing speech |
| Speech reassignment (single) | Reassign a HAMLET speech in Act 1 to HORATIO |
| Speech reassignment (multi) | Reassign a DIFFERENT HAMLET speech in Act 2 to two characters simultaneously |
| Speech reassignment (to ALL) | Reassign a third speech (Act 3) to ALL |
| Character alias | POLONIUS → "CHANCELLOR" |
| Delivery note (add) | Add a new delivery note to a speech that has none |
| Delivery note edit | Edit/override a delivery note that already exists on the speech |
| SD text edit (entrance) | Edit the text of an entrance SD |
| SD text edit (business/exit) | Edit the text of a business or exit SD |
| SD cut | Cut a stage direction |
| Inserted SD | Director-created SD inserted after a speech |
| Song flag (speech) | Flag a speech as a song via song tool |
| Dance flag (SD) | Flag an SD as a dance via dance tool |
| Pause | Add an intermission pause after Act 2 |
| Scene reorder | Move one scene to a different position |
| Sub-scene division | Add a sub-scene division marker within a scene |
| Speech split (via split tool) | Use the split/indent tool to split a speech into two consecutive same-speaker parts; also verify part-indent of split part 2 |
| Consecutive SDs | Find a location in Hamlet with two naturally adjacent SDs (e.g., exit followed by entrance) |

**Verification matrix:**

| Feature | HTML Std | HTML Clean | Word Std | Word Clean |
|---------|----------|------------|----------|------------|
| Speech cut | red strike | hidden | red strike | hidden |
| Line cut | red strike | hidden | red strike | hidden |
| Word cut | `<del>` red | hidden | gray strike | hidden |
| Word insert | `<ins>` green | plain text | green underline | plain text |
| Speech insert | inline, green | inline, green | inline, green | inline, green |
| Reassignment (single) | old name strike + new name green | new name only | old name strike + new name green | new name only |
| Reassignment (multi) | both old names strike + new names green | new names only | both old names strike + new names green | new names only |
| Reassignment (to ALL) | old name strike + "ALL" green | "ALL" only | old name strike + "ALL" green | "ALL" only |
| Alias | alias name shown | alias name shown | alias name shown | alias name shown |
| Delivery note (add) | lowercase italic | lowercase italic | lowercase italic | lowercase italic |
| Delivery note edit | updated text, lowercase italic | updated text, lowercase italic | updated text, lowercase italic | updated text, lowercase italic |
| SD text edit (entrance) | green border + "edited" badge | no badge | green color | no badge |
| SD text edit (business/exit) | green border + "edited" badge | no badge | green color | no badge |
| SD cut | red strike | hidden | gray strike | hidden |
| Inserted SD | inline, green indicator | inline | inline, green | inline |
| Song SD | `♪` + violet | `♪` + violet | `♪` prefix violet | `♪` prefix violet |
| Dance SD | `⊛` + cyan | `⊛` + cyan | `⊛` prefix cyan | `⊛` prefix cyan |
| Song speech | `♪` before name, lines violet italic | `♪` before name, lines violet italic | `♪` prefix violet, lines italic | `♪` prefix violet, lines italic |
| Continuation (natural) | italic "(cont.)" | header hidden | italic "(cont.)" | header hidden |
| Continuation (split tool) | italic "(cont.)", part-2 indent correct | header hidden, part-2 indent correct | italic "(cont.)", part-2 indent correct | header hidden, part-2 indent correct |
| Consecutive SDs | separate SD blocks | separate SD blocks | separate SD paragraphs | separate SD paragraphs |
| Scene reorder | correct order | correct order | correct order | correct order |
| Sub-scene division | PART A / PART B divider shown | PART A / PART B divider shown | PART A / PART B divider shown | PART A / PART B divider shown |
| Pause | pause block after scene | pause block after scene | pause paragraph after scene | pause paragraph after scene |
| Character list (Word only) | N/A | N/A | all chars listed; cut-only chars gray strike; aliased chars show alias in green | same |

---

### 28C — Bug Fixes

One commit per fix. Verify with test project from 28B before committing.

#### 28C-1: Delivery note case (Word)
- **File:** `lib/export/renderScriptDocx.ts` lines 138, 152, 155
- **Fix:** Remove `.toUpperCase()`. Render text as-is from `cut.deliveryNoteEdits[id]` or `speech.deliveryNote`. Keep `italics: true`. No color override for normal speeches (app renders delivery notes in stone-400 ≈ #78716c italic).
- **Verify:** Word export, speech with delivery note → lowercase italic in standard and clean.

#### 28C-2: Character header continuation suppression (Both)
- **Reference algorithm:** `SceneBlock.tsx` lines 145–207
- **Rules:**
  - Track `lastKeptSpeakerId` across units in scene
  - Only kept units count (cuts don't reset the tracker)
  - Use effective speaker after reassignment
  - ALL speeches break continuation
  - Multi-speaker (`characterIds.length > 1`) breaks continuation
  - Split `:s2` parts continue from their `:s1` parent
- **HTML:** Tag each unit with `isContinuation: boolean` in `buildScriptData`. In `renderUnit`: suppress char-name div when `isContinuation && mode === 'clean'`; render italic `(cont.)` when `isContinuation && mode !== 'clean'`.
- **Word:** Same detection in the scene loop in `renderScriptDocx.ts`. Replace speaker label paragraph with an italic `(cont.)` paragraph in standard; omit label entirely in clean.
- **Split tool case:** Split `:s2` must inherit continuation from its `:s1` parent. The part-2 indent (from `partIndentChars`) must be preserved in both exports.
- **Verify:** Normal continuation, continuation through a cut (must still continue), split-tool continuation with part indent, reassigned continuation, continuation broken by ALL.

#### 28C-3: Speech reassignments in HTML (Standard mode)
- **File:** `lib/cuts/HtmlExporter.ts`
- **Issue:** `buildScriptData` resolves `effectiveSpeakers` from `speechReassignments` but `originalSpeakers` is not preserved separately in the data for the rendering engine to show the struck-through old name.
- **Fix:** Emit both `originalSpeaker` and `effectiveSpeaker` (plus `hasReassignment: boolean`) on each speech unit. In `renderUnit` standard mode: output original speaker span with strikethrough red + new speaker span in green. In clean mode: output only effective speaker. Handle multi-speaker arrays and ALL correctly.
- **Verify:** HTML standard shows old name struck + new name green. HTML clean shows new name only. Multi-speaker and ALL both correct.

#### 28C-4: Consecutive SDs (Both)
- **Reproduce:** Find a location in Hamlet with two naturally adjacent SDs (exit + entrance at a scene transition). Export both formats. Identify exact failure mode.
- **HTML diagnosis:** Add logging to `getUnitStatus` and `renderUnit` for each SD in sequence. Check if filter condition skips second SD or if there is an ID collision.
- **Word diagnosis:** Log the expanded unit stream after `expandStageNotes`. Verify each SD unit has `type: "stage"` and a unique ID.
- **Fix:** Patch whatever filter/condition causes the second SD to be dropped or mistyped.
- **Verify:** Both SDs appear as separate correctly-styled blocks in all modes.

#### 28C-5: Song/dance indicators (Both)
- **Reference:** `StageDirectionBlock.tsx` lines 145–175, `SpeechBlock.tsx` lines 299–301
- **Flag resolution:** `isSong = (cut.sdFlagOverrides?.[id]?.isSong ?? stage.isSong) === true` (same for isDance)
- **HTML:** In `buildScriptData`, add `isSong`, `isDance` to each unit. In `renderUnit` for SDs: prefix bracketed text with `♪ ` (violet `#7c3aed`) or `⊛ ` (cyan `#0891b2`). For song speeches: add `♪` before speaker name, render lines in violet italic.
- **Word:** For song SDs: add violet TextRun `♪ ` before the bracket. For dance SDs: add cyan `⊛ `. For song speeches: add violet `♪ ` TextRun before speaker label; apply italic to speech lines.
- **Verify:** Song SD, dance SD, and song speech all render correctly in standard and clean for both formats.

#### 28C-6: Inserted SDs (Both)
- **Issue:** `expandInsertions` handles inserted speeches (via `cut.insertions`) but director-inserted stage directions (`cut.insertedSDs`) may follow a different code path. Verify both are included in the expanded unit stream with correct type.
- **HTML fix:** Emit `isInserted: true` on inserted SD units. In `renderUnit`, apply a green left-border or indicator (matching the edited SD badge pattern) in standard mode. In clean mode, render without green indicator (it's a director addition, so it stays; just drop the "inserted" marker).
- **Word fix:** Render inserted SDs as centered italic paragraphs in green (#1d6b38), not as speech blocks.
- **Verify:** Inserted SD appears at correct position with green styling in standard; appears as a plain SD paragraph (gray, centered, italic) in clean.

#### 28C-7: Sub-scene division in Word export
- **Issue:** The HTML exporter already renders sub-dividers (`<div class="sub-divider">` with PART A / PART B labels). The Word exporter has no equivalent.
- **File:** `lib/export/renderScriptDocx.ts`
- **Fix:** After processing units, detect subdivision boundaries from `cut.sceneSubdivisions`. When a subdivision boundary is reached, insert a centered paragraph styled like a scene title that reads e.g. "— Part A —", "— Part B —" using the same PART_LABELS (`A`, `B`, `C`…) as the HTML exporter.
- **Verify:** Sub-scene division appears in Word export at the correct position in both standard and clean modes.

#### 28C-8: Character list at top of Word document
- **New feature.** After the title block and before the first act, insert a cast list.
- **File:** `lib/export/renderScriptDocx.ts`
- **Source of truth:** `play.castList` (all characters in the play). Filter using `cut.cutMap`: a character is "fully cut" if every speech attributed to them (across all scenes) is cut. An alias exists when `cut.characterAliases[charId]` is set.
- **Rendering:**
  - Section heading: "Characters" (HeadingLevel.HEADING_2, or a plain bold paragraph)
  - One paragraph per character, left-aligned, size 24 (12pt)
  - Normal character: character name (or alias if set), black
  - Aliased character: alias name in green (#1d6b38), original name in gray (#888888) in parentheses after — e.g. "Chancellor (Polonius)"
  - Fully-cut character: name in gray (#aaaaaa) with strikethrough
  - Order: follow `play.castList` order
- **Verify:** Character list appears at top. Aliased chars show alias in green. Fully-cut chars are gray strikethrough. Normal chars are black.

---

### 28D — Documentation + PR

After all 28C fixes verified:
1. Update `docs/CHANGELOG.md` with Group 28 entries.
2. Mark Group 28 done in `docs/ROADMAP.md`.
3. Ship PR.

---

## Verification Protocol (Per Fix)

1. `npm run dev` (via nvm node path)
2. Open test project → "Full Feature Test" cut (28B)
3. Export HTML → open in browser → verify standard then clean
4. Export Word → open in Word or LibreOffice → verify standard then clean
5. Compare side by side with app screen
6. `npx tsc --noEmit`
7. `npm run lint`

---

## Troubleshooting

### Data not reaching the renderer
- **HTML:** `console.log(JSON.stringify(window.__SCRIPT__, null, 2))` in DevTools — check unit data fields.
- **Word:** Add `console.error` before render in the route handler — verify cut data arriving correctly.

### Expansion issues (consecutive SDs, stageNotes)
- Log the unit stream after each expansion step: `expandSplits` → `expandInsertions` → `expandStageNotes`.
- Compare to `SceneBlock.tsx`'s `expandedUnits` computation.

### Continuation detection wrong
- `SceneBlock.tsx` lines 145–207 is ground truth. Port exactly, don't rewrite.
- Key edge case: a cut speech between two same-speaker speeches must NOT break continuation (only kept units count).
- Split tool edge case: `:s2` units must inherit continuation from their `:s1` parent — they are not independent speeches.

### Word styling reference
- `docx` font size is in half-points: `size: 24` = 12pt, `size: 18` = 9pt.
- Colors: 6-digit hex without `#`.
- Italic/bold/strike: boolean flags on `TextRun`.

### HTML rendering reference
- The render engine is an embedded JS template string in `HtmlExporter.ts` (~lines 367–529).
- Fields added in `buildScriptData` must also be read in `renderUnit` — the template has no type checking.
- When changing data shape, also update `window.__SCRIPT__` field in the client-side script block.
