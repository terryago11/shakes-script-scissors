/**
 * scripts/validate-counts.ts
 *
 * Parses all local TEI files from the shakedracor submodule and reports
 * line/character counts. Flags anomalies and validates known good counts.
 *
 * Run via: npm run validate
 * Requires: git submodule update --init (shakedracor must be checked out)
 */

import { createJiti } from "jiti";
import { promises as fs } from "fs";
import path from "path";

const jiti = createJiti(process.cwd(), {
  alias: { "@": process.cwd() },
});

const { PLAYS } = (await jiti.import(
  "@/lib/folger/FolgerClient"
)) as typeof import("../lib/folger/FolgerClient");

const { parseTei } = (await jiti.import(
  "@/lib/folger/TeiParser"
)) as typeof import("../lib/folger/TeiParser");

const TEI_DIR = path.join(process.cwd(), "shakedracor", "tei");

// Known good line counts to validate against
const KNOWN_COUNTS: Record<string, number> = {
  MND: 2200,
  Ham: 4058,
};
const KNOWN_TOLERANCE = 10;

interface PlayReport {
  id: string;
  title: string;
  lineCount: number;
  characterCount: number;
  zeroLineCharacters: string[];
  parseError?: string;
  missingFile?: boolean;
  dracorOnly?: boolean;
}

async function validatePlay(
  id: string,
  slug: string,
  title: string,
  localFile: string | undefined,
  noLocal: boolean | undefined
): Promise<PlayReport> {
  if (noLocal) {
    return { id, title, lineCount: 0, characterCount: 0, zeroLineCharacters: [], dracorOnly: true };
  }

  const filename = localFile ?? slug;
  const filePath = path.join(TEI_DIR, `${filename}.xml`);

  try {
    const xml = await fs.readFile(filePath, "utf-8");
    const play = parseTei(xml, id);

    let lineCount = 0;
    const charLineCounts = new Map<string, number>();

    for (const act of play.acts) {
      for (const scene of act.scenes) {
        for (const unit of scene.units) {
          if (unit.type === "speech") {
            lineCount += unit.lineCount;
            const prev = charLineCounts.get(unit.characterId) ?? 0;
            charLineCounts.set(unit.characterId, prev + unit.lineCount);
          }
        }
      }
    }

    const zeroLineChars: string[] = [];
    for (const char of play.castList) {
      if ((charLineCounts.get(char.id) ?? 0) === 0) {
        zeroLineChars.push(char.name || char.id);
      }
    }

    return {
      id,
      title: play.title,
      lineCount,
      characterCount: play.castList.length,
      zeroLineCharacters: zeroLineChars,
    };
  } catch (e) {
    const msg = String(e instanceof Error ? e.message : e);
    if (msg.includes("ENOENT") || msg.includes("no such file")) {
      return { id, title, lineCount: 0, characterCount: 0, zeroLineCharacters: [], missingFile: true };
    }
    return { id, title, lineCount: 0, characterCount: 0, zeroLineCharacters: [], parseError: msg };
  }
}

async function main() {
  console.log(`\nShakesScriptScissors — Validate TEI Counts`);
  console.log(`Parsing plays from shakedracor/tei/\n`);

  const reports: PlayReport[] = [];

  for (const play of PLAYS) {
    process.stdout.write(`  ${play.title}... `);
    const report = await validatePlay(play.id, play.slug, play.title, play.localFile, play.noLocal);
    reports.push(report);
    if (report.dracorOnly) {
      console.log("DraCor-only (not in submodule)");
    } else if (report.missingFile) {
      console.log("MISSING FILE");
    } else if (report.parseError) {
      console.log(`PARSE ERROR`);
    } else {
      console.log(`${report.lineCount} lines, ${report.characterCount} chars`);
    }
  }

  // Print table
  const LINE = "─".repeat(72);
  console.log(`\n${LINE}`);
  console.log(`${"ID".padEnd(6)} ${"Lines".padStart(6)} ${"Chars".padStart(6)}  Title`);
  console.log(LINE);

  const issues: string[] = [];

  for (const r of reports) {
    const flag = r.dracorOnly ? "(DraCor only)" : r.missingFile ? "MISSING" : r.parseError ? "ERROR" : "";
    console.log(
      `${r.id.padEnd(6)} ${String(r.lineCount).padStart(6)} ${String(r.characterCount).padStart(6)}  ${r.title} ${flag}`
    );

    if (r.missingFile) {
      issues.push(`MISSING FILE: ${r.id} — run: git submodule update --init`);
    }
    if (r.parseError) {
      issues.push(`PARSE ERROR: ${r.id} (${r.title}) — ${r.parseError}`);
    }
    if (!r.dracorOnly && !r.missingFile && !r.parseError) {
      if (r.lineCount < 200) {
        issues.push(`LOW LINE COUNT: ${r.id} only has ${r.lineCount} lines`);
      }
      if (r.lineCount > 5500) {
        issues.push(`HIGH LINE COUNT: ${r.id} has ${r.lineCount} lines`);
      }
      if (r.zeroLineCharacters.length > 0) {
        issues.push(`ZERO LINES: ${r.id} — chars with 0 lines: ${r.zeroLineCharacters.join(", ")}`);
      }
    }

    // Validate known counts
    if (KNOWN_COUNTS[r.id] !== undefined && !r.dracorOnly && !r.missingFile && !r.parseError) {
      const expected = KNOWN_COUNTS[r.id];
      const diff = Math.abs(r.lineCount - expected);
      if (diff > KNOWN_TOLERANCE) {
        issues.push(
          `COUNT MISMATCH: ${r.id} expected ~${expected} lines, got ${r.lineCount} (diff: ${diff})`
        );
      }
    }
  }

  const parsed = reports.filter((r) => !r.dracorOnly && !r.missingFile && !r.parseError);
  const dracorOnly = reports.filter((r) => r.dracorOnly);

  console.log(LINE);
  console.log(`\nTotal plays: ${reports.length}`);
  console.log(`Parsed from submodule: ${parsed.length}`);
  console.log(`DraCor API only: ${dracorOnly.map((r) => r.id).join(", ") || "none"}`);

  // Known count summary
  for (const id of Object.keys(KNOWN_COUNTS)) {
    const r = reports.find((r) => r.id === id);
    if (r && !r.dracorOnly && !r.missingFile && !r.parseError) {
      const expected = KNOWN_COUNTS[id];
      const diff = Math.abs(r.lineCount - expected);
      if (diff <= KNOWN_TOLERANCE) {
        console.log(`  ✓ ${id}: ${r.lineCount} lines (expected ~${expected})`);
      }
    }
  }

  if (issues.length > 0) {
    console.log(`\nISSUES:`);
    for (const issue of issues) console.log(`  ! ${issue}`);
    process.exit(1);
  } else {
    console.log(`\nAll plays validated successfully.`);
  }
}

main().catch((e) => {
  console.error("Fatal error:", e);
  process.exit(1);
});
