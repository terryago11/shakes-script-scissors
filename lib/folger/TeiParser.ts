import { XMLParser } from "fast-xml-parser";
import type { Play, Act, Scene, ScriptUnit, Speech, StageDirection, Character, Line } from "@/types/play";

type XmlNode = Record<string, unknown>;

/**
 * Parse DraCor TEI XML for a Shakespeare play into our domain model.
 *
 * DraCor TEI structure (key elements):
 *   <TEI>
 *     <teiHeader>
 *       <fileDesc><titleStmt><title>...</title>
 *       <publicationStmt><idno>MND</idno>
 *     <text><body>
 *       <castList>
 *         <castItem sameAs="#CharId">
 *           <role><name>...</name>
 *       <div type="act" n="1">
 *         <head>ACT 1</head>
 *         <div type="scene" n="1">
 *           <head>Scene 1</head>
 *           <stage xml:id="stg-..." who="#A #B">...</stage>
 *           <sp xml:id="sp-..." who="#CharId">
 *             <speaker>NAME</speaker>
 *             <l xml:id="ftln-..." n="1.1.1">line text</l>
 *             <p xml:id="p-..."><lb xml:id="ftln-..."/>prose text</p>
 */
export function parseTei(xml: string, playId: string): Play {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    preserveOrder: true,
    textNodeName: "#text",
    trimValues: true,
    parseAttributeValue: false,
    // Don't parse tag content as numbers
    parseTagValue: false,
  });

  const doc = parser.parse(xml);
  // doc is an array; find the TEI node, then get its children
  const teiNode = findFirst(doc, "TEI");
  if (!teiNode) throw new Error("No <TEI> root element found");
  const teiChildren = getChildren(teiNode) as XmlNode[];

  // Extract title from teiHeader
  const title = extractTitle(teiChildren);

  // Extract cast list
  const castList = extractCastList(teiChildren, playId);

  // Extract acts/scenes from text body
  const bodyNode = findDeepFirst(teiChildren, "body");
  if (!bodyNode) throw new Error("No <body> element found");
  const bodyChildren = getChildren(bodyNode);

  const actDivs = collectByAttr(bodyChildren, "div", "@_type", "act");
  let speechIndex = 0;
  let stageIndex = 0;

  const acts: Act[] = actDivs.map((actDiv, actIdx) => {
    const actNum = parseInt(getAttr(actDiv, "@_n") || String(actIdx + 1), 10);
    const actChildren = getChildren(actDiv);
    const actHead = extractText(findFirst(actChildren, "head")) || `Act ${actNum}`;
    const sceneDivs = collectByAttr(actChildren, "div", "@_type", "scene");

    const scenes: Scene[] = sceneDivs.map((sceneDiv, sceneIdx) => {
      const sceneNum = parseInt(getAttr(sceneDiv, "@_n") || String(sceneIdx + 1), 10);
      const sceneChildren2 = getChildren(sceneDiv);
      const sceneHead = extractText(findFirst(sceneChildren2, "head")) || `Scene ${sceneNum}`;
      const sceneId = `${playId}-a${actNum}-s${sceneNum}`;

      const units: ScriptUnit[] = [];

      // Walk the scene children in order (use already-computed sceneChildren2)
      for (const child of sceneChildren2) {
        const tagName = getTagName(child);

        if (tagName === "stage") {
          const id = `${playId}-stg-${stageIndex++}`;
          const text = extractAllText(getChildren(child));
          const who = getAttr(child, "@_who") || "";
          const characters = who
            .split(/\s+/)
            .filter((w) => w.startsWith("#"))
            .map((w) => w);
          units.push({ type: "stage", id, text, characters });
        } else if (tagName === "sp") {
          try {
            const speech = parseSpeech(child, playId, speechIndex);
            speechIndex++;
            units.push(speech);
          } catch (e) {
            console.warn(`[TeiParser] Skipping malformed speech in ${sceneId}:`, e);
          }
        }
      }

      return {
        id: sceneId,
        number: sceneNum,
        title: sceneHead.trim(),
        units,
      };
    });

    return {
      id: `${playId}-a${actNum}`,
      number: actNum,
      title: actHead.trim(),
      scenes,
    };
  });

  return { id: playId, title, acts, castList };
}

