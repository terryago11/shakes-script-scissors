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

  // Collect top-level structural divs in document order: acts + prologues + epilogues + inductions
  const TOP_DIV_TYPES = ["act", "prologue", "epilogue", "induction"];
  const topDivs = collectByAttrValues(bodyChildren, "div", "@_type", TOP_DIV_TYPES);

  let speechIndex = 0;
  let stageIndex = 0;

  // Helper: parse <stage> and <sp> children from a node list into ScriptUnit[]
  function parseSceneUnits(children: unknown[], sceneId: string): ScriptUnit[] {
    const units: ScriptUnit[] = [];
    // Track when a <label> element says "Song" immediately before a <sp>
    let precedingLabelIsSong = false;
    // Shared verse line chain: accumulates text of part="I" lines so part="F"/"I"+prev
    // fragments can be indented proportionally. Resets per scene (shared lines don't span scenes).
    const partCtx = { accumulatedText: "" };
    for (const child of children) {
      const tagName = getTagName(child);
      if (tagName === "label") {
        // <label>Song.</label> appears in scene context before a song speech
        const labelText = extractAllText(getChildren(child));
        precedingLabelIsSong = /\bsong\b|\bsings\b/i.test(labelText);
      } else if (tagName === "stage") {
        const stageType = getAttr(child, "@_type") as StageDirection["stageType"] | undefined;

        // "mixed" stage: a parent <stage type="mixed"> containing multiple child <stage> elements.
        // Process each sub-stage individually so Dance + exit appear as separate SDs in the script.
        // e.g. <stage type="mixed"><stage type="business">Dance.</stage><stage type="exit" who="...">All but Rosalind exit.</stage></stage>
        if (stageType === "mixed") {
          const subStages = getChildren(child).filter((c) => getTagName(c) === "stage");
          if (subStages.length > 0) {
            for (const sub of subStages) {
              const subType = getAttr(sub, "@_type") as StageDirection["stageType"] | undefined;
              const subText = extractAllText(getChildren(sub)).trim();
              const subWho = getAttr(sub, "@_who") || "";
              const subChars = [...new Set(subWho.split(/\s+/).filter((w) => w.startsWith("#")))];
              const isContentSub = !subType || subType === "business" || subType === "delivery";
              const subIsSong = (isContentSub && /\bsong\b|\bsings\b|\bsinging\b/i.test(subText)) || undefined;
              const subIsDance = (isContentSub && /\bdance\b|\bdances\b|\bdancing\b/i.test(subText)) || undefined;
              units.push({ type: "stage", id: `${playId}-stg-${stageIndex++}`, text: subText, characters: subChars, stageType: subType, isSong: subIsSong, isDance: subIsDance });
            }
            precedingLabelIsSong = false;
            continue;
          }
          // No child stages found — fall through to normal processing as a single SD
        }

        const text = extractAllText(getChildren(child));
        const who = getAttr(child, "@_who") || "";
        // Deduplicate: some TEI SDs list the same character ID twice (e.g. H5 #ATTENDANTS.ENGLISH)
        const characters = [...new Set(who.split(/\s+/).filter((w) => w.startsWith("#")))];
        // Only flag songs/dances on content SDs (business, delivery, or untyped).
        // Movement SDs (entrance, exit) should be treated as plain movement.
        const isContentSd = !stageType || stageType === "business" || stageType === "delivery";
        // `|| undefined` converts false → undefined so the field is omitted from the object (cleaner JSON)
        const isSong = (isContentSd && /\bsong\b|\bsings\b|\bsinging\b/i.test(text)) || undefined;
        const isDance = (isContentSd && /\bdance\b|\bdances\b|\bdancing\b/i.test(text)) || undefined;
        units.push({ type: "stage", id: `${playId}-stg-${stageIndex++}`, text, characters, stageType, isSong, isDance });
        precedingLabelIsSong = false;
      } else if (tagName === "sp") {
        const inSongContext = precedingLabelIsSong;
        precedingLabelIsSong = false; // reset — label applies to the immediately following speech only
        try {
          const speechUnits = parseSpeech(child, playId, speechIndex, castList, inSongContext, partCtx);
          speechIndex++;
          units.push(...speechUnits);
        } catch (e) {
          console.warn(`[TeiParser] Skipping malformed speech in ${sceneId}:`, e);
        }
      } else {
        // Any other element resets the label context
        precedingLabelIsSong = false;
      }
    }
    return units;
  }

  const acts: Act[] = [];
  let actFallbackN = 0;

  for (const topDiv of topDivs) {
    const divType = getAttr(topDiv, "@_type") ?? "act";
    const divChildren = getChildren(topDiv);
    const divHeadText = extractText(findFirst(divChildren, "head")) ?? "";

    // Determine act identity based on divType
    let actId: string;
    let actNum: number;
    let actTitle: string;
    let actDivType: Act["divType"];

    if (divType === "act") {
      actFallbackN++;
      actNum = parseInt(getAttr(topDiv, "@_n") || String(actFallbackN), 10);
      actId = `${playId}-a${actNum}`;
      actTitle = divHeadText || `Act ${actNum}`;
      actDivType = undefined; // "act" is the default
    } else if (divType === "prologue") {
      actNum = 0;
      actId = `${playId}-prologue`;
      actTitle = divHeadText || "Prologue";
      actDivType = "prologue";
    } else if (divType === "induction") {
      actNum = 0;
      actId = `${playId}-induction`;
      actTitle = divHeadText || "Induction";
      actDivType = "induction";
    } else {
      // "epilogue"
      actNum = 999;
      actId = `${playId}-epilogue`;
      actTitle = divHeadText || "Epilogue";
      actDivType = "epilogue";
    }

    // Collect scene, chorus, epilogue, and prologue divs within this structural div
    // (e.g. Henry V: choruses + epilogue are nested inside act divs)
    const SCENE_DIV_TYPES = ["scene", "chorus", "epilogue", "prologue"];
    const sceneDivs = collectByAttrValues(divChildren, "div", "@_type", SCENE_DIV_TYPES);

    let scenes: Scene[];

    if (sceneDivs.length === 0) {
      // No inner scene divs — whole div is one synthetic scene
      // (e.g. Henry V Prologue: direct <sp>/<stage> children, no <div type="scene">)
      const syntheticId = `${actId}-s1`;
      const units = parseSceneUnits(divChildren, syntheticId);
      scenes = units.length > 0
        ? [{ id: syntheticId, number: 1, title: actTitle, units }]
        : [];
    } else {
      let sceneFallbackN = 0;
      let chorusIdx = 0;
      scenes = sceneDivs.map((sceneDiv) => {
        const sceneType = getAttr(sceneDiv, "@_type") ?? "scene";
        const isChorus = sceneType === "chorus";
        const isEpilogue = sceneType === "epilogue";
        const isPrologue = sceneType === "prologue";
        const isSpecial = isChorus || isEpilogue || isPrologue;
        if (!isSpecial) sceneFallbackN++;
        const sceneNum = parseInt(getAttr(sceneDiv, "@_n") || String(sceneFallbackN), 10);
        const sceneChildren = getChildren(sceneDiv);
        const defaultTitle = isChorus ? "Chorus"
          : isEpilogue ? "Epilogue"
          : isPrologue ? "Prologue"
          : `Scene ${sceneNum}`;
        const sceneHeadText = extractText(findFirst(sceneChildren, "head")) || defaultTitle;
        const sceneId = isChorus
          ? `${actId}-chorus${chorusIdx++}`
          : isEpilogue
          ? `${actId}-epilogue`
          : isPrologue
          ? `${actId}-prologue`
          : `${actId}-s${sceneNum}`;

        const units = parseSceneUnits(sceneChildren, sceneId);

        const scene: Scene = {
          id: sceneId,
          number: isSpecial ? 0 : sceneNum,
          title: sceneHeadText.trim(),
          units,
        };
        if (isChorus) scene.sceneType = "chorus";
        else if (isEpilogue) scene.sceneType = "epilogue";
        else if (isPrologue) scene.sceneType = "prologue";
        return scene;
      });
    }

    const act: Act = {
      id: actId,
      number: actNum,
      title: actTitle.trim(),
      scenes,
    };
    if (actDivType) act.divType = actDivType;
    acts.push(act);
  }

  return { id: playId, title, acts, castList };
}

