/**
 * Client-side .docx parser that extracts paragraphs with per-run highlight info.
 *
 * A .docx file is a ZIP archive. The main content lives in word/document.xml.
 * We unzip it with jszip, parse with fast-xml-parser, and walk the paragraph tree.
 *
 * Only <w:highlight> is treated as a cut indicator — all other formatting (bold,
 * italic, colour, strikethrough, track-change markup) is ignored.
 */

import JSZip from "jszip";
import { XMLParser } from "fast-xml-parser";

// ---------- Public types ----------

export interface DocxRun {
  text: string;
  isHighlighted: boolean;
}

export interface DocxParagraph {
  /** All text runs in document order. */
  runs: DocxRun[];
  /** Concatenation of all run texts — convenience field. */
  fullText: string;
  /** Word paragraph style value, e.g. "Heading1", "Normal". May be undefined. */
  styleId?: string;
}

// ---------- Main entry point ----------

/**
 * Open a .docx file and return all non-empty paragraphs with per-run highlight info.
 *
 * - Tracked-change deletions (<w:del>) are skipped — their text is not visible.
 * - Tracked-change insertions (<w:ins>) are included as regular runs.
 * - Hyperlink content (<w:hyperlink>) is included.
 */
export async function extractParagraphs(file: File): Promise<DocxParagraph[]> {
  const arrayBuffer = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(arrayBuffer);

  const docEntry = zip.file("word/document.xml");
  if (!docEntry) throw new Error("Not a valid .docx file (missing word/document.xml)");
  const docXml = await docEntry.async("string");

  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    textNodeName: "#text",
    trimValues: false, // preserve leading/trailing spaces inside <w:t>
    parseTagValue: false,
    parseAttributeValue: false,
    // Ensure these always come back as arrays regardless of how many appear
    isArray: (tagName) =>
      ["w:p", "w:r", "w:ins", "w:hyperlink", "w:del", "w:sdt", "w:sdtContent"].includes(tagName),
  });

  const parsed = parser.parse(docXml);

  // Locate w:body — standard path is parsed["w:document"]["w:body"]
  // Some generators use wpc: or pkg: wrappers; fall back to searching top-level values.
  const wDoc =
    parsed["w:document"] ??
    parsed["w:wordDocument"] ??
    (Object.values(parsed).find(
      (v) => v && typeof v === "object" && "w:body" in (v as object)
    ) as Record<string, unknown> | undefined);

  const body = (wDoc as Record<string, unknown> | undefined)?.["w:body"];
  if (!body || typeof body !== "object") {
    throw new Error("Could not locate <w:body> in document XML");
  }

  const rawParas: unknown[] = asArray((body as Record<string, unknown>)["w:p"]);
  const result: DocxParagraph[] = [];

  for (const rawP of rawParas) {
    const p = rawP as Record<string, unknown>;
    const styleId = extractStyleId(p);
    const runs: DocxRun[] = [];
    collectRuns(p, runs);
    const fullText = runs.map((r) => r.text).join("");
    if (fullText.trim()) {
      result.push({ runs, fullText, styleId });
    }
  }

  return result;
}

// ---------- Helpers ----------

/** Extract paragraph style from w:pPr/w:pStyle/@w:val */
function extractStyleId(p: Record<string, unknown>): string | undefined {
  const pPr = p["w:pPr"] as Record<string, unknown> | undefined;
  if (!pPr) return undefined;
  const pStyle = pPr["w:pStyle"] as Record<string, unknown> | undefined;
  if (!pStyle) return undefined;
  const val = pStyle["@_w:val"];
  return typeof val === "string" ? val : undefined;
}

/**
 * Collect runs from a paragraph node into `acc`.
 * Recurses into w:hyperlink and w:ins; skips w:del entirely.
 * Also handles w:sdt (structured document tags, e.g. from content controls).
 */
function collectRuns(node: Record<string, unknown>, acc: DocxRun[]): void {
  // Direct runs
  for (const r of asArray(node["w:r"])) {
    pushRun(r as Record<string, unknown>, acc);
  }
  // Inside hyperlinks
  for (const hl of asArray(node["w:hyperlink"])) {
    collectRuns(hl as Record<string, unknown>, acc);
  }
  // Tracked insertions — include as normal (may themselves be highlighted)
  for (const ins of asArray(node["w:ins"])) {
    for (const r of asArray((ins as Record<string, unknown>)["w:r"])) {
      pushRun(r as Record<string, unknown>, acc);
    }
  }
  // Structured document tags (content controls)
  for (const sdt of asArray(node["w:sdt"])) {
    const content = (sdt as Record<string, unknown>)["w:sdtContent"];
    if (content && typeof content === "object") {
      for (const cp of asArray((content as Record<string, unknown>)["w:p"])) {
        collectRuns(cp as Record<string, unknown>, acc);
      }
      collectRuns(content as Record<string, unknown>, acc);
    }
  }
  // w:del is intentionally NOT processed — deleted text is invisible
}

/** Push a single <w:r> run into acc, detecting highlight. */
function pushRun(run: Record<string, unknown>, acc: DocxRun[]): void {
  const rPr = run["w:rPr"] as Record<string, unknown> | undefined;
  // Any w:highlight child (any color) → highlighted
  const isHighlighted = rPr != null && rPr["w:highlight"] != null;
  const text = extractRunText(run["w:t"]);
  if (text) acc.push({ text, isHighlighted });
}

/** Extract text from a <w:t> node — handles plain string or {#text, @_xml:space} object. */
function extractRunText(wt: unknown): string {
  if (typeof wt === "string") return wt;
  if (typeof wt === "number") return String(wt);
  if (typeof wt === "object" && wt !== null) {
    const v = (wt as Record<string, unknown>)["#text"];
    return v != null ? String(v) : "";
  }
  return "";
}

function asArray<T>(v: T | T[] | undefined | null): T[] {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}