function parseSpeech(spNode: unknown, playId: string, index: number): Speech {
  const id = getAttr(spNode, "@_xml:id") || `${playId}-sp-${index}`;
  const who = getAttr(spNode, "@_who") || "";
  // Take the first character ID if multiple speakers
  const characterId = who.split(/\s+/).find((w) => w.startsWith("#")) || who;

  const spChildren = getChildren(spNode);
  const speakerNode = findFirst(spChildren, "speaker");
  const characterName = speakerNode
    ? extractAllText(getChildren(speakerNode)).trim()
    : characterId.replace(/^#/, "").toUpperCase();

  const lines: Line[] = [];
  let lineIndex = 0;

  for (const child of spChildren) {
    const tag = getTagName(child);
    if (tag === "l") {
      // Verse line: <l xml:id="ftln-NNNN" n="1.1.1">text</l>
      const lineId = getAttr(child, "@_xml:id") || `${id}-l-${lineIndex}`;
      const n = getAttr(child, "@_n") || "";
      const ftln = parseFtln(lineId, n);
      const text = extractAllText(getChildren(child)).trim();
      if (text) {
        lines.push({ id: lineId, ftln, text });
        lineIndex++;
      }
    } else if (tag === "p") {
      // Prose paragraph may contain multiple <lb> markers, each marking one line.
      // <p xml:id="p-...">
      //   <lb xml:id="ftln-N" n="x.y.z"/>line one text <lb xml:id="ftln-M"/>line two text
      // </p>
      // Split at each <lb> boundary to produce one Line per lb.
      const pChildren = getChildren(child);
      const proseLines = splitProseByLb(pChildren, id, lineIndex);
      for (const pl of proseLines) {
        if (pl.text) {
          lines.push(pl);
          lineIndex++;
        }
      }
    }
    // <ab> (prose wrapper) - treat same as <l>
    else if (tag === "ab") {
      const lineId = getAttr(child, "@_xml:id") || `${id}-ab-${lineIndex}`;
      const n = getAttr(child, "@_n") || "";
      const ftln = parseFtln(lineId, n);
      const text = extractAllText(getChildren(child)).trim();
      if (text) {
        lines.push({ id: lineId, ftln, text });
        lineIndex++;
      }
    }
    // <lg> (line group / stanza, e.g. songs) - recurse into its <l> and <lg> children
    else if (tag === "lg") {
      const lgLines = extractLgLines(child, id, lineIndex);
      for (const ll of lgLines) {
        if (ll.text) {
          lines.push(ll);
          lineIndex++;
        }
      }
    }
    // <q> (quotation block) - treat its children as lines
    else if (tag === "q") {
      const qLines = extractLgLines(child, id, lineIndex);
      for (const ql of qLines) {
        if (ql.text) {
          lines.push(ql);
          lineIndex++;
        }
      }
    }
  }

  return {
    type: "speech",
    id,
    characterId,
    characterName,
    lines,
    lineCount: lines.length,
  };
}

function extractTitle(teiChildren: unknown[]): string {
  const titleStmtNode = findDeepFirst(teiChildren, "titleStmt");
  if (!titleStmtNode) return "Unknown Play";
  const titleNode = findFirst(getChildren(titleStmtNode), "title");
  return titleNode ? extractAllText(getChildren(titleNode)).trim() : "Unknown Play";
}

function extractCastList(teiChildren: unknown[], playId: string): Character[] {
  const castListNode = findDeepFirst(teiChildren, "castList");
  if (!castListNode) return [];

  const chars: Character[] = [];
  const castItems = collectAll(getChildren(castListNode), "castItem");

  for (const item of castItems) {
    // sameAs="#CharId_PlayId" is the authoritative ID
    const sameAs = getAttr(item, "@_sameAs");
    if (!sameAs) continue;
    const id = sameAs.startsWith("#") ? sameAs : `#${sameAs}`;

    const itemChildren = getChildren(item);
    const roleNode = findFirst(itemChildren, "role");
    const nameNode = roleNode ? findFirst(getChildren(roleNode), "name") : null;
    const name = nameNode
      ? extractAllText(getChildren(nameNode)).trim()
      : id.replace(/^#/, "").replace(/_.*$/, "");

    if (!chars.find((c) => c.id === id)) {
      chars.push({ id, name });
    }
  }

  void playId;
  return chars;
}

// --- XML traversal helpers ---

/**
 * In fast-xml-parser's preserveOrder mode, each node is:
 *   { tagName: [ { ":@": { attrs } }, ...children ] }
 * or a text node:
 *   { "#text": "string" }
 */

function getTagName(node: unknown): string | null {
  if (!node || typeof node !== "object") return null;
  const keys = Object.keys(node as object).filter((k) => k !== ":@");
  return keys[0] || null;
}

function getAttrs(node: unknown): Record<string, string> {
  if (!node || typeof node !== "object") return {};
  const n = node as XmlNode;
  const attrObj = n[":@"];
  if (!attrObj || typeof attrObj !== "object") return {};
  return attrObj as Record<string, string>;
}

function getAttr(node: unknown, attr: string): string | undefined {
  return getAttrs(node)[attr];
}

function getChildren(node: unknown): unknown[] {
  const tag = getTagName(node);
  if (!tag) return [];
  const n = node as XmlNode;
  const children = n[tag];
  return Array.isArray(children) ? children : [];
}

function findFirst(nodes: unknown[], tagName: string): unknown | null {
  for (const node of nodes) {
    if (!node || typeof node !== "object") continue;
    const tag = getTagName(node);
    if (tag === tagName) return node;
    // Skip ":@" entries
  }
  return null;
}

function findDeepFirst(nodes: unknown[], tagName: string): unknown | null {
  for (const node of nodes) {
    if (!node || typeof node !== "object") continue;
    const tag = getTagName(node);
    if (tag === tagName) return node;
    const children = getChildren(node);
    const found = findDeepFirst(children, tagName);
    if (found) return found;
  }
  return null;
}

function collectAll(nodes: unknown[], tagName: string): unknown[] {
  const results: unknown[] = [];
  for (const node of nodes) {
    if (!node || typeof node !== "object") continue;
    const tag = getTagName(node);
    if (tag === tagName) {
      results.push(node);
    }
    const children = getChildren(node);
    results.push(...collectAll(children, tagName));
  }
  return results;
}

function collectByAttr(
  nodes: unknown[],
  tagName: string,
  attr: string,
  value: string
): unknown[] {
  const results: unknown[] = [];
  for (const node of nodes) {
    if (!node || typeof node !== "object") continue;
    const tag = getTagName(node);
    if (tag === tagName && getAttr(node, attr) === value) {
      results.push(node);
    } else {
      const children = getChildren(node);
      results.push(...collectByAttr(children, tagName, attr, value));
    }
  }
  return results;
}

function extractText(node: unknown): string {
  if (!node) return "";
  const children = getChildren(node);
  for (const child of children) {
    if (child && typeof child === "object" && "#text" in (child as object)) {
      return String((child as XmlNode)["#text"] || "");
    }
  }
  return "";
}

function extractAllText(nodes: unknown[]): string {
  let text = "";
  for (const node of nodes) {
    if (!node || typeof node !== "object") {
      if (typeof node === "string") text += node;
      continue;
    }
    const n = node as XmlNode;
    if ("#text" in n) {
      text += String(n["#text"] || "");
      continue;
    }
    const tag = getTagName(n);
    if (!tag) continue;
    // Skip lb (line break markers in prose) and speaker tags
    if (tag === "lb" || tag === "speaker") continue;
    const children = getChildren(n);
    text += extractAllText(children);
  }
  return text;
}

/**
 * Recursively extract lines from an <lg> (line-group/stanza) element.
 * <lg> can contain <l>, <lg> (nested stanzas), and <p>/<ab> elements.
 */
function extractLgLines(lgNode: unknown, speechId: string, startIndex: number): Line[] {
  const lines: Line[] = [];
  let lineIndex = startIndex;
  for (const child of getChildren(lgNode)) {
    const tag = getTagName(child);
    if (tag === "l") {
      const lineId = getAttr(child, "@_xml:id") || `${speechId}-lg-l-${lineIndex}`;
      const n = getAttr(child, "@_n") || "";
      const ftln = parseFtln(lineId, n);
      const text = extractAllText(getChildren(child)).trim();
      if (text) { lines.push({ id: lineId, ftln, text }); lineIndex++; }
    } else if (tag === "lg") {
      const nested = extractLgLines(child, speechId, lineIndex);
      for (const l of nested) { if (l.text) { lines.push(l); lineIndex++; } }
    } else if (tag === "p") {
      const pChildren = getChildren(child);
      const proseLines = splitProseByLb(pChildren, speechId, lineIndex);
      for (const pl of proseLines) { if (pl.text) { lines.push(pl); lineIndex++; } }
    } else if (tag === "ab") {
      const lineId = getAttr(child, "@_xml:id") || `${speechId}-lg-ab-${lineIndex}`;
      const n = getAttr(child, "@_n") || "";
      const ftln = parseFtln(lineId, n);
      const text = extractAllText(getChildren(child)).trim();
      if (text) { lines.push({ id: lineId, ftln, text }); lineIndex++; }
    }
  }
  return lines;
}

/**
 * Split a prose <p>'s children into individual Line objects, one per <lb> marker.
 * Each <lb xml:id="ftln-N"/> marks the start of a new line; the text following it
 * (up to the next <lb> or end of paragraph) is that line's content.
 */
function splitProseByLb(pChildren: unknown[], speechId: string, startIndex: number): Line[] {
  const lines: Line[] = [];
  let currentLbId = "";
  let currentFtln = 0;
  let currentText = "";
  let lineIndex = startIndex;

  function flush() {
    const text = currentText.trim();
    if (text && currentLbId) {
      lines.push({ id: currentLbId, ftln: currentFtln, text });
      lineIndex++;
    }
    currentText = "";
  }

  for (const child of pChildren) {
    if (!child || typeof child !== "object") continue;
    const tag = getTagName(child);

    if (tag === "lb") {
      // New line boundary — flush previous segment
      flush();
      currentLbId = getAttr(child, "@_xml:id") || `${speechId}-lb-${lineIndex}`;
      const n = getAttr(child, "@_n") || "";
      currentFtln = parseFtln(currentLbId, n);
    } else if ("#text" in (child as Record<string, unknown>)) {
      currentText += String((child as Record<string, unknown>)["#text"] || "");
    } else if (tag) {
      // Inline elements (e.g. <hi>, <w>) — extract their text
      currentText += extractAllText(getChildren(child));
    }
  }
  flush();

  return lines;
}

/** Extract text from a prose <p>'s children array, skipping the <lb> line-break child */
function extractProseText(pChildren: unknown[]): string {
  let text = "";
  for (const child of pChildren) {
    if (!child || typeof child !== "object") continue;
    const tag = getTagName(child);
    if (tag === "lb") continue; // skip the line break marker
    if ("#text" in (child as object)) {
      text += String((child as XmlNode)["#text"] || "");
      continue;
    }
    text += extractAllText(getChildren(child));
  }
  return text;
}

/** Parse ftln number from xml:id like "ftln-0042" or n attribute like "1.1.42" */
function parseFtln(xmlId: string, n: string): number {
  // Try xml:id first: "ftln-0042" → 42
  const idMatch = xmlId.match(/ftln-(\d+)/);
  if (idMatch) return parseInt(idMatch[1], 10);
  // Try n attribute: "1.1.42" → parse last segment
  if (n) {
    const parts = n.split(".");
    const last = parts[parts.length - 1];
    const num = parseInt(last, 10);
    if (!isNaN(num)) return num;
  }
  return 0;
}
