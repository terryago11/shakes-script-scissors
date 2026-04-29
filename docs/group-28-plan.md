# Group 28 — Export Fidelity Audit

**Goal:** Make HTML and Word exports match the app's "standard" and "clean" rendering exactly — same content, same structure, same styling — so a director's export is indistinguishable in fidelity from what they see on screen.

---

## Confirmed Bugs

| # | Bug | HTML | Word | Status |
|---|-----|------|------|--------|
| 1 | Speech reassignments ignored | Character name always from original | Partially wired; clean mode shows wrong speaker | Session 3 |
| 2 | Delivery notes uppercase | N/A (not rendered) | `.toUpperCase()` calls | ✅ Done (28C-1) |
| 3 | Consecutive SDs not exported | Likely filter/skip bug | Expansion produces wrong type | Session 3 (diagnose after 28A) |
| 4 | Character header repeated in continuous speech | No continuation detection | No continuation detection | Session 2 |
| 5 | Song/dance indicators absent | Not rendered | Not rendered | Session 3 |
| 6 | Inserted SDs not distinguished | No green indicator | Not in stream at all | ✅ Done (28C-6) |
| 7 | Edited SD badge missing in clean | Suppression incomplete | (correct — no badge in clean) | Session 3 |
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

#### 28C-2: Character header continuation suppression (Both) — **Session 2**

**Reference algorithm:** `SceneBlock.tsx` lines 145–207. Port exactly — do not rewrite.

**Algorithm (simplified for exporters — no `showOriginal` mode):**
```
let lastSpeakerId = null
for each rawUnit in expandedUnits (per scene):
  if not a speech → skip (SDs don't affect continuation)
  if id ends in ":s2" → skip main loop (handled in split block below)
  if unit is a cut.insertions entry → skip (handled via insAfterCharMap)

  isEffectivelyCut = cutMap[id] === "cut"
  charId = speechReassignments[id]?.[0] ?? unit.characterId
  isAll = speakerTag has ALL, or characterIds.length > 1, or reassigned.length > 1

  if not cut:
    if not isAll AND lastSpeakerId === charId → add id to continuationIds
    lastSpeakerId = isAll ? null : charId

  // Handle :s2 split part (inherits cut status from parent)
  if speechSplits[id] exists AND not cut:
    s2Id = id + ":s2"
    s2charId = speechReassignments[s2Id]?.[0] ?? split.newCharacterId ?? unit.characterId
    if lastSpeakerId === s2charId → add s2Id to continuationIds
    lastSpeakerId = s2charId

  // Handle inserted speeches following this unit
  for ins in insAfterCharMap[unit.id]:
    if lastSpeakerId === ins.characterId → add ins.id to continuationIds
    lastSpeakerId = ins.characterId
```

**HTML changes (`lib/cuts/HtmlExporter.ts`):**
- Add `isContinuation?: boolean` to `UnitData` interface
- Run the detection pass after `expandedUnits` is set, before the main loop; build `insAfterCharMap` from `cut.insertions`
- Add `isContinuation: continuationIds.has(rawUnit.id)` to each speech's `units.push`
- In embedded JS `renderUnit`, replace `var name='<div class="char-name">'+esc(u.characterName)+'</div>';` with:
  ```javascript
  var name;
  if(u.isContinuation){
    if(mode==='clean'){name='';}
    else{name='<div class="char-name" style="font-style:italic;font-weight:normal">(cont.)</div>';}
  }else{
    name='<div class="char-name">'+esc(u.characterName)+'</div>';
  }
  ```

**Word changes (`lib/export/renderScriptDocx.ts`):**
- Run same detection pass before `for (const unit of sceneUnits)`, using `isUnitCut` for cut status
- Add `const isContinuation = continuationIds.has(speech.id)` in the speech block
- Replace the `paragraphs.push(new Paragraph({ children: labelRuns ... }))` with:
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

**Part-indent preservation (Word):** `expandSplits` puts `partIndent: true, partIndentChars: N` on `:s2` lines. The Word exporter currently ignores this. In the line loop, after computing `runs`:
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

**Part-indent preservation (HTML):** Add `lineIndents?: number[]` to `UnitData`, populated parallel to `keptLines` from `line.partIndentChars ?? 0`. In `renderUnit`, apply `style="padding-left:{n}ch"` on lines with non-zero indent.

**Verify:** Normal continuation, continuation through a cut (must still continue), split-tool continuation with part indent, reassigned continuation, continuation broken by ALL.

---

#### 28C-3: Speech reassignments in HTML (Standard mode) — **Session 3**

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

**Verify:** HTML standard shows old name struck red + new name green. HTML clean shows new name only. Multi-speaker and ALL both correct.

---

#### 28C-4: Consecutive SDs (Both) — **Session 3**

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

**Verify:** Both SDs appear as separate correctly-styled blocks in all four modes.

---

#### 28C-5: Song/dance indicators (Both) — **Session 3**

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

**Verify:** Song SD `♪` violet, dance SD `⊛` cyan, song speech `♪` before name + lines violet italic. Both formats, both modes.

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
