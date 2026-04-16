/**
 * WordCutParser — maps highlighted Word doc paragraphs onto canonical play lines.
 *
 * Folger Word doc format (observed from real AYLI production doc):
 *  - Act headings: Heading1 style, e.g. "ACT 1"
 *  - Scene headings: body style, e.g. "Scene 1" or "Scene 2"
 *  - Speeches: "SPEAKER_NAME  speech text..." (2+ spaces after speaker label)
 *    Speaker label may include delivery note: "OLIVER, threatening Orlando  What, boy!"
 *  - Continuation lines (same speech, no speaker label): "which God made, a poor unworthy..."
 *  - Stage directions: plain body paragraphs with no speaker label (ignored for cut matching)
 *
 * Two paragraph patterns for speeches:
 *  A) Entire speech in ONE long paragraph ("ORLANDO  As I remember, Adam...") [1200+ chars]
 *  B) Speech split across MULTIPLE paragraphs by typographic line-breaks
 *     First: "ORLANDO  Go apart, Adam, and thou shalt hear how he"
 *     Next:  "will shake me up.Adam steps aside."  (no speaker label = continuation)
 *
 * Matching strategy:
 *  1. Group paragraphs into SpeakerBlocks — a new block starts when a speaker label is found
 *  2. Match each block to a canonical Speech by comparing first ~12 stripped tokens
 *  3. For each highlight within the block, search it across all canonical lines of the speech
 *
 * Rules:
 *  - Highlights only = cuts.
 *  - Inserted text, SDs, speaker names, Word tracked changes → ignored.
 *  - Word doc MUST have clear Act + Scene headings → hard reject if absent.
 *  - Match rate < 40% → hard reject; 40–70% → soft warning.
 */

import type { Play, Speech, Line } from "@/types/play";
import type { SpeechEdit } from "@/types/edit";
import {
  tokenize,
  jaccardSimilarity,
  parseNumber,
  findTokenSpan,
} from "./TextNormalizer";
import type { DocxParagraph } from "./DocxHighlightExtractor";

// ---------- Public types ----------

export interface WordImportResult {
  cutMap: Record<string, "cut" | "kept">;
  lineCutMap: Record<string, "cut" | "kept">;
  speechEdits: Record<string, SpeechEdit>;
  stats: WordImportStats;
}

export interface WordImportStats {
  matchedSpeeches: number;
  totalCanonicalSpeeches: number;
  /** Count of unmatched highlighted paragraphs/blocks. */
  highlightedButUnmatched: number;
  /** Full text of unmatched highlighted paragraphs, for user review. */
  skippedHighlights: string[];
  /** Overall speech match rate 0..1 */
  matchRate: number;
}

export type WordImportError =
  | { code: "NO_STRUCTURE"; message: string }
  | { code: "LOW_MATCH"; matchRate: number };

// ---------- Heading detection ----------

const ACT_RE =
  /^act[\s.,;:\u2013\u2014-]+([ivxlcdm]+|\d+|one|two|three|four|five)/i;
const SCENE_RE =
  /^scene[\s.,;:\u2013\u2014-]+([ivxlcdm]+|\d+|one|two|three|four|five|six|seven|eight|nine|ten)/i;
const COMBINED_RE =
  /^act[\s.,;:\u2013\u2014-]+([ivxlcdm]+|\d+|one|two|three|four|five)[,\s;]+scene[\s.,;:\u2013\u2014-]+([ivxlcdm]+|\d+|one|two|three|four|five|six|seven|eight|nine|ten)/i;

// Tokens used for speech matching (first N tokens)
const SPEECH_MATCH_TOKENS = 12;
// Minimum Jaccard for speech-level match
const SPEECH_MATCH_THRESHOLD = 0.4;

// ---------- Internal types ----------

