import type { Play } from "@/types/play";
import type { Cut } from "@/types/project";

export interface PropReference {
  /** Matched keyword (lowercase) */
  prop: string;
  source: "sd" | "speech";
  /** High = action verb on same line; low = demonstrative context only. Undefined for SD refs. */
  confidence?: "high" | "low";
  /** Full SD text (source === "sd") */
  sdText: string;
  sdId: string;
  /** Speech line text (source === "speech") */
  lineText?: string;
  lineId?: string;
  characterName?: string;
  sceneId: string;
  actNum: number;
  sceneNum: number;
  /** Scene-relative kept-line count at the point of this reference */
  approxLine: number;
}

const PROP_KEYWORDS = [
  "sword", "swords",
  "dagger", "daggers",
  "knife", "knives",
  "torch", "torches",
  "candle", "candles",
  "taper", "tapers",
  "letter", "letters",
  "scroll", "scrolls",
  "paper", "papers",
  "ring", "rings",
  "crown", "crowns",
  "cup", "cups",
  "goblet", "goblets",
  "poison", "vial", "vials",
  "staff", "staves",
  "sceptre", "scepter",
  "wand",
  "handkerchief", "handkerchiefs",
  "glove", "gloves",
  "flower", "flowers",
  "herb", "herbs",
  "garland", "garlands",
  "book", "books",
  "lantern", "lanterns",
  "flag", "flags",
  "banner", "banners",
  "skull",
  "head",
  "body",
  "coffin",
  "bed",
  "throne",
  "bow", "bows",
  "arrow", "arrows",
  "spear", "spears",
  "axe", "axes",
  "shield", "shields",
  "key", "keys",
  "casket", "caskets",
  "purse",
  "coin", "coins",
  "wine",
  "food",
  "table",
];

// Deduplicate and build a single regex
const uniqueKeywords = [...new Set(PROP_KEYWORDS)];
const propPattern = new RegExp(
  `\\b(${uniqueKeywords.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\\b`,
  "gi"
);

// Normalise a matched keyword to its singular canonical form for grouping
function canonicalize(word: string): string {
  if (word === "knives") return "knife";
  if (word === "staves") return "staff";
  if (word === "scepter") return "sceptre";
  // -es ending: try stem, then stem + e (e.g. torches→torch, axes→axe, gloves→glove)
  if (word.endsWith("es")) {
    const stem = word.slice(0, -2);
    if (uniqueKeywords.includes(stem)) return stem;
    if (uniqueKeywords.includes(stem + "e")) return stem + "e";
  }
  // -s ending: try stem (e.g. swords→sword, books→book)
  if (word.endsWith("s")) {
    const stem = word.slice(0, -1);
    if (uniqueKeywords.includes(stem)) return stem;
  }
  return word;
}

// Words excluded from speech scanning: body parts + large set pieces (SD-only props)
const SPEECH_EXCLUDED = new Set(["head", "body", "bed", "throne", "table", "coffin", "bow"]);

// Action verbs that imply a prop is physically present
const actionVerbPattern =
  /\b(give|gave|given|take|took|taken|draw|drew|drawn|hold|held|show|shows|showed|shown|read|reads|drink|drank|drunk|bring|brought|fetch|hand|handed|wear|wore|worn|bear|bore|borne|carry|carried|use|used|put|place|placed|set|lay|laid|throw|threw|thrown|strike|struck|stricken|stab|stabbed|sheathe|sheathed|open|opened|seal|sealed|light|lit|lights|cut|cuts|burn|burns|burned|burnt|seize|seized|seizes|raise|raised|drop|drops|dropped|thrust|thrusts|thrust)\b/i;

// Demonstrative/possessive immediately before the prop keyword (within 3 words)
function hasDemonstrativeContext(line: string, matchIndex: number): boolean {
  // Look at up to 30 chars before the match for demonstrative/possessive
  const before = line.slice(Math.max(0, matchIndex - 30), matchIndex);
  return /\b(this|the|thy|my|your|his|her|our|their|yon|yond)\s+\w*\s*$/i.test(before);
}

export function scanProps(play: Play, cut: Cut): PropReference[] {
  const results: PropReference[] = [];

  for (const act of play.acts) {
    const actNum = act.number ?? 0;
    for (const scene of act.scenes) {
      const sceneNum = scene.number ?? 0;
      let approxLine = 0;

      for (const unit of scene.units) {
        if (unit.type === "speech") {
          if (cut.cutMap[unit.id] === "cut") continue;
          approxLine += unit.lineCount;

          // Scan speech lines for dialogue-embedded prop references
          for (const line of unit.lines) {
            const lineText = line.text;
            if (!lineText) continue;
            propPattern.lastIndex = 0;
            const matchedInLine = new Set<string>();
            let m: RegExpExecArray | null;
            while ((m = propPattern.exec(lineText)) !== null) {
              const keyword = m[1].toLowerCase();
              const base = canonicalize(keyword);
              if (matchedInLine.has(base)) continue;
              // Only include if there's a physical-use signal on the same line
              if (SPEECH_EXCLUDED.has(base)) continue;
              const hasVerb = actionVerbPattern.test(lineText);
              const hasDem = hasDemonstrativeContext(lineText, m.index);
              if (hasVerb || hasDem) {
                matchedInLine.add(base);
                results.push({
                  prop: base,
                  source: "speech",
                  confidence: hasVerb ? "high" : "low",
                  sdText: "",
                  sdId: "",
                  lineText,
                  lineId: line.id,
                  characterName: unit.characterName,
                  sceneId: scene.id,
                  actNum,
                  sceneNum,
                  approxLine,
                });
              }
            }
          }
        } else if (unit.type === "stage") {
          if (cut.cutMap[unit.id] === "cut") continue;
          // Reset regex lastIndex before exec loop
          propPattern.lastIndex = 0;
          const matched = new Set<string>();
          let m: RegExpExecArray | null;
          while ((m = propPattern.exec(unit.text)) !== null) {
            // Normalise to singular base form for grouping
            const keyword = m[1].toLowerCase();
            const base = canonicalize(keyword);
            // Use first matching keyword in the list for canonical form (singular)
            if (!matched.has(base)) {
              matched.add(base);
              results.push({
                prop: base,
                source: "sd",
                sdText: unit.text,
                sdId: unit.id,
                sceneId: scene.id,
                actNum,
                sceneNum,
                approxLine,
              });
            }
          }
        }
      }
    }
  }

  return results;
}
