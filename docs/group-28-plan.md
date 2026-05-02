# Group 28 — Export Fidelity Audit

**Goal:** Make HTML and Word exports match the app's "standard" and "clean" rendering exactly — same content, same structure, same styling — so a director's export is indistinguishable in fidelity from what they see on screen.

---

## Confirmed Bugs

| # | Bug | HTML | Word | Status |
|---|-----|------|------|--------|
| 1 | Speech reassignments ignored | Character name always from original | Partially wired; clean mode shows wrong speaker | ✅ Done (28C-3) |
| 2 | Delivery notes uppercase | N/A (not rendered) | `.toUpperCase()` calls | ✅ Done (28C-1) |
| 3 | Consecutive SDs not exported | Likely filter/skip bug | Expansion produces wrong type | ✅ Done (28A — expandStageNotes in pipeline; no collision confirmed) |
| 4 | Character header repeated in continuous speech | No continuation detection | No continuation detection | ✅ Done (28C-2) |
| 5 | Song/dance indicators absent | Not rendered | Not rendered | ✅ Done (28C-5) |
| 6 | Inserted SDs not distinguished | No green indicator | Not in stream at all | ✅ Done (28C-6) |
| 7 | Edited SD badge missing in clean | Suppression incomplete | (correct — no badge in clean) | ✅ Done (28C-3 session — confirmed clean mode already gates correctly) |
| 8 | Sub-scene divisions absent | Rendered (sub-divider div) | Not implemented | ✅ Done (28C-7) |
| 9 | Character list missing from Word | N/A | Not implemented | ✅ Done (28C-8) |

---

## Files to Modify

| File | Role |
|------|------|
| `lib/cuts/HtmlExporter.ts` | HTML export — data building + embedded JS render engine |
| `lib/export/renderScriptDocx.ts` | Word export — full-script DOCX renderer |
| `lib/cuts/expandUtils.ts` | Shared expansion pipeline |

Reference (ground truth — do not modify):
- `components/ScriptEditor/SpeechBlock.tsx` — speech rendering
- `components/ScriptEditor/SceneBlock.tsx` — continuation detection (lines 145–207)
- `components/ScriptEditor/StageDirectionBlock.tsx` — SD rendering

---

## Sub-Groups

### 28A — Baseline Audit ✅

**What was found and fixed:** `HtmlExporter.ts` was not calling `expandStageNotes`, so inline stageNote SDs (e.g. mid-speech `[aside]` blocks) were never emitted as separate SD units. Fixed by wrapping the expansion pipeline:

```typescript
const expandedUnits = expandInsertedSDs(
  expandStageNotes(
    expandInsertions(expandSplits(info.units, cut.speechSplits), cut.insertions, play.castList)
  ),
  cut.insertedSDs
);
```

The Word exporter already called `expandStageNotes` — no Word change needed for this.

**Checklist (verify with vanilla Hamlet export):**
- [x] `expandStageNotes` now in HTML pipeline
- [ ] All acts/scenes present in correct order
- [ ] Every speech present with correct speaker name
- [ ] Every SD present with correct text and brackets
- [ ] Inline stage notes expanded correctly into their own SD blocks
- [ ] No character header repeated within a continuous run (requires 28C-2)
- [ ] Character list appears at top of Word document (requires 28C-8 ✅)

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

#### 28C-1: Delivery note case (Word) ✅

**Fix:** Removed `.toUpperCase()` from both delivery note `TextRun` objects in `renderScriptDocx.ts` (reassignment branch line ~138, normal branch line ~152). Kept `italics: true`.

---

#### 28C-2: Character header continuation suppression (Both) ✅ — Session 2 (2026-05-01)

**Reference algorithm:** `SceneBlock.tsx` lines 145–207. Ported exactly — do not rewrite.

**What was done:**

*`lib/cuts/HtmlExporter.ts`:*
- Added `isContinuation?: boolean` and `lineIndents?: number[]` to `UnitData` interface
- Refactored `keptLines` computation into `keptLinePairs` (pairs of `{ text, indent }`) so `partIndentChars` is captured in one pass, then split into `keptLines` and `lineIndents`
- Inserted continuation detection block after `expandedUnits` is built, before the main loop — exact TypeScript port of `SceneBlock.tsx` lines 145–207, scoped per scene, no `showOriginal` mode
- `units.push` for speeches now sets `isContinuation: continuationIds.has(rawUnit.id)` and `lineIndents`
- Embedded JS `renderUnit` — character name block updated:
  ```javascript
  var name;
  if(u.isContinuation){
    if(mode==='clean'){name='';}
    else{name='<div class="char-name" style="font-style:italic;font-weight:normal">(cont.)</div>';}
  }else{
    name='<div class="char-name">'+esc(u.characterName)+'</div>';
  }
  ```
- Embedded JS line rendering updated to apply `padding-left:{n}ch` for part-indented lines:
  ```javascript
  lines=u.keptLines.map(function(l,i){
    var ind=u.lineIndents&&u.lineIndents[i]?'padding-left:'+u.lineIndents[i]+'ch':'';
    return ind?'<div style="'+ind+'">'+esc(l)+'</div>':'<div>'+esc(l)+'</div>';
  }).join('');
  ```