interface SpeakerBlock {
  /** Extracted speaker label (may include delivery note), e.g. "OLIVER, threatening Orlando" */
  rawLabel: string;
  /** Just the character name portion, e.g. "OLIVER", "FIRST LORD" */
  charName: string;
  /** Combined speech text from all paragraphs, with speaker labels stripped */
  combinedText: string;
  /** Original paragraphs in document order */
  paragraphs: DocxParagraph[];
}

// ---------- Main export ----------

export function parseWordCuts(
  paragraphs: DocxParagraph[],
  play: Play
): WordImportResult | WordImportError {
  // Step 1: Detect scene regions
  const sceneRegions = detectSceneRegions(paragraphs, play);
  if (!sceneRegions) {
    return {
      code: "NO_STRUCTURE",
      message:
        'No Act or Scene headings found. The document must have clear "Act I / Scene 1" style headings.',
    };
  }

  const cutMap: Record<string, "cut" | "kept"> = {};
  const lineCutMap: Record<string, "cut" | "kept"> = {};
  const speechEditsMap: Record<string, SpeechEdit> = {};

  let matchedSpeeches = 0;
  let totalCanonicalSpeeches = 0;
  const skippedHighlights: string[] = [];

  // Step 2: Process each scene
  for (const act of play.acts) {
    for (const scene of act.scenes) {
      const region = sceneRegions.get(scene.id);
      if (!region) continue;

      const { startIdx, endIdx } = region;

      // Collect canonical speeches (not stage directions)
      const canonicalSpeeches = scene.units.filter(
        (u): u is Speech => u.type === "speech"
      );
      totalCanonicalSpeeches += canonicalSpeeches.length;

      // Group doc paragraphs into speaker blocks
      const blocks = buildSpeakerBlocks(paragraphs, startIdx, endIdx);

      // Track which canonical speeches have been matched (to avoid double-matching)
      const matchedSpeechIds = new Set<string>();

      // Match each block to a canonical speech
      for (const block of blocks) {
        const speech = matchBlockToSpeech(
          block,
          canonicalSpeeches,
          matchedSpeechIds
        );

        if (!speech) {
          // Unmatched block — record any highlights as skipped
          const anyHighlight = block.paragraphs.some((p) =>
            p.runs.some((r) => r.isHighlighted && r.text.trim())
          );
          if (anyHighlight) {
            skippedHighlights.push(block.combinedText.slice(0, 200));
          }
          continue;
        }

        matchedSpeeches++;
        matchedSpeechIds.add(speech.id);

        // Process highlights in this block against canonical lines
        applyBlockHighlights(
          block,
          speech,
          cutMap,
          lineCutMap,
          speechEditsMap
        );
      }
    }
  }

  // Step 3: Match rate check (speech-level)
  const matchRate =
    totalCanonicalSpeeches > 0 ? matchedSpeeches / totalCanonicalSpeeches : 0;

  if (matchRate < 0.4) {
    return { code: "LOW_MATCH", matchRate };
  }

  return {
    cutMap,
    lineCutMap,
    speechEdits: speechEditsMap,
    stats: {
      matchedSpeeches,
      totalCanonicalSpeeches,
      highlightedButUnmatched: skippedHighlights.length,
      skippedHighlights,
      matchRate,
    },
  };
}

// ---------- Speaker block building ----------

/**
 * Group paragraphs in [startIdx, endIdx) into SpeakerBlocks.
 * A new block starts whenever a speaker label (ALL_CAPS + 2+ spaces) is found.
 * Continuation paragraphs (no speaker label) are appended to the current block.
 */
