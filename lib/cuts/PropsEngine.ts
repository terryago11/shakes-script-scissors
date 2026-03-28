import type { Play } from "@/types/play";
import type { Cut } from "@/types/project";

export interface PropReference {
  /** Matched keyword (lowercase) */
  prop: string;
  /** Full SD text for tooltip display */
  sdText: string;
  sdId: string;
  sceneId: string;
  actNum: number;
  sceneNum: number;
  /** Scene-relative kept-line count at the point of this SD */
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

export function scanProps(play: Play, cut: Cut): PropReference[] {
  const results: PropReference[] = [];

  for (const act of play.acts) {
    const actNum = act.number ?? 0;
    for (const scene of act.scenes) {
      const sceneNum = scene.number ?? 0;
      let approxLine = 0;

      for (const unit of scene.units) {
        if (unit.type === "speech") {
          if (cut.cutMap[unit.id] !== "cut") {
            approxLine += unit.lineCount;
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
            const base = uniqueKeywords.find((k) => k === keyword) ?? keyword;
            // Use first matching keyword in the list for canonical form (singular)
            if (!matched.has(base)) {
              matched.add(base);
              results.push({
                prop: base,
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