*`lib/export/renderScriptDocx.ts`:*
- Same detection block inserted per scene after `sceneUnits` is built, before `for (const unit of sceneUnits)` — uses `isUnitCut()` for cut status
- `const isContinuation = continuationIds.has(speech.id)` computed in the speech block
- Unconditional label push replaced with:
  ```typescript
  if (isContinuation) {
    if (viewMode === "standard") {
      paragraphs.push(new Paragraph({
        children: [new TextRun({ text: "(cont.)", italics: true, size: 18, color: "888888" })],
        spacing: { before: 160, after: 0 },
      }));
    }
    // clean mode: omit label entirely
  } else {
    paragraphs.push(new Paragraph({ children: labelRuns, spacing: { before: 160, after: 0 } }));
  }
  ```
- Part-indent added to line paragraphs:
  ```typescript
  const partIndentTwips = line.partIndent && line.partIndentChars
    ? Math.round(line.partIndentChars * 100)
    : 0;
  paragraphs.push(new Paragraph({
    children: runs,
    spacing: { before: 0, after: 0 },
    ...(partIndentTwips ? { indent: { left: partIndentTwips } } : {}),
  }));
  ```

**Verified (2026-05-01):**
- ✅ TypeScript + lint: 0 errors
- ✅ HTML unit data: `sp-1` `isContinuation: false`, `sp-2` `isContinuation: true`, `sp-3` `isContinuation: false`
- ✅ `lineIndents` arrays present and correctly sized on all speech units
- ✅ Cut speech between two same-speaker speeches does NOT break the continuation chain
- ✅ ALL speech resets continuation correctly
- ✅ Word standard mode DOCX: `HORATIO → lines → (cont.) → lines → HAMLET → lines`
- ✅ Word clean mode DOCX: `HORATIO → lines → lines → HAMLET → lines` (no label for continuation)
- Commit: `81da3ca` on branch `group-28-export-fidelity-plan`

---

#### 28C-3: Speech reassignments in HTML (Standard mode) ✅ — Session 3 (2026-05-01)

**File:** `lib/cuts/HtmlExporter.ts`

**Issue:** `buildScriptData` computes the effective name from `speechReassignments` but doesn't preserve the original name for the rendered engine to strike through.

**UnitData additions:**
```typescript
originalSpeaker?: string;   // pre-reassignment name (only set when hasReassignment)
hasReassignment?: boolean;
```

**In `buildScriptData`**, after computing `charName` (effective name):
```typescript
const hasReassignment = !!(reassignments[speech.id]);
const originalSpeaker: string | undefined = hasReassignment
  ? (isAllSpeech
      ? speech.speakerTag.trim()
      : (speech.characterIds ?? [speech.characterId])
          .map((id) => resolveCharacterName(id, aliases, play.castList))
          .join(" & "))
  : undefined;
```
Note: `charName` is already the effective (post-reassignment) name. `originalSpeaker` is the pre-reassignment name without applying the reassignment override.

**In embedded JS `renderUnit`**, extend the `var name=...` block (after the `isContinuation` branch):
```javascript
}else if(u.hasReassignment&&mode==='standard'){
  var origSpan='<span style="text-decoration:line-through;color:#b91c1c">'+esc(u.originalSpeaker||'')+'</span>';
  var newSpan='<span style="color:#16a34a">'+esc(u.characterName)+'</span>';
  name='<div class="char-name">'+origSpan+' '+newSpan+'</div>';
}else{
  name='<div class="char-name">'+esc(u.characterName)+'</div>';
}
```
Clean mode: falls through to `else` — `characterName` is already the effective name, no change needed.

**Verified (2026-05-01):**
- ✅ Unit data: sp-0733 `hasReassignment: true`, `originalSpeaker: "Adrian"`, `characterName: "Gonzalo"`
- ✅ HTML standard: `<span strike red>Adrian</span> <span green>Gonzalo</span>`
- ✅ HTML clean: `Gonzalo` only
- ✅ Word standard: old name struck grey + new name green (existing `resolveSpeakerLabel` path)
- ✅ Word clean: correct new name only
- ✅ Bug 7: clean mode SD rendering returns early before `isEdited` class applied — no badge in clean
- Commit: `83f1987` on branch `group-28-export-fidelity-plan`

---

#### 28C-4: Consecutive SDs (Both) ✅ — Session 3 (2026-05-01)

**Diagnose first before writing any code.** Find a Hamlet scene with two naturally adjacent SDs (exit + entrance, e.g. Act 1 Scene 4/5).

**HTML diagnosis:** After 28A fix lands, run export and check:
```javascript
console.log(window.__SCRIPT__.scenes.find(s=>s.id.includes('1_5'))?.units)
```
Verify both adjacent SDs appear as separate `type: "stage"` entries in the units array.