function buildSpeakerBlocks(
  paragraphs: DocxParagraph[],
  startIdx: number,
  endIdx: number
): SpeakerBlock[] {
  const blocks: SpeakerBlock[] = [];
  let current: SpeakerBlock | null = null;

  for (let i = startIdx; i < endIdx; i++) {
    const para = paragraphs[i];
    const { rawLabel, charName, speechText } = parseSpeakerLabel(
      para.fullText
    );

    if (rawLabel) {
      // New speaker block
      if (current) blocks.push(current);
      current = {
        rawLabel,
        charName,
        combinedText: speechText,
        paragraphs: [para],
      };
    } else if (current) {
      // Continuation — append to current block (don't start new block)
      current.combinedText =
        current.combinedText + " " + para.fullText.trim();
      current.paragraphs.push(para);
    }
    // If no current block and no speaker label → standalone non-speech para (stage dir etc.), skip
  }
  if (current) blocks.push(current);
  return blocks;
}

/**
 * Extract the speaker label and remaining speech text from a paragraph.
 * Speaker label = everything before the first run of 2+ spaces (within the first 60 chars).
 * The label must start with an uppercase letter.
 *
 * Examples:
 *   "ADAM  Yonder comes..." → label="ADAM", charName="ADAM", text="Yonder comes..."
 *   "OLIVER, threatening Orlando  What, boy!" → label="OLIVER, threatening Orlando", charName="OLIVER", text="What, boy!"
 *   "which God made, a poor unworthy..." → label="", no match
 */
function parseSpeakerLabel(text: string): {
  rawLabel: string;
  charName: string;
  speechText: string;
} {
  // Find first occurrence of 2+ spaces within first 80 characters
  const searchArea = text.slice(0, 80);
  const match = searchArea.match(/^(.+?)\s{2,}/);
  if (match) {
    const candidate = match[1].trim();
    // Must start with an uppercase letter (speaker labels are ALL_CAPS or mixed with delivery notes)
    if (/^[A-Z]/.test(candidate) && candidate.length >= 2) {
      // The char name is the part before the first comma (strips delivery notes)
      const charName = candidate.split(",")[0].trim();
      const speechText = text.slice(match[0].length).trim();
      return { rawLabel: candidate, charName, speechText };
    }
  }
  return { rawLabel: "", charName: "", speechText: text.trim() };
}

// ---------- Speech matching ----------

/**
 * Find the canonical speech that best matches this block.
 * Comparison: normalised first N tokens of block's combinedText vs each speech's full text.
 */
function matchBlockToSpeech(
  block: SpeakerBlock,
  speeches: Speech[],
  alreadyMatched: Set<string>
): Speech | null {
  if (!block.charName || !block.combinedText.trim()) return null;

  const normBlockName = block.charName.toLowerCase();
  const blockTokens = tokenize(block.combinedText).slice(
    0,
    SPEECH_MATCH_TOKENS
  );
  if (blockTokens.length === 0) return null;

  let bestSpeech: Speech | null = null;
  let bestScore = -1;

  for (const speech of speeches) {
    if (alreadyMatched.has(speech.id)) continue;

    // 1. Speaker name match (normalised)
    const normalizedSpeakerTag = speech.speakerTag?.toLowerCase() ?? "";
    const normalizedCharName = speech.characterName?.toLowerCase() ?? "";
    const nameMatch =
      normalizedSpeakerTag.includes(normBlockName) ||
      normalizedCharName.includes(normBlockName) ||
      normBlockName.includes(normalizedCharName.split(" ")[0] ?? "");

    if (!nameMatch) continue;

    // 2. Text similarity
    const speechFullText = speech.lines.map((l) => l.text).join(" ");
    const speechTokens = tokenize(speechFullText).slice(0, SPEECH_MATCH_TOKENS);
    const sim = jaccardSimilarity(blockTokens, speechTokens);

    if (sim > bestScore) {
      bestScore = sim;
      bestSpeech = speech;
    }
  }

  if (bestScore >= SPEECH_MATCH_THRESHOLD) return bestSpeech;

  // Fallback: if we have a single unmatched speech for this character, accept it
  // (handles very short speeches like "Ay." that score low but are the only option)
  if (bestSpeech && bestScore > 0.1) {
    const unmatchedForChar = speeches.filter(
      (s) =>
        !alreadyMatched.has(s.id) &&
        (s.speakerTag?.toLowerCase().includes(normBlockName) ||
          s.characterName?.toLowerCase().includes(normBlockName) ||
          normBlockName.includes(
            (s.characterName?.toLowerCase() ?? "").split(" ")[0]
          ))
    );
    if (unmatchedForChar.length === 1) return unmatchedForChar[0];
  }

  return null;
}