/**
 * <lg type> values that indicate a verse poem (not a sung song).
 * DraCor/Folger TEI uses rhyme-scheme codes (e.g. "AABBcDDc") for songs and
 * descriptor names (e.g. "quatrain") for non-sung verse.
 * When an <lg> has a type matching this set, its lines are NOT flagged as isSong.
 */
const POEM_LG_TYPES = new Set([
  "quatrain", "couplet", "sonnet", "verse", "tercet", "triplet",
  "sestet", "octave", "refrain", "distich", "strophe",
]);

/**
 * Parse a <sp> element into one or more ScriptUnit objects.
 *
 * Returns an array because a single <sp> can contain embedded <stage> elements
 * (e.g. "Enter Macbeth with bloody daggers." mid-speech), splitting it into
 * [Speech(lines-before), StageDirection, Speech(lines-after), ...].
 *
 * Pre-speech <stage> elements (before the first <l>) are absorbed into the
 * speaker tag as "[text]" so they render inline: "MACBETH, [within]".
 *
 * partCtx carries the accumulated text of part="I" lines across speeches
 * so part="F"/part="I"+prev fragments can be proportionally indented.
 */
function parseSpeech(
  spNode: unknown,
  playId: string,
  index: number,
  castList: Character[],
  /** True when a scene-level <label>Song.</label> immediately precedes this speech */
  inSongContext = false,
  /** Shared-line chain context — persists across speeches within a scene */
  partCtx: { accumulatedText: string } = { accumulatedText: "" },
): ScriptUnit[] {
  const id = getAttr(spNode, "@_xml:id") || `${playId}-sp-${index}`;
  const who = getAttr(spNode, "@_who") || "";
  // Take the first character ID if multiple speakers
  const characterId = who.split(/\s+/).find((w) => w.startsWith("#")) || who;

  const spChildren = getChildren(spNode);
  const speakerNode = findFirst(spChildren, "speaker");
  // Start with verbatim speaker tag text
  let speakerTagName = speakerNode
    ? extractAllText(getChildren(speakerNode)).trim()
    : characterId.replace(/^#/, "").toUpperCase();

  // Use canonical name from castList (avoids alias names like GANYMEDE for Rosalind)
  const castEntry = castList.find((c) => c.id === characterId);
  const characterName = castEntry ? castEntry.name.toUpperCase() : speakerTagName;

  void inSongContext; // reserved for future use (label context flows through POEM_LG_TYPES exclusion)

  // Segments: each embedded mid-speech <stage> creates a boundary.
  // segments[i] = lines for speech part i; embSds[i] = stage node emitted after segment i.
  const segments: Line[][] = [[]];
  const embSds: unknown[] = [];
  let lineIndex = 0;
  let hasAnyLines = false; // true once the first <l>/<p>/<lg>/... is encountered

  for (const child of spChildren) {
    const tag = getTagName(child);
    if (tag === "speaker") continue;

    if (tag === "stage") {
      if (!hasAnyLines) {
        // ── Pre-speech stage: absorb into speaker tag as "[text]" ──────────────
        // e.g. <stage type="location">, within</stage> → "MACBETH, [within]"
        const sdText = extractAllText(getChildren(child)).trim();
        if (sdText) {
          // Preserve a leading comma from the original TEI text (", within" pattern)
          if (sdText.startsWith(",")) {
            speakerTagName += `, [${sdText.slice(1).trim()}]`;
          } else {
            speakerTagName += ` [${sdText}]`;
          }
        }
      } else {
        // ── Mid-speech stage: split the speech here ─────────────────────────────
        embSds.push(child);
        segments.push([]);
      }
      continue;
    }

    if (tag === "l") {
      // Verse line: <l xml:id="ftln-NNNN" n="1.1.1" part="I|F" prev="#ftln-N">text</l>
      //
      // Shared verse line encoding (DraCor):
      //   part="I" (no prev)  → first fragment; start accumulating; no indent
      //   part="I" + prev=    → middle fragment; indent by accumulated length, then append text
      //   part="F"            → final fragment; indent by accumulated length, then reset
      //   (no part)           → reset accumulation
      const lineId = getAttr(child, "@_xml:id") || `${id}-l-${lineIndex}`;
      const n = getAttr(child, "@_n") || "";
      const ftln = parseFtln(lineId, n);
      const partAttr = getAttr(child, "@_part") ?? "";
      const prevAttr = getAttr(child, "@_prev") ?? "";
      const text = extractAllText(getChildren(child)).trim();
      if (text) {
        const line: Line = { id: lineId, ftln, text };
        if (partAttr === "I" && !prevAttr) {
          // First fragment — start chain, no indent on this line
          partCtx.accumulatedText = text;
        } else if (partAttr === "I" && prevAttr) {
          // Middle fragment — indent by accumulated so far, then extend chain
          line.partIndent = true;
          if (partCtx.accumulatedText) line.partIndentChars = partCtx.accumulatedText.length;
          partCtx.accumulatedText = partCtx.accumulatedText + " " + text;
        } else if (partAttr === "F") {
          // Final fragment — indent by full accumulated chain
          line.partIndent = true;
          if (partCtx.accumulatedText) line.partIndentChars = partCtx.accumulatedText.length;
          partCtx.accumulatedText = "";
        } else {
          // Non-shared line resets the chain
          partCtx.accumulatedText = "";
        }
        segments[segments.length - 1].push(line);
        lineIndex++;
        hasAnyLines = true;
      }
    } else if (tag === "p") {
      // Prose paragraph — split at <lb> markers
      const pChildren = getChildren(child);
      const proseLines = splitProseByLb(pChildren, id, lineIndex);
      for (const pl of proseLines) {
        if (pl.text) {
          segments[segments.length - 1].push(pl);
          lineIndex++;
          hasAnyLines = true;
        }
      }
      partCtx.accumulatedText = "";
    } else if (tag === "ab") {
      // <ab> prose wrapper — treat as single line
      const lineId = getAttr(child, "@_xml:id") || `${id}-ab-${lineIndex}`;
      const n = getAttr(child, "@_n") || "";
      const ftln = parseFtln(lineId, n);
      const text = extractAllText(getChildren(child)).trim();
      if (text) {
        segments[segments.length - 1].push({ id: lineId, ftln, text });
        lineIndex++;
        hasAnyLines = true;
      }
      partCtx.accumulatedText = "";
    } else if (tag === "lg") {
      // <lg> line group / stanza — songs vs poems
      const lgType = (getAttr(child, "@_type") ?? "").toLowerCase();
      const isSongStanza = !POEM_LG_TYPES.has(lgType);
      const lgLines = extractLgLines(child, id, lineIndex, isSongStanza);
      for (const ll of lgLines) {
        if (ll.text) {
          segments[segments.length - 1].push(ll);
          lineIndex++;
          hasAnyLines = true;
        }
      }
      partCtx.accumulatedText = "";
    } else if (tag === "q") {
      // <q> quotation block — treat as verse lines, not songs
      const qLines = extractLgLines(child, id, lineIndex, false);
      for (const ql of qLines) {
        if (ql.text) {
          segments[segments.length - 1].push(ql);
          lineIndex++;
          hasAnyLines = true;
        }
      }
      partCtx.accumulatedText = "";
    }
  }

  // ── Build result array ───────────────────────────────────────────────────────
  const result: ScriptUnit[] = [];
  const hasSplit = embSds.length > 0;

  for (let si = 0; si < segments.length; si++) {
    const segLines = segments[si];
    if (segLines.length === 0) continue;

    // Use original ID when there's no split (backward compatible);
    // use ${id}-p${si} suffix when the speech is split by embedded SDs.
    const segId = hasSplit ? `${id}-p${si}` : id;
    const speech: Speech = {
      type: "speech",
      id: segId,
      characterId,
      characterName,
      speakerTag: speakerTagName,
      lines: segLines,
      lineCount: segLines.length,
    };
    if (segLines.some((l) => l.isSong)) speech.isSong = true;
    result.push(speech);

    // Emit the embedded SD that follows this segment (if any)
    if (si < embSds.length) {
      const stageNode = embSds[si];
      const stageType = getAttr(stageNode, "@_type") as StageDirection["stageType"] | undefined;
      const stageText = extractAllText(getChildren(stageNode)).trim();
      const stageWho = getAttr(stageNode, "@_who") || "";
      const stageChars = [...new Set(stageWho.split(/\s+/).filter((w) => w.startsWith("#")))];
      const isContentSd = !stageType || stageType === "business" || stageType === "delivery";
      const isSong = (isContentSd && /\bsong\b|\bsings\b|\bsinging\b/i.test(stageText)) || undefined;
      const isDance = (isContentSd && /\bdance\b|\bdances\b|\bdancing\b/i.test(stageText)) || undefined;
      result.push({
        type: "stage",
        id: `${id}-emb-stg-${si}`,
        text: stageText,
        characters: stageChars,
        stageType,
        isSong,
        isDance,
      });
    }
  }

  // Edge case: no lines at all (speech has only speaker tag + pre-speech SDs)
  // Still emit a zero-line speech so the delivery note is visible.
  if (result.length === 0) {
    result.push({
      type: "speech",
      id,
      characterId,
      characterName,
      speakerTag: speakerTagName,
      lines: [],
      lineCount: 0,
    });
  }

  return result;
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
    // Some castItems use <role><name>King Claudius</name></role>,
    // others use <role>A Lord</role> (text directly in <role>, no <name> child).
    // When the TEI provides a name, use it verbatim — it's authored by Folger editors.
    // Only run normalizeCharacterName on the ID stem fallback (for unnamed group chars).
    const teiName = nameNode
      ? extractAllText(getChildren(nameNode)).trim().replace(/\s+/g, " ")
      : roleNode
        ? extractAllText(getChildren(roleNode)).trim().replace(/\s+/g, " ")
        : null;
    const name = teiName ?? normalizeCharacterName(id.replace(/^#/, "").replace(/_.*$/, ""));

    if (!chars.find((c) => c.id === id)) {
      chars.push({ id, name });
    }
  }

  void playId;
  return chars;
}

/**
 * Normalize character names from TEI ID stems into readable Title Case display names.
 *
 * ID patterns observed across the corpus (stem = part before _PlayId):
 *
 *   Simple:
 *     ATTENDANTS          → Attendants
 *     PLAYERS.1           → First Player
 *     PLAYERS.0.1         → First Player       (decimal ordinal)
 *     PLAYERS.King        → Player King
 *     PLAYERS.Queen       → Player Queen
 *
 *   With qualifier (GROUP.QUALIFIER.N or GROUP.QUALIFIER.N.M):
 *     LORDS.COURT.2       → Second Court Lord
 *     LORDS.DUMAINE.1     → First Lord Dumaine (proper name → append after noun)
 *     ATTENDANTS.KING.0.1 → First King Attendant
 *     SOLDIERS.0.1        → First Soldier
 *
 *   Qualifier only, no number (GROUP.QUALIFIER):
 *     FOLLOWERS.LAERTES   → Laertes' Follower  (proper name → possessive)
 *     ATTENDANTS.GUARDS   → Attendant Guards   (common noun → compound)
 *
 *   CamelCase compounds:
 *     GravediggersCompanion → Gravedigger's Companion
 *     Gravedigger           → Gravedigger  (no change)
 */
function normalizeCharacterName(raw: string): string {
  const ordinals: Record<string, string> = {
    "0": "First", "1": "First", "2": "Second", "3": "Third", "4": "Fourth",
    "5": "Fifth", "6": "Sixth", "7": "Seventh", "8": "Eighth", "9": "Ninth",
  };

  // Already contains apostrophe → already human-readable, just title-case
  if (raw.includes("'")) return toTitleCase(raw);

  // Only process dotted patterns here — split on dots first
  if (raw.includes(".")) {
    const parts = raw.split(".").map((p) => p.trim());

    // Derive the singular group noun from parts[0] (always the group)
    const groupSingular = toTitleCase(decapitalizePlural(parts[0]));

    // Single-letter group prefix (e.g. "X.Officer" in some DraCor data) — just use the rest
    if (groupSingular.length === 1) return toTitleCase(parts.slice(1).join(" "));

    // Collect the remaining parts
    const rest = parts.slice(1);

    // All-numeric tail? → ordinal (e.g. PLAYERS.1 or PLAYERS.0.1)
    // "all-numeric tail" = last part is a digit, second-to-last is also a digit (decimal) or nothing
    const lastPart = rest[rest.length - 1];
    const isNumericTail = /^\d+$/.test(lastPart);

    if (isNumericTail) {
      const ord = ordinals[lastPart] ?? `${lastPart}th`;
      // Middle qualifier parts (everything between group and the final number)
      const qualifiers = rest.slice(0, -1).filter((p) => !/^\d+$/.test(p));
      if (qualifiers.length === 0) {
        // e.g. PLAYERS.1, SOLDIERS.0.1 → "First Player"
        return `${ord} ${groupSingular}`;
      } else {
        // e.g. LORDS.COURT.2 → "Second Court Lord"
        //      LORDS.DUMAINE.1 → "First Lord Dumaine"  (proper name goes after)
        //      ATTENDANTS.KING.0.1 → "First King Attendant"
        const qualifier = toTitleCase(qualifiers.join(" "));
        if (isProperName(qualifiers[0])) {
          // Proper name: "First Lord Dumaine"
          return `${ord} ${groupSingular} ${qualifier}`;
        } else {
          // Common noun qualifier: "Second Court Lord"
          return `${ord} ${qualifier} ${groupSingular}`;
        }
      }
    }

    // Non-numeric tail → single qualifier word (GROUP.QUALIFIER)
    // e.g. FOLLOWERS.LAERTES, ATTENDANTS.GUARDS, PLAYERS.Queen
    // Groups that describe internal roles (not possession) always compound:
    //   PLAYERS.King → Player King (not "King's Player")
    // Groups that belong to someone use possessive: FOLLOWERS.LAERTES → Laertes' Follower
    // Title/honorific groups always use compound (Title Name): DOCTOR.PINCH → Dr Pinch
    const noPossessiveGroups = new Set(["player", "players"]);
    const titleGroups = new Set([
      "doctor", "dr", "friar", "father", "sir", "master", "mistress",
    ]);
    if (rest.length === 1) {
      const qualifier = rest[0];
      const groupLower = parts[0].toLowerCase();
      const qualifierLower = qualifier.toLowerCase();
      // Single-letter qualifier (e.g. DraCor "X" = anonymous group member) → "A/An GroupNoun"
      if (/^[A-Z]$/.test(qualifier)) {
        const article = /^[aeiou]/i.test(groupSingular) ? "An" : "A";
        return `${article} ${groupSingular}`;
      }
      // Nationality/demonym adjectives (e.g. ATTENDANTS.ENGLISH → "English Attendants")
      // These function as modifying adjectives, not possessives. Put qualifier first and
      // preserve the original plural form of the group noun (toTitleCase of parts[0]).
      const nationalityAdjectives = new Set([
        "english", "french", "scottish", "welsh", "dutch", "roman", "trojan", "greek",
        "venetian", "florentine", "paduan", "milanese", "egyptian", "turkish", "danish",
        "persian", "bohemian", "spanish", "irish", "german", "viennese",
      ]);
      if (nationalityAdjectives.has(qualifierLower)) {
        return `${toTitleCase(qualifier)} ${toTitleCase(parts[0])}`;
      }
      if (isProperName(qualifier) && !noPossessiveGroups.has(groupLower) && !titleGroups.has(groupLower)) {
        // Proper name → possessive: "Laertes' Follower"
        return `${toTitleCase(qualifier)}' ${groupSingular}`;
      } else {
        // Common noun, title group, or role-based group → compound: "Player Queen", "Dr Pinch"
        return `${groupSingular} ${toTitleCase(qualifier)}`;
      }
    }

    // GROUP.QUALIFIER.WORD (e.g. SOLDIERS.FORTINBRAS.Captain)
    if (rest.length === 2 && !/^\d+$/.test(rest[0]) && !/^\d+$/.test(rest[1])) {
      const qualifier = toTitleCase(rest[0]);
      const role = toTitleCase(rest[1]);
      if (isProperName(rest[0])) {
        return `${qualifier}'s ${role}`;
      } else {
        return `${qualifier} ${role}`;
      }
    }

    // Fallback for any other dotted pattern
    return toTitleCase(parts.join(" "));
  }

  // No dots — bare ALL CAPS group (e.g. ATTENDANTS → Attendants)
  if (/^[A-Z]+$/.test(raw)) return toTitleCase(raw);

  // Has spaces — already partially formatted
  if (raw.includes(" ")) return toTitleCase(raw);

  // CamelCase — handle known possessive compounds
  const possessiveRoots: [RegExp, string][] = [
    [/^Gravediggers(Companion)?$/i, "Gravedigger's Companion"],
    [/^Clowns(Companion)?$/i, "Clown's Companion"],
  ];
  for (const [pattern, replacement] of possessiveRoots) {
    if (pattern.test(raw)) return replacement;
  }

  // Generic CamelCase split (e.g. DukeSenior → Duke Senior)
  if (/[A-Z]/.test(raw.slice(1))) return splitCamelCase(raw);

  // Plain word — title-case it
  return toTitleCase(raw);
}

/**
 * Heuristic: is this a proper name (person/place) vs a common noun qualifier?
 * Proper names in the corpus: LAERTES, FORTINBRAS, DUMAINE, KING (borderline)
 * Common nouns: COURT, GUARDS, INTERPRETER
 * We treat ALL-CAPS words that match known character stems as proper names.
 * Fallback: words that look like English common nouns are not proper names.
 */
function isProperName(word: string): boolean {
  const commonNouns = new Set([
    "court", "guard", "guards", "interpreter", "soldier", "soldiers",
    "attendant", "attendants", "lord", "lords", "lady", "servant",
    "captain", "officer", "messenger", "ambassador", "king", "queen",
    "prince", "duke", "count", "earl", "jailer", "jailor",
  ]);
  return !commonNouns.has(word.toLowerCase());
}

/**
 * Title-case a string, keeping small connecting words (of, the, a, and, …)
 * lowercase unless they appear at the very start.
 * e.g. "DROMIO OF SYRACUSE" → "Dromio of Syracuse"
 */
const SMALL_WORDS = new Set([
  "of", "the", "a", "an", "and", "or", "but", "for",
  "in", "on", "at", "to", "by", "from", "with",
]);
function toTitleCase(s: string): string {
  return s.replace(/\b\w+/g, (word, offset) => {
    if (offset > 0 && SMALL_WORDS.has(word.toLowerCase())) return word.toLowerCase();
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  });
}

/** Remove trailing plural S/ES to get the stem for group names (e.g. "PLAYER" from "PLAYERS"). */
function decapitalizePlural(s: string): string {
  if (/[aeiou]s$/i.test(s)) return s; // "Chorus" — not a simple plural
  if (/es$/i.test(s)) return s.slice(0, -2);
  if (/s$/i.test(s)) return s.slice(0, -1);
  return s;
}

/** Split a CamelCase string into space-separated Title Case words. */
function splitCamelCase(s: string): string {
  const spaced = s
    .replace(/([A-Z][a-z]+)/g, " $1")
    .replace(/([A-Z]+)(?=[A-Z][a-z])/g, " $1")
    .trim();
  return toTitleCase(spaced);
}

/**
 * Convert a raw TEI character ID (e.g. "#PLAYERS_Ham", "#SOLDIERS.FORTINBRAS_Ham")
 * to a human-readable display name using the same normalization as the cast list.
 * Useful when a character appears in stage directions but has no formal <castItem>.
 */
export function characterIdToName(id: string): string {
  // Strip leading # and trailing _PlayId suffix (1-3 uppercase letters)
  const stem = id.replace(/^#/, "").replace(/_[A-Z][a-zA-Z]+$/, "");
  return normalizeCharacterName(stem);
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

/** Like collectByAttr but accepts multiple allowable values (in document order). */
function collectByAttrValues(
  nodes: unknown[],
  tagName: string,
  attr: string,
  values: string[]
): unknown[] {
  const results: unknown[] = [];
  for (const node of nodes) {
    if (!node || typeof node !== "object") continue;
    const tag = getTagName(node);
    const val = getAttr(node, attr) ?? "";
    if (tag === tagName && values.includes(val)) {
      results.push(node);
      // Don't recurse into matching nodes so we don't find nested acts/scenes
    } else {
      results.push(...collectByAttrValues(getChildren(node), tagName, attr, values));
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
 * @param isSong — when true, every extracted line gets `isSong: true` (marks it as a sung line)
 * @param stanzaPos — running position within the stanza (0-indexed); tracks indent alternation
 */
function extractLgLines(lgNode: unknown, speechId: string, startIndex: number, isSong = false, stanzaPos = { n: 0 }): Line[] {
  const lines: Line[] = [];
  let lineIndex = startIndex;
  for (const child of getChildren(lgNode)) {
    const tag = getTagName(child);
    if (tag === "l") {
      const lineId = getAttr(child, "@_xml:id") || `${speechId}-lg-l-${lineIndex}`;
      const n = getAttr(child, "@_n") || "";
      const ftln = parseFtln(lineId, n);
      const text = extractAllText(getChildren(child)).trim();
      if (text) {
        const line: Line = { id: lineId, ftln, text };
        if (isSong) {
          line.isSong = true;
        } else if (stanzaPos.n % 2 === 1) {
          // Odd position (0-indexed) = B-rhyme line in poem stanza → indent (Folger layout)
          line.poemIndent = true;
        }
        stanzaPos.n++;
        lines.push(line);
        lineIndex++;
      }
    } else if (tag === "lg") {
      // Nested <lg> inherits the isSong flag and continues the stanza position counter
      const nested = extractLgLines(child, speechId, lineIndex, isSong, stanzaPos);
      for (const l of nested) { if (l.text) { lines.push(l); lineIndex++; } }
    } else if (tag === "p") {
      const pChildren = getChildren(child);
      const proseLines = splitProseByLb(pChildren, speechId, lineIndex);
      for (const pl of proseLines) {
        if (pl.text) {
          if (isSong) {
            pl.isSong = true;
          } else if (stanzaPos.n % 2 === 1) {
            pl.poemIndent = true;
          }
          stanzaPos.n++;
          lines.push(pl);
          lineIndex++;
        }
      }
    } else if (tag === "ab") {
      const lineId = getAttr(child, "@_xml:id") || `${speechId}-lg-ab-${lineIndex}`;
      const n = getAttr(child, "@_n") || "";
      const ftln = parseFtln(lineId, n);
      const text = extractAllText(getChildren(child)).trim();
      if (text) {
        const line: Line = { id: lineId, ftln, text };
        if (isSong) {
          line.isSong = true;
        } else if (stanzaPos.n % 2 === 1) {
          line.poemIndent = true;
        }
        stanzaPos.n++;
        lines.push(line);
        lineIndex++;
      }
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