**Likely outcome:** 28A (adding `expandStageNotes` to HTML pipeline) may already fix this. If not, check for ID collisions — the synthetic SD from `expandStageNotes` uses `id: \`${stageLine.id}:sd\``. If a collision exists, fix by using `\`${speech.id}:sn${snIdx}:sd\`` instead.

**Word diagnosis:** If two adjacent real SDs are still dropping, check `isUnitCut` regex at `renderScriptDocx.ts` line ~41:
```typescript
const snBase = unitId.match(/^(.+):sn\d+$/)?.[1];
```
A legitimate SD id shouldn't match `:sn\d+$`, but verify with actual Hamlet data.

**Verified (2026-05-01):** No code change needed. `expandStageNotes` (added in 28A) already ensures adjacent natural SDs emit separate units with unique `${stageLine.id}:sd` IDs. No collision possible. Confirmed via expandUtils code review.

---

#### 28C-5: Song/dance indicators (Both) ✅ — Session 3 (2026-05-01)

**Flag resolution:**
- SDs: `isSong = (cut.sdFlagOverrides?.[id]?.isSong ?? stage.isSong) === true` (same for `isDance`)
- Speeches: `isSong` from TEI field on the `Speech` object, or override via `cut.sdFlagOverrides?.[id]?.isSong`

**HTML changes (`lib/cuts/HtmlExporter.ts`):**

Add to `UnitData`:
```typescript
isSong?: boolean;
isDance?: boolean;
```

In `buildScriptData` — speech branch:
```typescript
const isSong = (speech as Speech & { isSong?: boolean }).isSong === true
  || (cut.sdFlagOverrides?.[speech.id]?.isSong === true);
units.push({ ..., isSong, isDance: false });
```

Stage branch:
```typescript
const isSong = (cut.sdFlagOverrides?.[stage.id]?.isSong ?? stage.isSong) === true;
const isDance = (cut.sdFlagOverrides?.[stage.id]?.isDance ?? stage.isDance) === true;
units.push({ ..., isSong, isDance });
```

In embedded JS `renderUnit` — SD rendering, add prefix before `[text]`:
```javascript
var sdPrefix='';
if(u.isSong)sdPrefix+='<span style="color:#7c3aed">♪ </span>';
if(u.isDance)sdPrefix+='<span style="color:#0891b2">⊛ </span>';
// render: '<div class="'+sdCls+'">'+sdPrefix+'['+esc(text)+']</div>'
```

Song speech — in the `var name=...` block, prepend `♪` and use violet lines:
```javascript
var songPfx=(!u.isContinuation&&u.isSong)?'<span style="color:#7c3aed;font-size:11px">♪ </span>':'';
// in name: name='<div class="char-name">'+songPfx+esc(u.characterName)+'</div>';
// lines:
lines=u.keptLines.map(function(l){
  return u.isSong
    ?'<div style="color:#7c3aed;font-style:italic">'+esc(l)+'</div>'
    :'<div>'+esc(l)+'</div>';
}).join('');
```

**Word changes (`lib/export/renderScriptDocx.ts`):**

In the SD render block, detect flags and build a runs array:
```typescript
const isSong = (cut.sdFlagOverrides?.[stage.id]?.isSong ?? stage.isSong) === true;
const isDance = (cut.sdFlagOverrides?.[stage.id]?.isDance ?? stage.isDance) === true;
const sdRuns: TextRun[] = [];
if (isSong) sdRuns.push(new TextRun({ text: "♪ ", color: "7c3aed", italics: true, size: 18 }));
if (isDance) sdRuns.push(new TextRun({ text: "⊛ ", color: "0891b2", italics: true, size: 18 }));
sdRuns.push(new TextRun({ text: `[${sdText}]`, italics: true, size: 18, /* existing color/strike logic */ }));
// Replace children: [single TextRun] with children: sdRuns
```

For song speeches, in the `labelRuns` construction:
```typescript
const isSongSpeech = (speech as Speech & { isSong?: boolean }).isSong === true
  || (cut.sdFlagOverrides?.[speech.id]?.isSong === true);
if (isSongSpeech && !effectivelyCut) {
  labelRuns.unshift(new TextRun({ text: "♪ ", color: "7c3aed", size: 18 }));
}
```