// ---------- Highlight application ----------

/**
 * For each highlight in the block's paragraphs, find it in the canonical speech's
 * lines and record cut operations.
 */
function applyBlockHighlights(
  block: SpeakerBlock,
  speech: Speech,
  cutMap: Record<string, "cut" | "kept">,
  lineCutMap: Record<string, "cut" | "kept">,
  speechEditsMap: Record<string, SpeechEdit>
): void {
  // Collect all highlighted spans from all paragraphs in the block
  // (strips speaker label text from the first paragraph before extracting spans)
  const hlSpans: string[] = [];
  const keptSpans: string[] = [];

  for (let pi = 0; pi < block.paragraphs.length; pi++) {
    const para = block.paragraphs[pi];

    // For the first paragraph, strip the speaker label runs before analysing highlights
    const effectiveRuns =
      pi === 0 ? strippedRuns(para, block.rawLabel) : para.runs;

    // Merge consecutive highlighted/non-highlighted runs
    let currentHl = "";
    let currentKept = "";
    for (const run of effectiveRuns) {
      if (run.isHighlighted) {
        if (currentKept.trim()) keptSpans.push(currentKept);
        currentKept = "";
        currentHl += run.text;
      } else {
        if (currentHl.trim()) hlSpans.push(currentHl);
        currentHl = "";
        currentKept += run.text;
      }
    }
    if (currentHl.trim()) hlSpans.push(currentHl);
    if (currentKept.trim()) keptSpans.push(currentKept);
  }

  if (hlSpans.length === 0) return; // Nothing highlighted in this block

  const hasKeptText = keptSpans.some((s) => tokenize(s).length > 0);

  // If nothing is un-highlighted → entire speech cut
  if (!hasKeptText) {
    cutMap[speech.id] = "cut";
    return;
  }

  // Partial highlight → try to map each highlighted span to canonical lines
  for (const hlText of hlSpans) {
    const hlTokens = tokenize(hlText);
    if (hlTokens.length === 0) continue;

    // Check if all lines in the speech have this span highlighted
    // → happens when the entire remaining speech text is highlighted
    let foundInAnyLine = false;

    for (const line of speech.lines) {
      const lineTokens = tokenize(line.text);
      if (lineTokens.length === 0) continue;

      // Check full-line match first
      const lineJaccard = jaccardSimilarity(hlTokens, lineTokens);

      if (lineJaccard >= 0.85) {
        // Entire line highlighted
        if (!cutMap[speech.id]) {
          lineCutMap[line.id] = "cut";
        }
        foundInAnyLine = true;
      } else {
        // Partial line match — try token span
        const span = findTokenSpan(hlText, line.text);
        if (span) {
          if (!speechEditsMap[speech.id]) {
            speechEditsMap[speech.id] = { unitId: speech.id, ops: [] };
          }
          speechEditsMap[speech.id].ops.push({
            type: "cut",
            lineId: line.id,
            start: span.start,
            end: span.end,
          });
          foundInAnyLine = true;
          // Don't break — highlighted text might span multiple lines
        }
      }
    }

    void foundInAnyLine; // acknowledged — we don't need to act on unfound spans
  }

  // Roll up: if all lines are now in lineCutMap → promote to speech-level cut
  if (speech.lines.length > 0) {
    const allLinesMarked = speech.lines.every(
      (l) => lineCutMap[l.id] === "cut"
    );
    if (allLinesMarked) {
      cutMap[speech.id] = "cut";
      for (const l of speech.lines) {
        delete lineCutMap[l.id];
      }
    }
  }
}

