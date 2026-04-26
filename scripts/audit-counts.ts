/**
 * scripts/audit-counts.ts
 *
 * 6-pass count audit harness. Loads a representative play, constructs synthetic Cut
 * variants covering every interpretive surface (cutMap / lineCutMap / speechEdits /
 * speechReassignments), runs CutEngine + the integrity check on each, and prints a
 * pass/fail table.
 *
 * The integrity check runs in production too (logged from SceneDashboard); this script
 * is the offline regression harness — extend with new passes when a new count surface
 * is added.
 *
 * Run via: npm run audit-counts
 * Requires: shakedracor submodule checked out.
 */

import { createJiti } from "jiti";
import { promises as fs } from "fs";
import path from "path";

const jiti = createJiti(process.cwd(), {
  alias: { "@": process.cwd() },
});

const { parseTei } = (await jiti.import(
  "@/lib/folger/TeiParser"
)) as typeof import("../lib/folger/TeiParser");

const { computeCuts, getAllUnitsInOrder } = (await jiti.import(
  "@/lib/cuts/CutEngine"
)) as typeof import("../lib/cuts/CutEngine");

const { runCountIntegrityCheck } = (await jiti.import(
  "@/lib/cuts/countIntegrityCheck"
)) as typeof import("../lib/cuts/countIntegrityCheck");

import type { Play } from "../types/play";
import type { Cut } from "../types/project";
import type { SpeechEdit } from "../types/edit";

const PLAY_FILE = path.join(process.cwd(), "shakedracor", "tei", "hamlet.xml");

function emptyCut(name: string): Cut {
  return {
    id: `audit:${name}`,
    name,
    createdAt: new Date().toISOString(),
    cutMap: {},
  };
}

interface PassResult {
  name: string;
  description: string;
  ok: boolean;
  charsChecked: number;
  discrepancyCount: number;
  totals: { origLines: number; afterLines: number; origWords: number; afterWords: number };
  firstFew: string[];
}

function runPass(play: Play, name: string, description: string, build: () => Cut): PassResult {
  const cut = build();
  const { lineCounts } = computeCuts(play, cut, [], []);
  const report = runCountIntegrityCheck(lineCounts);
  return {
    name,
    description,
    ok: report.ok,
    charsChecked: report.charsChecked,
    discrepancyCount: report.discrepancies.length,
    totals: {
      origLines: lineCounts.total.original,
      afterLines: lineCounts.total.afterCut,
      origWords: lineCounts.words.total.original,
      afterWords: lineCounts.words.total.afterCut,
    },
    firstFew: report.discrepancies.slice(0, 5).map(
      (d) => `  - ${d.charId} ${d.field} (${d.source}): expected ${d.expected}, got ${d.actual}`,
    ),
  };
}

function collectSpeechIds(play: Play, take: number, predicate?: (id: string) => boolean): string[] {
  const ids: string[] = [];
  for (const unit of getAllUnitsInOrder(play)) {
    if (unit.type !== "speech") continue;
    if (predicate && !predicate(unit.id)) continue;
    ids.push(unit.id);
    if (ids.length >= take) break;
  }
  return ids;
}

function collectLineIds(play: Play, take: number): string[] {
  const ids: string[] = [];
  for (const unit of getAllUnitsInOrder(play)) {
    if (unit.type !== "speech") continue;
    for (const line of unit.lines) {
      ids.push(line.id);
      if (ids.length >= take) return ids;
    }
  }
  return ids;
}

interface SpeechRef {
  unitId: string;
  characterId: string;
  firstLineId: string;
  firstLineLength: number;
}
function findSpeechWithLines(play: Play, count: number): SpeechRef[] {
  const out: SpeechRef[] = [];
  for (const unit of getAllUnitsInOrder(play)) {
    if (unit.type !== "speech" || unit.lines.length === 0) continue;
    const firstLine = unit.lines[0];
    if (firstLine.text.length < 10) continue;
    out.push({ unitId: unit.id, characterId: unit.characterId, firstLineId: firstLine.id, firstLineLength: firstLine.text.length });
    if (out.length >= count) return out;
  }
  return out;
}