In the line `TextRun`, add italic + violet for song lines (don't override existing strike/cut color):
```typescript
...(isSongSpeech && !baseStrike ? { italics: true, color: "7c3aed" } : {}),
```

**Verified (2026-05-01):**
- ✅ 10 song units + 2 dance units detected in The Tempest export
- ✅ Song SD: `<span color:#7c3aed>♪ </span>[Sings in Gonzalo's ear:]` — both modes
- ✅ Dance SD: `<span color:#0891b2>⊛ </span>[Then, to soft music...]` — both modes
- ✅ Song speech name: `♪` prefix violet, lines violet italic
- ✅ Word standard + clean: both rendered without errors (68KB / 44KB)
- Commit: `83f1987` on branch `group-28-export-fidelity-plan`

---

#### 28C-6: Inserted SDs ✅

**What was done:**
- Added `expandInsertedSDs` to `lib/cuts/expandUtils.ts` — mirrors `expandInsertions` but emits synthetic `StageDirection` objects from `cut.insertedSDs`
- Wired into both exporters as the outermost expansion step
- HTML: added `isInserted?: boolean` to `UnitData`; `renderUnit` shows green "inserted" badge in standard mode, plain SD in clean
- Word: the existing `isInsertedSD` check (`cut.insertedSDs?.[stage.id]`) now correctly matches since inserted SDs flow through the stream

---

#### 28C-7: Sub-scene division in Word export ✅

**What was done:** Added `PART_LABELS` import and subdivision tracking (`splitBoundaryIds`, `splitIdx`) to the scene loop in `renderScriptDocx.ts`. After each unit, injects a centered bold `— Part B —` paragraph when a boundary is crossed. Matches HTML exporter's logic exactly.

---

#### 28C-8: Character list at top of Word document ✅

**What was done:** Inserted a Characters section after the title block in `renderScriptDocx.ts`, before the first act:
- One paragraph per character from `play.castList` (in castList order)
- Fully-cut: gray `#aaaaaa` strikethrough
- Aliased: green alias + gray original in parentheses
- Normal: black

---

### 28C Session 4 — Remaining Fidelity + New Features

> All items below are **not yet implemented**. Implement them in order in a new session.

#### 28C-S4-1: HTML — Inserted speeches green styling

**File:** `lib/cuts/HtmlExporter.ts`

**Problem:** `isInserted` in `UnitData` is set for SD units only. Inserted speech units (from
`cut.insertions`, emitted by `expandInsertions`) are never marked green.

**Fix in `buildScriptData`** — speech branch, after `isContinuation`:
```typescript
const isInsertedSpeech = !!(cut.insertions?.[speech.id]);
```
Include `isInserted: isInsertedSpeech` in `units.push`.

**Fix in embedded JS `renderUnit`** — at the start of the speech name block, before `isContinuation` (note: include `dnote` so delivery notes still render):
```javascript
if(u.isInserted&&mode==='standard'){
  name='<div class="char-name" style="color:#16a34a">'+esc(u.characterName)+'</div>'+dnote;
}else if(u.isContinuation){ ... }else if(u.hasReassignment...){ ... }else{ ... }
```
Lines in standard mode with `isInserted` (before the existing keptLines loop):
```javascript
if(mode==='standard'&&u.isInserted){
  lines=u.keptLines.map(function(l,i){
    var ind=u.lineIndents&&u.lineIndents[i]?'padding-left:'+u.lineIndents[i]+'ch':'';
    var sty=(ind?ind+';':'')+'color:#16a34a';
    return'<div style="'+sty+'">'+esc(l)+'</div>';
  }).join('');
}else{/* existing keptLines loop */}
```

---

#### 28C-S4-2: HTML — Word-level edits (segment-aware HTML)

**File:** `lib/cuts/HtmlExporter.ts`

**Problem:** `segmentsToText` collapses cut words. Standard mode should show `<del>` for cut words
and green for inserted words.

**Add to `UnitData` interface:**
```typescript
/** Pre-rendered HTML per kept line: <del> for cut words, green span for inserts (standard only). null when no word-level edits on that line. */
editedLineHtml?: (string | null)[];
```

**Add inline helpers before `buildScriptData`:**
```typescript
function escHtml(s: string): string {
  return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}
function segmentsToHtml(segs: {type:"keep"|"cut"|"insert";text:string}[]): string {
  return segs.map(s => {
    if (s.type === "cut") return `<del style="color:#b91c1c;text-decoration:line-through">${escHtml(s.text)}</del>`;
    if (s.type === "insert") return `<span style="color:#16a34a">${escHtml(s.text)}</span>`;
    return escHtml(s.text);
  }).join("");
}
```

**In `buildScriptData`** — extend the existing `keptLinePairs` map to carry `html` alongside `text`/`indent`:
```typescript
// No-ops case:
return { text: l.text, indent: l.partIndentChars ?? 0, html: null };
// Has-ops case:
const segments = applyEditsToLine(l.id, l.text, lineOps ...);
return { text: segmentsToText(segments), indent: ..., html: segmentsToHtml(segments) };
```
Then after `const lineIndents = keptLinePairs.map(p => p.indent)`:
```typescript
const editedLineHtml = keptLinePairs.map(p => p.html);
```
Include `editedLineHtml` in `units.push`.

**In embedded JS `renderUnit`** — in the kept-lines render path:
```javascript
var lineContent=(mode==='standard'&&u.editedLineHtml)?u.editedLineHtml[i]:esc(l);
return sty?'<div style="'+sty+'">'+lineContent+'</div>':'<div>'+lineContent+'</div>';
```
`editedLineHtml[i]` must NOT be passed through `esc()` — it is already-escaped HTML.

---

#### 28C-S4-3: HTML diff mode — SDs in both columns

**File:** `lib/cuts/HtmlExporter.ts` (embedded JS `renderUnit`, SD branch)

**Problem:** Non-edited, non-cut SDs fall through to single-column render in diff mode. App shows
unchanged SDs in both columns (same text both sides).

**Replace** the existing SD diff block (which only triggers on `u.isEdited`):
```javascript
if(mode==='diff'){
  if(u.status==='cut'){
    var right='<div class="diff-label">Original</div>'
      +'<div class="stage-dir" style="text-decoration:line-through;opacity:.5">'
      +'['+esc(u.originalLines[0]||'')+']</div>';
    return'<div class="diff-row">'
      +'<div class="diff-col diff-left"><div class="diff-label">Modified</div>'
      +'<span style="color:#a8a29e;font-size:12px;font-style:italic">(cut)</span></div>'
      +'<div class="diff-col diff-right">'+right+'</div></div>';
  }
  var leftSD=u.isEdited
    ?'<div class="stage-dir stage-dir-edited">'+sdPrefix+'['+esc(u.keptLines[0]||'')+']</div>'
    :'<div class="stage-dir">'+sdPrefix+'['+esc(u.keptLines[0]||'')+']</div>';
  var rightSD='<div class="stage-dir">'+sdPrefix+'['+esc(u.originalLines[0]||'')+']</div>';
  var leftLabel=u.isEdited?'<div class="diff-label">Modified</div>':'';
  var rightLabel=u.isEdited?'<div class="diff-label">Original</div>':'';
  return'<div class="diff-row">'
    +'<div class="diff-col diff-left">'+leftLabel+leftSD+'</div>'
    +'<div class="diff-col diff-right">'+rightLabel+rightSD+'</div>'
    +'</div>';
}
```

---

#### 28C-S4-4: Line numbers in HTML exports

**File:** `lib/cuts/HtmlExporter.ts`

**Scheme:** Scene-relative, every 5th line. Standard mode counts ALL lines (including cut lines).
Clean mode counts KEPT lines only. Matches `SpeechBlock.tsx` exactly.

**Add to `UnitData`:**
```typescript
keptLineNums?: (number | null)[];   // parallel to keptLines; non-null only on every 5th kept line
origLineNums?: (number | null)[];   // parallel to originalLines; non-null only on every 5th std line
```

**In `buildScriptData`** — add scene-level counters (declared outside the speech loop, reset per scene):
```typescript
let sceneCleanLine = 0;
let sceneStdLine = 0;
```
For each speech, walk `speech.lines` (before filtering):
```typescript
const keptLineNums: (number|null)[] = [];
const origLineNums: (number|null)[] = [];
for (const l of speech.lines) {
  sceneStdLine++;
  origLineNums.push(sceneStdLine % 5 === 0 ? sceneStdLine : null);
  if (lineCutMap[l.id] !== "cut") {
    sceneCleanLine++;
    keptLineNums.push(sceneCleanLine % 5 === 0 ? sceneCleanLine : null);
  }
}
```
Include in `units.push`. SDs and subdividers: no line numbers.

**In embedded JS `renderUnit`** — add helper:
```javascript
function lineNumSpan(n){
  return n!=null
    ?'<span style="display:inline-block;width:2.5em;text-align:right;color:#a8a29e;font-size:11px;margin-right:6px;user-select:none">'+n+'</span>'
    :'<span style="display:inline-block;width:2.5em;margin-right:6px"></span>';
}
```
In the kept-lines render (clean + standard non-diff):
```javascript
var numArr=(mode==='clean')?u.keptLineNums:u.origLineNums;
lines=u.keptLines.map(function(l,i){
  var lineContent=(mode==='standard'&&u.editedLineHtml)?u.editedLineHtml[i]:esc(l);
  var num=lineNumSpan(numArr&&numArr[i]!=null?numArr[i]:null);
  var ind=u.lineIndents&&u.lineIndents[i]?'padding-left:'+u.lineIndents[i]+'ch':'';
  var sty=ind?ind+';':'';
  if(u.isSong)sty+='color:#7c3aed;font-style:italic;';
  if(sty)sty=sty.replace(/;$/,'');
  return sty?'<div style="'+sty+'">'+num+lineContent+'</div>':'<div>'+num+lineContent+'</div>';
}).join('');
```
For cut lines in standard (uses `originalLines`):
```javascript
lines=u.originalLines.map(function(l,i){
  var num=lineNumSpan(u.origLineNums&&u.origLineNums[i]!=null?u.origLineNums[i]:null);
  return'<div class="line-cut">'+num+esc(l)+'</div>';
}).join('');
```
For diff left (keptLines, clean nums) and right (originalLines, std nums):
```javascript
var leftLines=u.keptLines.map(function(l,i){
  var num=lineNumSpan(u.keptLineNums&&u.keptLineNums[i]!=null?u.keptLineNums[i]:null);
  return'<div>'+num+esc(l)+'</div>';
}).join('');
var rightLines=u.originalLines.map(function(l,i){
  var cls=u.status==='cut'?' class="line-cut"':'';
  var num=lineNumSpan(u.origLineNums&&u.origLineNums[i]!=null?u.origLineNums[i]:null);
  return'<div'+cls+'>'+num+esc(l)+'</div>';
}).join('');
```

---

#### 28C-S4-5: Line numbers in Word exports

**File:** `lib/export/renderScriptDocx.ts`

Add scene-level counters (reset at start of each scene's unit loop):
```typescript
let sceneCleanLine = 0;
let sceneStdLine = 0;
```
For each line paragraph:
```typescript
sceneStdLine++;
const isLineKept = !lineCut;
if (isLineKept) sceneCleanLine++;
const lineNum = viewMode === "clean" ? sceneCleanLine : sceneStdLine;
const showNum = lineNum % 5 === 0;
```
Prepend a number run when `showNum`:
```typescript
const lineNumRun = showNum
  ? new TextRun({ text: `${lineNum}  `, color: "aaaaaa", size: 16 })
  : null;
const lineChildren: TextRun[] = lineNumRun ? [lineNumRun, ...existingRuns] : existingRuns;
```
Pass `lineChildren` to `Paragraph({ children: lineChildren, ... })`.

---

#### 28C-S4-6: Filename date/time suffix on all exports

Format: `dd-mm-yyyy--hh-mm` (local time at export)

Inline helper (add to each relevant file — no shared util needed):
```typescript
function exportDateSuffix(): string {
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, "0");
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const hh = String(now.getHours()).padStart(2, "0");
  const min = String(now.getMinutes()).padStart(2, "0");
  return `${dd}-${mm}-${now.getFullYear()}--${hh}-${min}`;
}
```

**`lib/project/projectIO.ts`:**
- `exportScriptHtml`: `${safeName}-${safeCut}-${exportDateSuffix()}.html`
- `exportProject` (JSON): `${safeName}-${exportDateSuffix()}.sss.json`

**`app/api/export/script-docx/route.ts`** — `Content-Disposition` header:
```typescript
const suffix = exportDateSuffix();
res.headers.set("Content-Disposition", `attachment; filename="${safeName}-${safeCut}-${suffix}.docx"`);
```

---

#### 28C-S4-7: Word standard mode — red/green colors (not grey)

**File:** `lib/export/renderScriptDocx.ts`

**Problem:** All cut indicators currently use `color: "999999"` (grey). Standard mode should use
red (`b91c1c`) for cuts, matching the app.

Replace every `color: "999999"` + `strike: true` pairing (content cuts only) with `color: "b91c1c"`:

| Location | Current | Fix |
|----------|---------|-----|
| Cut speech label (`effectivelyCut` branch) | `color: "999999"` | `color: "b91c1c"` |
| Reassignment old-name run (line ~265) | `color: "999999"` | `color: "b91c1c"` |
| Word-level cut segment (`s.type === "cut"`) | `color: "999999"` | `color: "b91c1c"` |
| Full-line `baseStrike` run | `color: "999999"` | `color: "b91c1c"` |
| SD `effectivelyCut` TextRun | `color: "aaaaaa"` | `color: "b91c1c"` |
| Delivery note on cut speech | `color: "999999"` | `color: "b91c1c"` |

**Do NOT change:** character list strikethrough for fully-cut characters stays `color: "aaaaaa"` (grey — "not in production", not "content cut").

---

#### 28C-S4-8: Word — Header and page numbers

**File:** `lib/export/renderScriptDocx.ts`

Add `projectName?: string` to `renderScriptDocx` signature. Update caller in
`app/api/export/script-docx/route.ts` to pass it from the request body.

Import additions:
```typescript
import { Header, Footer, PageNumber } from "docx";
```

Build header text:
```typescript
const headerParts = [projectName, play.title, cut.name, exportDateSuffix()].filter(Boolean);
const headerText = headerParts.join(" | ");
```

Replace `new Document({ sections: [{ children: paragraphs }] })` with:
```typescript
const doc = new Document({
  sections: [{
    headers: {
      default: new Header({
        children: [new Paragraph({
          children: [new TextRun({ text: headerText, size: 18, color: "888888" })],
          alignment: AlignmentType.RIGHT,
        })],
      }),
    },
    footers: {
      default: new Footer({
        children: [new Paragraph({
          children: [new TextRun({ children: [PageNumber.CURRENT], size: 18, color: "888888" })],
          alignment: AlignmentType.CENTER,
        })],
      }),
    },
    children: paragraphs,
  }],
  styles: {
    default: { document: { run: { font: "Times New Roman", size: 24 } } },
  },
});
```

---

#### 28C-S4-9: Verification matrix update

After Session 4, the feature matrix (28B) should be updated:

| Feature | HTML Std | HTML Clean | Word Std | Word Clean |
|---------|----------|------------|----------|------------|
| Word cut | `<del>` red | hidden | **red** strike | hidden |
| Line cut | red strike | hidden | **red** strike | hidden |
| Speech cut | red strike | hidden | **red** strike | hidden |
| SD cut | red strike | hidden | **red** strike | hidden |
| Speech insert | inline, green | inline, plain | inline, green | inline, plain |
| Line numbers | every 5th, scene-rel, std=all / clean=kept | same | same | same |
| Filename | ends `dd-mm-yyyy--hh-mm` | same | same | same |
| Word header | N/A | N/A | project\|play\|cut\|date | same |
| Page numbers | N/A | N/A | centered in footer | same |

---

### 28D — Documentation + PR

After all 28C fixes verified:
1. Update `docs/CHANGELOG.md` with Group 28 entries.
2. Mark Group 28 done in `docs/ROADMAP.md`.
3. Ship PR via `/ship-docs`.

---

## Verification Protocol (Per Fix)

```bash
export PATH="$HOME/.nvm/versions/node/v22.9.0/bin:$PATH"
npx tsc --noEmit
npm run lint
```

Then:
1. `npm run dev`
2. Open test project → "Full Feature Test" cut (28B)
3. Export HTML → open in browser → verify standard then clean
4. Export Word → open in Word or LibreOffice → verify standard then clean
5. Compare side by side with app screen

---

## Troubleshooting

### Data not reaching the renderer
- **HTML:** `console.log(JSON.stringify(window.__SCRIPT__, null, 2))` in DevTools — check unit data fields.
- **Word:** Add `console.error` before render in the route handler — verify cut data arriving correctly.

### Expansion issues (consecutive SDs, stageNotes)
- Log the unit stream after each expansion step: `expandSplits` → `expandInsertions` → `expandStageNotes` → `expandInsertedSDs`.
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
- The render engine is an embedded JS template string in `HtmlExporter.ts` (~lines 367–540).
- Fields added in `buildScriptData` must also be read in `renderUnit` — the template has no type checking.
- When changing data shape, also update `window.__SCRIPT__` field in the client-side script block.

---

## Group 29 — Cue Script Improvements

**Goal:** Overhaul the cue script export page UI, add per-actor line buddy, add a print button to the script view, and redesign the line buddy drill to be a scene-based line-by-line reveal tool. Also verify cue script and line buddy export fidelity.

**Estimated sessions:** 3 (Sessions 29-2, 29-3, 29-4 below; group 28 S4 is Session 29-1).

---

### Session 29-2 — Cue Script UI Cleanup

**Files:**
- `components/CueScript/ExportMenu.tsx`
- `app/projects/[projectId]/export/page.tsx`
- Script editor nav (likely `app/projects/[projectId]/layout.tsx`)

#### 29-2-1: Search bar on cue script page

The project layout already wraps everything in `<SearchProvider>`. The cue script page (`ExportMenu.tsx`) just needs to import `useSearch()` and add a search toggle button to the control bar — same amber-highlight style and Cmd+F shortcut as the `NavSearchButton` in the script view.

#### 29-2-2: Per-actor "Export Line Buddy" button

Add a single-actor line buddy export button in the control bar (Row 1, next to Print/Save PDF). Downloads current actor's HTML directly — no ZIP needed:
```typescript
import { exportLineBuddy, lineBuddyFileName } from "@/lib/cuts/LineBuddyExporter";

function handleLineBuddySingle() {
  if (!selectedActor || !cueScript) return;
  const html = exportLineBuddy(cueScript, selectedActor);
  const blob = new Blob([html], { type: "text/html" });
  triggerDownload(blob, lineBuddyFileName(selectedActor.name));
}
```
Button label: **"Export Line Buddy"**

#### 29-2-3: Print button in script view nav

Add a Print button to the script editor nav bar (desktop: next to Edit and Search; mobile: in hamburger menu). Calls `window.print()`. Button must have `no-print` class to hide itself during printing. Edit the script editor nav component (investigate exact file — likely `app/projects/[projectId]/layout.tsx` near the `NavSearchButton`).

#### 29-2-4: Move batch buttons to top bar

Remove Row 2 (`border-t` div in `ExportMenu.tsx`). Move "Download All" and "Export All Line Buddy" batch buttons to the top bar area (investigate how the project layout exposes action slots for per-page buttons — may need to add a slot). If no layout slot exists, add them to the ExportMenu header row with a visual separator from the per-actor controls.

#### 29-2-5: Remove clutter text

Delete from `ExportMenu.tsx`:
- `<span class="text-xs text-stone-400">All actors:</span>` label (line ~132)
- `<span class="text-xs text-stone-400 ml-auto">Export full script as Word: open ⚙ Settings</span>` (lines ~147–149)

**Verification:**
```bash
npx tsc --noEmit && npm run lint
```
Then open cue script page — confirm search button present, per-actor line buddy button next to Print, batch buttons relocated, clutter text gone.

---

### Session 29-3 — Line Buddy Redesign

**Files:**
- `types/cut.ts` — add scene/act metadata to `CueEntry`
- `lib/cuts/CueScriptBuilder.ts` — emit scene/act metadata on every entry
- `lib/cuts/LineBuddyExporter.ts` — full rewrite

#### Step 1: Enrich `CueEntry` with scene metadata

In `types/cut.ts`, add to `CueEntry`:
```typescript
sceneId?: string;
actId?: string;
sceneTitle?: string;
actTitle?: string;
```

#### Step 2: `CueScriptBuilder` emits scene/act

`buildCueScript` currently uses `getEffectiveUnitsInOrder(play, cut)` which returns a flat list without scene headers. Need to iterate `play.acts[].scenes[]` with `getEffectiveSceneOrder`, tracking `currentSceneId`, `currentActId`, `currentSceneTitle`, `currentActTitle`. Tag each `entries.push(...)` with the current scene context.

#### Step 3: `LineBuddyExporter` complete rewrite

**New data shape:**
```javascript
const ALL_SCENES = [
  {
    sceneId: "...",
    actId: "...",
    sceneTitle: "Act 1, Scene 1",
    actTitle: "Act 1",
    items: [
      { type: "cue", text: "...", cueSpeaker: "..." },
      { type: "lines", text: "...", characterName: "HAMLET" },
      { type: "stage", text: "...", isSong: false, isDance: false },
      ...
    ]
  },
  ...
]
```

**New UX model:**
- One scene displayed at a time
- All content of the scene is laid out and visible as a column of blocks
- `type: "lines"` items start hidden (CSS `visibility: hidden`); `type: "cue"` and `type: "stage"` are always visible
- Pressing Space or Right arrow reveals the **next** hidden lines-item in the current scene
- After all lines in a scene are revealed, Space/Right advances to the next scene
- **Header:** sticky, shows current `actTitle · sceneTitle`; includes a `<select>` listing all scenes for jump navigation; prev/next scene buttons
- **Progress:** `"3 / 12 lines"` within the current scene; no card X-of-X counter
- **Removed:** shuffle button, reset button, card counter
- **Keyboard shortcuts:**
  - Space / Right → reveal next line
  - Left → go back one line (re-hide it, decrement pointer)
  - `]` → next scene
  - `[` → prev scene
  - `g` → focus scene jump select

**Song/dance indicators in stage directions:**
```javascript
var sdPrefix = '';
if (item.isSong) sdPrefix = '<span style="color:#7c3aed">♪ </span>';
if (item.isDance) sdPrefix = '<span style="color:#0891b2">⊛ </span>';
```
Pass `isSong`/`isDance` from the SD's `CueEntry` — requires adding these fields to `CueEntry` and emitting them in `CueScriptBuilder`.

**Stretch goal — right/wrong marking:**
- After each lines-item is revealed, show Right / Wrong buttons (keyboard: `k` = right, `j` = wrong)
- Track `wrongItems: number[]` (indices into current scene's items array)
- At scene end (all revealed), show: `"Scene complete. Mistakes: N"` + `"Review mistakes"` button
- Review mode: iterate only the wrongItems; for each, scroll to the cue entry before that lines-item and re-reveal from there (go back to the cue, show it, hide actor lines, user presses Space to re-reveal)
- `"Back to scene"` exits review mode

**Verification:**
- Export single-actor line buddy for a Hamlet cut
- Navigate to Act 2 Scene 2 via jump select
- Space through all lines — verify sequential reveal, correct line count
- `[` / `]` — verify scene navigation
- Check no shuffle, no reset, no card counter
- Verify song/dance SD prefix colors
- Test stretch goal: mark some wrong, trigger review, verify it shows just those speeches

---

### Session 29-4 — Export Fidelity: Cue Script & Line Buddy

#### 29-4-1: Delivery notes in cue scripts

`CueScriptBuilder` currently omits delivery notes. Verify by reading the builder — if absent, add a delivery note entry immediately after each actor speech label (same italic style as script view). Likely implementation: emit a `type: "delivery"` entry or include the delivery note in the `characterName` field.

#### 29-4-2: Song/dance flags in line buddy

Song/dance must be indicated in the line buddy. Add `isSong?: boolean; isDance?: boolean` to `CueEntry`. In `CueScriptBuilder`, when emitting a stage direction entry, resolve `isSong`/`isDance` from `cut.sdFlagOverrides` (same logic as exporters). The line buddy renders prefix ♪/⊛ as described in Session 29-3.

For song speeches in line buddy: render actor lines in violet italic `color:#7c3aed;font-style:italic` (same as HTML export).

#### 29-4-3: Inserted SDs in cue scripts

`getEffectiveUnitsInOrder` may or may not include inserted SDs from `cut.insertedSDs`. Verify by checking the function — if absent, ensure inserted SDs flow through to cue script entries (relevant ones, where the actor is involved).

#### 29-4-4: Verify cue script document clean version

`CueScriptDocument.tsx` renders `buildCueScript()` output. Spot-check:
- Word-level edits: builder calls `applyEditsToLine` + `segmentsToText` ✅ (already in builder)
- Speech reassignments ✅
- Delivery notes: fix in 29-4-1
- Song/dance: `CueScriptDocument.tsx` should show song speeches in violet italic if `isSong` is on the entry — add if missing
- Sub-scene labels: if subdivision markers should appear in cue script (TBD during session — likely not needed)

---

### 29-D — Documentation + PR (Group 29)

After all sessions complete:
1. Update `docs/CHANGELOG.md` with Group 29 entries.
2. Add Group 29 to `docs/ROADMAP.md` as done.
3. Ship PR via `/ship-docs`.