/**
 * For the first paragraph of a speaker block, strip the speaker label text from
 * the runs before analysing highlights (to avoid marking the label itself as a cut).
 */
function strippedRuns(
  para: DocxParagraph,
  rawLabel: string
): typeof para.runs {
  // Find where the speech text starts — after the speaker label + 2+ spaces
  const labelLen = rawLabel.length;
  let consumed = 0;
  let labelDone = false;
  const result: typeof para.runs = [];

  for (const run of para.runs) {
    if (labelDone) {
      result.push(run);
      continue;
    }
    const remaining = consumed + run.text.length;
    if (remaining <= labelLen) {
      // Entirely within the label — skip
      consumed = remaining;
    } else if (consumed < labelLen) {
      // Partially in label — slice the run
      const offset = labelLen - consumed;
      // Skip the leading 2+ spaces too
      const afterLabel = run.text.slice(offset);
      const trimmed = afterLabel.replace(/^\s+/, "");
      if (trimmed) {
        result.push({ text: trimmed, isHighlighted: run.isHighlighted });
      }
      consumed = remaining;
      labelDone = true;
    } else {
      result.push(run);
      labelDone = true;
    }
  }
  return result;
}

// ---------- Scene region detection ----------

interface SceneRegion {
  startIdx: number; // inclusive (first paragraph AFTER the heading)
  endIdx: number; // exclusive
}

function detectSceneRegions(
  paragraphs: DocxParagraph[],
  play: Play
): Map<string, SceneRegion> | null {
  interface HeadingMark {
    idx: number;
    actNum: number;
    sceneNum: number | null;
  }

  const marks: HeadingMark[] = [];
  let lastActNum = 0;

  for (let i = 0; i < paragraphs.length; i++) {
    const text = paragraphs[i].fullText.trim();
    if (!text) continue;

    // Combined "Act N, Scene M"
    const combined = text.match(COMBINED_RE);
    if (combined) {
      const a = parseNumber(combined[1]);
      const s = parseNumber(combined[2]);
      if (a > 0 && s > 0) {
        marks.push({ idx: i, actNum: a, sceneNum: s });
        lastActNum = a;
        continue;
      }
    }

    // Act-only heading (short paragraph)
    const actM = text.match(ACT_RE);
    if (actM && text.split(/\s+/).length <= 6) {
      const a = parseNumber(actM[1]);
      if (a > 0) {
        marks.push({ idx: i, actNum: a, sceneNum: null });
        lastActNum = a;
        continue;
      }
    }

    // Scene-only heading
    const sceneM = text.match(SCENE_RE);
    if (sceneM && text.split(/\s+/).length <= 6 && lastActNum > 0) {
      const s = parseNumber(sceneM[1]);
      if (s > 0) {
        marks.push({ idx: i, actNum: lastActNum, sceneNum: s });
        continue;
      }
    }
  }

  if (marks.length === 0) return null;
  if (!marks.some((m) => m.sceneNum !== null)) return null;

  // Canonical (actNum, sceneNum) → sceneId
  const canonicalMap = new Map<string, string>();
  for (const act of play.acts) {
    for (const scene of act.scenes) {
      canonicalMap.set(`${act.number}:${scene.number}`, scene.id);
    }
  }

  const sceneMarks = marks.filter(
    (m): m is HeadingMark & { sceneNum: number } => m.sceneNum !== null
  );

  const result = new Map<string, SceneRegion>();
  for (let i = 0; i < sceneMarks.length; i++) {
    const m = sceneMarks[i];
    const sceneId = canonicalMap.get(`${m.actNum}:${m.sceneNum}`);
    if (!sceneId) continue;
    const startIdx = m.idx + 1;
    const endIdx =
      i + 1 < sceneMarks.length ? sceneMarks[i + 1].idx : paragraphs.length;
    result.set(sceneId, { startIdx, endIdx });
  }

  return result.size > 0 ? result : null;
}