async function main() {
  console.log("\nShakesScriptScissors — Count Audit Harness");
  console.log(`Play: ${PLAY_FILE}\n`);

  const xml = await fs.readFile(PLAY_FILE, "utf-8");
  const play = parseTei(xml, "Ham");
  console.log(`Loaded "${play.title}": ${play.castList.length} characters, ${play.acts.length} acts\n`);

  const speechIds10 = collectSpeechIds(play, 10);
  const lineIds20 = collectLineIds(play, 20);
  const speechRefs = findSpeechWithLines(play, 8);
  const altChar = play.castList.find((c) => speechRefs.length > 0 && c.id !== speechRefs[0].characterId)?.id;

  const passes: PassResult[] = [];

  passes.push(runPass(play, "P1", "No cuts at all", () => emptyCut("P1")));

  passes.push(runPass(play, "P2", "Speech-level cuts (5 speeches)", () => {
    const cut = emptyCut("P2");
    for (const id of speechIds10.slice(0, 5)) cut.cutMap[id] = "cut";
    return cut;
  }));

  passes.push(runPass(play, "P3", "Line-level cuts (20 lines)", () => {
    const cut = emptyCut("P3");
    cut.lineCutMap = {};
    for (const id of lineIds20) cut.lineCutMap[id] = "cut";
    return cut;
  }));

  passes.push(runPass(play, "P4", "Word-level edits (cut first 5 chars of first line in 5 speeches)", () => {
    const cut = emptyCut("P4");
    cut.speechEdits = {};
    for (const ref of speechRefs.slice(0, 5)) {
      const edit: SpeechEdit = {
        unitId: ref.unitId,
        ops: [{ type: "cut", lineId: ref.firstLineId, start: 0, end: Math.min(5, ref.firstLineLength) }],
      };
      cut.speechEdits[ref.unitId] = edit;
    }
    return cut;
  }));

  passes.push(runPass(play, "P5", "Reassignments (3 speeches reassigned)", () => {
    const cut = emptyCut("P5");
    cut.speechReassignments = {};
    if (altChar) {
      for (const ref of speechRefs.slice(0, 3)) {
        cut.speechReassignments[ref.unitId] = [altChar];
      }
    }
    return cut;
  }));

  passes.push(runPass(play, "P6", "Combined: cuts + line cuts + word edits + reassignments", () => {
    const cut = emptyCut("P6");
    cut.lineCutMap = {};
    cut.speechEdits = {};
    cut.speechReassignments = {};
    for (const id of speechIds10.slice(0, 3)) cut.cutMap[id] = "cut";
    for (const id of lineIds20.slice(0, 10)) cut.lineCutMap[id] = "cut";
    for (const ref of speechRefs.slice(3, 6)) {
      cut.speechEdits[ref.unitId] = {
        unitId: ref.unitId,
        ops: [{ type: "cut", lineId: ref.firstLineId, start: 0, end: Math.min(3, ref.firstLineLength) }],
      };
    }
    if (altChar) {
      for (const ref of speechRefs.slice(6, 8)) {
        cut.speechReassignments[ref.unitId] = [altChar];
      }
    }
    return cut;
  }));

  const LINE = "─".repeat(86);
  console.log(LINE);
  console.log(
    `${"Pass".padEnd(4)} ${"Status".padEnd(7)} ${"Chars".padStart(5)} ${"Disc.".padStart(5)} ${"Lines (orig→cut)".padEnd(20)} ${"Words (orig→cut)".padEnd(22)}`,
  );
  console.log(LINE);

  let allOk = true;
  for (const p of passes) {
    const status = p.ok ? "PASS" : "FAIL";
    if (!p.ok) allOk = false;
    const lines = `${p.totals.origLines}→${p.totals.afterLines}`.padEnd(20);
    const words = `${p.totals.origWords}→${p.totals.afterWords}`.padEnd(22);
    console.log(
      `${p.name.padEnd(4)} ${status.padEnd(7)} ${String(p.charsChecked).padStart(5)} ${String(p.discrepancyCount).padStart(5)} ${lines} ${words}  ${p.description}`,
    );
    if (!p.ok) {
      for (const line of p.firstFew) console.log(line);
      if (p.discrepancyCount > p.firstFew.length) {
        console.log(`  ... ${p.discrepancyCount - p.firstFew.length} more`);
      }
    }
  }
  console.log(LINE);

  if (allOk) {
    console.log("\nAll passes OK — engine remains the sole source of truth for counts.\n");
  } else {
    console.log("\nFAIL — at least one integrity invariant was violated. See discrepancies above.\n");
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("Fatal error:", e);
  process.exit(1);
});
