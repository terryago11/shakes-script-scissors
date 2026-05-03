"use client";

import { useState } from "react";
import type { Play } from "@/types/play";
import type { Cut } from "@/types/project";
import type { StageTimeResult } from "@/lib/cuts/StageTimeEngine";
import { resolveCharacterName } from "@/lib/project/projectUtils";
import { characterIdToName } from "@/lib/folger/TeiParser";
import { scanProps } from "@/lib/cuts/PropsEngine";
import type { PropReference } from "@/lib/cuts/PropsEngine";

interface SdLocation {
  actTitle: string;
  sceneTitle: string;
  approxLine: number;
}

interface CharDetail {
  characterId: string;
  charName: string;
  /** Acts/scenes where this character has kept speeches */
  appearances: Array<{ actTitle: string; sceneTitle: string }>;
  /** Locations of the complementary SD type that already exists */
  existingSds: SdLocation[];
  existingSdLabel: string; // "entrance" or "exit"
}

interface SimpleCharDetail {
  characterId: string;
  charName: string;
  lineCount?: number;
}

/** Walk the play to find all SDs of the given type that list charId, with their
 *  approximate scene-relative line position (kept lines before the SD in that scene). */
function findSdsForChar(
  play: Play,
  activeCut: Cut,
  charId: string,
  sdType: "entrance" | "exit",
): SdLocation[] {
  const results: SdLocation[] = [];
  for (const act of play.acts) {
    for (const scene of act.scenes) {
      let keptLines = 0;
      for (const unit of scene.units) {
        if (unit.type === "stage" && unit.stageType === sdType) {
          const chars = activeCut.stageDirectionEdits?.[unit.id] ?? unit.characters;
          if (chars.includes(charId)) {
            results.push({ actTitle: act.title, sceneTitle: scene.title, approxLine: keptLines });
          }
        } else if (unit.type === "speech" && (activeCut.cutMap[unit.id] ?? "kept") === "kept") {
          keptLines += unit.lineCount;
        }
      }
    }
  }
  return results;
}

function buildCharDetails(
  play: Play,
  activeCut: Cut,
  characterIds: string[],
  /** The SD type that IS missing (so we look for the opposite one as "existing") */
  missingType: "exit" | "entrance",
  characterAliases?: Record<string, string>,
): CharDetail[] {
  const existingType = missingType === "exit" ? "entrance" : "exit";
  return characterIds.map((charId) => {
    const charName = resolveCharacterName(charId, characterAliases, play.castList);

    const appearances: Array<{ actTitle: string; sceneTitle: string }> = [];
    const seenScenes = new Set<string>();
    for (const act of play.acts) {
      for (const scene of act.scenes) {
        if (seenScenes.has(scene.id)) continue;
        const hasKeptSpeech = scene.units.some(
          (u) =>
            u.type === "speech" &&
            u.characterId === charId &&
            (activeCut.cutMap[u.id] ?? "kept") === "kept"
        );
        if (hasKeptSpeech) {
          seenScenes.add(scene.id);
          appearances.push({ actTitle: act.title, sceneTitle: scene.title });
        }
      }
    }

    const existingSds = findSdsForChar(play, activeCut, charId, existingType);

    return { characterId: charId, charName, appearances, existingSds, existingSdLabel: existingType };
  });
}

function WarningSection({
  title,
  description,
  chars,
}: {
  title: string;
  description: string;
  chars: CharDetail[];
}) {
  const [expandedChars, setExpandedChars] = useState<Set<string>>(new Set());

  function toggleChar(charId: string) {
    setExpandedChars((prev) => {
      const next = new Set(prev);
      if (next.has(charId)) next.delete(charId);
      else next.add(charId);
      return next;
    });
  }

  if (chars.length === 0) return null;

  return (
    <div className="min-w-0">
      <h2 className="text-sm font-semibold text-stone-500 dark:text-stone-400 uppercase tracking-wider mb-1">
        {title}
      </h2>
      <p className="text-xs text-stone-400 dark:text-stone-400 mb-3">{description}</p>
      <div className="space-y-2">
        {chars.map(({ characterId, charName, appearances, existingSds, existingSdLabel }) => {
          const isExpanded = expandedChars.has(characterId);
          return (
            <div
              key={characterId}
              className="rounded border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/50 text-xs overflow-hidden"
            >
              <button
                onClick={() => toggleChar(characterId)}
                className="w-full flex items-center gap-2 px-3 py-2 text-left text-amber-800 dark:text-amber-200 font-medium hover:bg-amber-100 dark:hover:bg-amber-900/50 transition-colors"
              >
                <span className="text-amber-500 shrink-0">⚠</span>
                <span className="flex-1 min-w-0 truncate">{charName}</span>
                <span className="text-amber-400 dark:text-amber-500 shrink-0 font-normal">
                  {appearances.length}sc
                </span>
                <span className="text-amber-400 dark:text-amber-500 shrink-0 ml-1">{isExpanded ? "▲" : "▼"}</span>
              </button>
              {isExpanded && (
                <div className="border-t border-amber-200 dark:border-amber-800 px-3 py-2 space-y-2">
                  {/* Scenes where character speaks */}
                  <div>
                    <div className="text-amber-500 dark:text-amber-400 font-medium mb-1">Speaks in</div>
                    <div className="space-y-0.5">
                      {appearances.map(({ actTitle, sceneTitle }, i) => (
                        <div key={i} className="flex gap-1.5 text-amber-700 dark:text-amber-300">
                          <span className="text-amber-400 dark:text-amber-500 shrink-0">{actTitle}</span>
                          <span className="text-amber-300 dark:text-amber-600">›</span>
                          <span>{sceneTitle}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  {/* Existing complementary SDs */}
                  {existingSds.length > 0 ? (
                    <div>
                      <div className="text-amber-500 dark:text-amber-400 font-medium mb-1 capitalize">
                        Known {existingSdLabel}s
                      </div>
                      <div className="space-y-0.5">
                        {existingSds.map(({ actTitle, sceneTitle, approxLine }, i) => (
                          <div key={i} className="flex gap-1.5 text-amber-700 dark:text-amber-300">
                            <span className="text-amber-400 dark:text-amber-500 shrink-0">{actTitle}</span>
                            <span className="text-amber-300 dark:text-amber-600">›</span>
                            <span className="flex-1">{sceneTitle}</span>
                            {approxLine > 0 && (
                              <span className="text-amber-400 dark:text-amber-500 shrink-0 tabular-nums">~l.{approxLine}</span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="text-amber-500 dark:text-amber-400 italic">
                      No {existingSdLabel} SD found either — both are missing.
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Pronouns and collective words used in SDs to refer to characters
const SD_PRONOUNS = new Set([
  "he", "she", "his", "her", "him", "they", "them", "their", "it", "its",
  "all", "both", "others", "some",
]);
// Words to ignore when building name stems
const SD_STOP_WORDS = new Set([
  "the", "and", "for", "of", "in", "a", "an", "to", "from", "with", "by",
  "at", "as", "on", "but", "not", "or", "so", "if", "up", "out", "are",
  "is", "was", "were", "be", "do", "does", "did", "into", "no",
  "two", "three", "four", "five", "six", "this", "that", "then",
  "after", "before", "enter", "exit", "exeunt", "aside",
]);

interface SdEntry {
  text: string;
  actTitle: string;
  sceneTitle: string;
  approxLine: number;
}

interface SdRef {
  token: string;
  locations: SdEntry[];
}

/** Extract name tokens and pronouns from SDs that list this character in who= */
function extractSdRefs(
  charId: string,
  castName: string | null,
  idNorm: string,
  speakerTagSet: Set<string> | undefined,
  sdEntries: SdEntry[],
): SdRef[] {
  const nameStems = new Set<string>();

  const addWords = (name: string, filterPossessives = false) => {
    // Detect possessor words ("Gravedigger" in "Gravedigger's companion") so we
    // don't end up matching the other character's name in SD texts.
    const excluded = new Set<string>();
    if (filterPossessives) {
      // (?!\w) handles both "Gravedigger's" and "Laertes'" (trailing apostrophe, no s)
      const possRe = /(\w+)['\u2019]s?(?!\w)/gi;
      let m;
      while ((m = possRe.exec(name)) !== null) excluded.add(m[1].toLowerCase());
    }
    name
      .toLowerCase()
      .split(/[\s\u2019''',.\-()]+/)
      .forEach((w) => {
        const clean = w.replace(/[^a-z]/g, "");
        if (
          clean.length > 1 &&
          !SD_STOP_WORDS.has(clean) &&
          !SD_PRONOUNS.has(clean) &&
          !excluded.has(clean)
        ) {
          nameStems.add(clean);
        }
      });
  };

  // ID first segment: "#ATTENDANTS.2_Ham" → "ATTENDANTS"; "#PlayerKing_Ham" → "PlayerKing"
  const idStem = charId.replace(/^#/, "").split(/[._]/)[0];
  // Qualified IDs like SOLDIERS.FORTINBRAS use another character's name as a qualifier.
  // Skip idNorm ("Fortinbras' Soldier") for those; rely on the first segment only.
  const hasQualifier = charId.replace(/^#/, "").split("_")[0].includes(".");

  if (castName) {
    // castName is authoritative; filter possessives to avoid matching other chars
    addWords(castName, true);
  } else if (!hasQualifier) {
    // No cast entry, simple ID → idNorm gives useful camelCase splits ("Player King")
    addWords(idNorm);
  }
  addWords(idStem);
  if (speakerTagSet) for (const tag of speakerTagSet) addWords(tag);

  // Walk SD entries collecting per-token location lists
  const nameTokenMap = new Map<string, { display: string; locs: SdEntry[] }>();
  const pronounTokenMap = new Map<string, SdEntry[]>();

  for (const entry of sdEntries) {
    const seenName = new Set<string>();
    const seenPronoun = new Set<string>();
    for (const word of entry.text.split(/\W+/).filter(Boolean)) {
      const lower = word.toLowerCase();
      const display = word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
      if (nameStems.has(lower)) {
        if (!nameTokenMap.has(lower)) nameTokenMap.set(lower, { display, locs: [] });
        if (!seenName.has(lower)) { nameTokenMap.get(lower)!.locs.push(entry); seenName.add(lower); }
      } else if (SD_PRONOUNS.has(lower)) {
        if (!pronounTokenMap.has(display)) pronounTokenMap.set(display, []);
        if (!seenPronoun.has(display)) { pronounTokenMap.get(display)!.push(entry); seenPronoun.add(display); }
      }
    }
  }

  // Fallback for SD-only characters: grab the first meaningful word from any SD.
  // Skip this for cast-listed characters — their SDs may never name them directly
  // (e.g. "Gravedigger's companion" SDs say "Enter the Gravediggers"), and grabbing
  // another character's name from the prose would be misleading.
  if (!castName && nameTokenMap.size === 0 && pronounTokenMap.size === 0) {
    outer: for (const entry of sdEntries) {
      for (const word of entry.text.split(/\W+/).filter(Boolean)) {
        const lower = word.toLowerCase();
        if (!SD_STOP_WORDS.has(lower) && lower.length > 1) {
          const display = word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
          nameTokenMap.set(lower, { display, locs: [entry] });
          break outer;
        }
      }
    }
  }

  return [
    ...[...nameTokenMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, v]) => ({ token: v.display, locations: v.locs })),
    ...[...pronounTokenMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([t, locs]) => ({ token: t, locations: locs })),
  ];
}

function NearCutSection({
  title,
  description,
  chars,
  showLineCount,
}: {
  title: string;
  description: string;
  chars: SimpleCharDetail[];
  showLineCount?: boolean;
}) {
  if (chars.length === 0) return null;
  return (
    <div className="min-w-0">
      <h2 className="text-sm font-semibold text-stone-500 dark:text-stone-400 uppercase tracking-wider mb-1">
        {title}
      </h2>
      <p className="text-xs text-stone-400 dark:text-stone-400 mb-3">{description}</p>
      <div className="space-y-1.5">
        {chars.map(({ characterId, charName, lineCount }) => (
          <div
            key={characterId}
            className="flex items-center gap-2 px-3 py-2 rounded border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-900/50 text-xs"
          >
            <span className="text-amber-500 shrink-0">⚠</span>
            <span className="flex-1 min-w-0 truncate text-stone-600 dark:text-stone-300">{charName}</span>
            {showLineCount && lineCount != null && (
              <span className="text-stone-400 dark:text-stone-500 shrink-0 tabular-nums">
                {lineCount} line{lineCount !== 1 ? "s" : ""}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function EntranceExitSection({
  noExitChars,
  noEntranceChars,
  presenceOnlyChars,
  fewLinesChars,
}: {
  noExitChars: CharDetail[];
  noEntranceChars: CharDetail[];
  presenceOnlyChars: SimpleCharDetail[];
  fewLinesChars: SimpleCharDetail[];
}) {
  const [open, setOpen] = useState(false);
  const issueCount = noExitChars.length + noEntranceChars.length + presenceOnlyChars.length + fewLinesChars.length;
  const hasIssues = issueCount > 0;

  return (
    <div>
      <button
        onClick={() => setOpen((o) => !o)}
        className="text-sm font-semibold text-stone-500 dark:text-stone-400 flex items-center gap-1.5 hover:text-stone-700 dark:hover:text-stone-200 transition-colors"
      >
        <span>{open ? "▼" : "▶"}</span>
        <span>Entrance/Exit Checks</span>
        {hasIssues ? (
          <span className="font-normal text-amber-500 dark:text-amber-400">
            ({issueCount} issue{issueCount !== 1 ? "s" : ""})
          </span>
        ) : (
          <span className="font-normal text-green-500 text-xs ml-1">✓</span>
        )}
      </button>
      {open && (
        <div className="mt-3">
          {hasIssues ? (
            <div className="space-y-6">
              {(noExitChars.length > 0 || noEntranceChars.length > 0) && (
                <div className="grid grid-cols-2 gap-8">
                  <WarningSection
                    title="Missing Exit Stage Directions"
                    description="These characters have kept speeches but no paired exit SD. Their stage time accumulates until end of scene — add a corresponding SD as needed."
                    chars={noExitChars}
                  />
                  <WarningSection
                    title="Missing Entrance Stage Directions"
                    description="These characters have kept speeches but no paired entrance SD. Their stage time accumulates from start of scene — add a corresponding SD as needed."
                    chars={noEntranceChars}
                  />
                </div>
              )}
              {(presenceOnlyChars.length > 0 || fewLinesChars.length > 0) && (
                <div className="grid grid-cols-2 gap-8">
                  <NearCutSection
                    title="Presence-only"
                    description="These characters appear in kept stage directions but have no kept speeches. They appear on stage but never speak."
                    chars={presenceOnlyChars}
                  />
                  <NearCutSection
                    title="Nearly cut"
                    description="These characters have fewer than 10 kept lines. Consider cutting completely."
                    chars={fewLinesChars}
                    showLineCount
                  />
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2 py-2 text-sm text-stone-400 dark:text-stone-400">
              <span className="text-green-500">✓</span>
              No entrance/exit integrity issues found with the current cut.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function getContext(text: string, keyword: string): { prefix: string; match: string; suffix: string } | null {
  const pattern = new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}s?\\b`, "i");
  const m = pattern.exec(text);
  if (!m) return null;
  const prefix = text.slice(0, m.index).trim().split(/\s+/).filter(Boolean).slice(-5).join(" ");
  const suffix = text.slice(m.index + m[0].length).trim().split(/\s+/).filter(Boolean).slice(0, 5).join(" ");
  return { prefix, match: m[0], suffix };
}

function PropContextBadge({
  label,
  text,
  keyword,
  characterName,
  className,
}: {
  label: string;
  text: string;
  keyword: string;
  characterName?: string;
  className: string;
}) {
  const [show, setShow] = useState(false);
  const ctx = getContext(text, keyword);
  return (
    <span
      className="relative"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      <span className={className}>{label}</span>
      {show && ctx && (
        <div className="absolute z-50 bottom-full left-0 mb-1.5 max-w-xs bg-stone-900 dark:bg-stone-950 text-white text-xs rounded px-2.5 py-1.5 shadow-lg pointer-events-none whitespace-normal border border-stone-700">
          {characterName && (
            <div className="text-stone-400 mb-0.5 font-medium text-[10px] uppercase tracking-wide">
              {characterName}
            </div>
          )}
          <span className="text-stone-300">{ctx.prefix ? `…${ctx.prefix} ` : ""}</span>
          <strong className="text-white">{ctx.match}</strong>
          <span className="text-stone-300">{ctx.suffix ? ` ${ctx.suffix}…` : ""}</span>
        </div>
      )}
    </span>
  );
}

function PropsSection({ refs }: { refs: PropReference[] }) {
  // Group by prop keyword
  const byProp = new Map<string, PropReference[]>();
  for (const r of refs) {
    const arr = byProp.get(r.prop) ?? [];
    arr.push(r);
    byProp.set(r.prop, arr);
  }
  const sorted = [...byProp.entries()].sort(([a], [b]) => a.localeCompare(b));

  const sdCount = refs.filter((r) => r.source === "sd").length;
  const highCount = refs.filter((r) => r.confidence === "high").length;
  const lowCount = refs.filter((r) => r.confidence === "low").length;

  return (
    <div>
      {/* Methodology explainer */}
      <div className="mb-5 p-3 rounded-md bg-stone-50 dark:bg-stone-800/60 border border-stone-200 dark:border-stone-700 text-xs text-stone-500 dark:text-stone-400 space-y-1.5">
        <p>
          <span className="font-semibold text-stone-600 dark:text-stone-300">How props are detected</span>
          {" "}· This is an algorithmic suggestion — treat it as a starting point, not an authoritative list.
        </p>
        <p>
          Stage direction references are explicit (the word appears verbatim in an SD).
          Dialogue references are heuristic: a prop keyword was found in speech text alongside a physical-use signal.
          Large set pieces (bed, table, throne, coffin) are excluded from dialogue detection.
        </p>
        {/* Legend */}
        <div className="flex flex-wrap gap-x-4 gap-y-1 pt-0.5">
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-2.5 h-2.5 rounded-sm bg-stone-200 dark:bg-stone-700 border border-stone-300 dark:border-stone-600" />
            stage direction
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-2.5 h-2.5 rounded-sm bg-amber-100 dark:bg-amber-900 border border-amber-300 dark:border-amber-700" />
            dialogue — action verb detected (high confidence)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-2.5 h-2.5 rounded-sm bg-amber-50 dark:bg-amber-950/50 border border-dashed border-amber-300 dark:border-amber-700" />
            dialogue — demonstrative context only (lower confidence)
          </span>
        </div>
      </div>

      {/* Summary line */}
      <div className="mb-4 text-xs text-stone-400 dark:text-stone-500">
        {sorted.length} prop type{sorted.length !== 1 ? "s" : ""}
        {" · "}{sdCount} in stage direction{sdCount !== 1 ? "s" : ""}
        {" · "}{highCount + lowCount} in dialogue
        {highCount + lowCount > 0 && (
          <span className="text-stone-400 dark:text-stone-500">
            {" "}({highCount} high confidence, {lowCount} lower)
          </span>
        )}
      </div>

      {sorted.length === 0 ? (
        <p className="text-xs text-stone-400 dark:text-stone-500 italic">No prop references found in stage directions or dialogue.</p>
      ) : (
        <div className="space-y-3">
          {sorted.map(([prop, propRefs]) => {
            const sdRefs = propRefs.filter((r) => r.source === "sd");
            const highRefs = propRefs.filter((r) => r.confidence === "high");
            const lowRefs = propRefs.filter((r) => r.confidence === "low");
            return (
              <div key={prop} className="text-xs">
                <span className="font-semibold text-stone-600 dark:text-stone-300 capitalize">{prop}</span>
                <span className="text-stone-400 dark:text-stone-500 ml-1.5">— {propRefs.length} ref{propRefs.length !== 1 ? "s" : ""}</span>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {sdRefs.map((r) => (
                    <PropContextBadge
                      key={r.sdId}
                      label={`Act ${r.actNum}.${r.sceneNum} ~l.${r.approxLine}`}
                      text={r.sdText}
                      keyword={prop}
                      className="px-1.5 py-0.5 rounded bg-stone-100 dark:bg-stone-800 text-stone-500 dark:text-stone-400 border border-stone-200 dark:border-stone-700 cursor-default"
                    />
                  ))}
                  {highRefs.map((r) => (
                    <PropContextBadge
                      key={r.lineId}
                      label={`Act ${r.actNum}.${r.sceneNum} ~l.${r.approxLine}`}
                      text={r.lineText ?? ""}
                      keyword={prop}
                      characterName={r.characterName}
                      className="px-1.5 py-0.5 rounded bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800 cursor-default"
                    />
                  ))}
                  {lowRefs.map((r) => (
                    <PropContextBadge
                      key={r.lineId}
                      label={`Act ${r.actNum}.${r.sceneNum} ~l.${r.approxLine}`}
                      text={r.lineText ?? ""}
                      keyword={prop}
                      characterName={r.characterName}
                      className="px-1.5 py-0.5 rounded bg-amber-50/50 dark:bg-amber-950/30 text-amber-500 dark:text-amber-500/70 border border-dashed border-amber-200 dark:border-amber-800/70 cursor-default"
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function PropsTab({ play, activeCut }: { play: Play; activeCut: Cut }) {
  return <PropsSection refs={scanProps(play, activeCut)} />;
}

function NameDiagnosticsTable({
  play,
  characterAliases,
}: {
  play: Play;
  characterAliases?: Record<string, string>;
}) {
  const [open, setOpen] = useState(false);

  // Single walk: collect speaker tags and per-SD entries (with location) per character
  const speakerTagsMap = new Map<string, Set<string>>();
  const sdEntriesMap = new Map<string, SdEntry[]>();
  for (const act of play.acts) {
    for (const scene of act.scenes) {
      let approxLine = 0;
      for (const unit of scene.units) {
        if (unit.type === "speech") {
          if (!speakerTagsMap.has(unit.characterId)) speakerTagsMap.set(unit.characterId, new Set());
          if (unit.speakerTag) speakerTagsMap.get(unit.characterId)!.add(unit.speakerTag);
          approxLine += unit.lineCount;
        } else {
          const entry: SdEntry = {
            text: unit.text.trim(),
            actTitle: act.title,
            sceneTitle: scene.title,
            approxLine,
          };
          for (const cid of unit.characters) {
            if (!sdEntriesMap.has(cid)) sdEntriesMap.set(cid, []);
            sdEntriesMap.get(cid)!.push(entry);
          }
        }
      }
    }
  }

  // Cast list order first, then any SD-only characters alphabetically
  const castIds = play.castList.map((c) => c.id);
  const sdOnly = [...sdEntriesMap.keys()].filter((id) => !castIds.includes(id)).sort();
  const allIds = [...castIds, ...sdOnly];

  const rows = allIds.map((id) => {
    const castName = play.castList.find((c) => c.id === id)?.name ?? null;
    const idNorm = characterIdToName(id);
    const resolved = resolveCharacterName(id, characterAliases, play.castList);
    const sdEntries = sdEntriesMap.get(id);
    return {
      id,
      castName,
      idNorm,
      resolved,
      speakerTags: speakerTagsMap.has(id) ? [...speakerTagsMap.get(id)!].join(", ") : null,
      sdRefs: sdEntries && sdEntries.length > 0
        ? extractSdRefs(id, castName, idNorm, speakerTagsMap.get(id), sdEntries)
        : null,
      hasAlias: resolved !== (castName ?? idNorm),
    };
  });

  return (
    <div className="mt-6 border-t border-stone-200 dark:border-stone-700 pt-4">
      <button
        onClick={() => setOpen((o) => !o)}
        className="text-sm font-semibold text-stone-500 dark:text-stone-400 flex items-center gap-1.5 hover:text-stone-700 dark:hover:text-stone-200 transition-colors"
      >
        <span>{open ? "▼" : "▶"}</span>
        <span>Name Diagnostics</span>
        <span className="font-normal text-stone-400 dark:text-stone-400">({rows.length} characters)</span>
      </button>
      {open && (
        <div className="mt-3 overflow-x-auto">
          <p className="mb-2 text-xs text-stone-400 dark:text-stone-400">
            Rows highlighted <span className="bg-sky-100 dark:bg-sky-950/50 px-1 rounded text-sky-700 dark:text-sky-300">blue</span> have an active alias for this cut.
          </p>
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="text-left text-stone-400 dark:text-stone-400 border-b border-stone-200 dark:border-stone-700">
                <th className="pb-1 pr-4 font-medium">Character ID</th>
                <th className="pb-1 pr-4 font-medium">Folger Cast List</th>
                <th className="pb-1 pr-4 font-medium">Folger Speaker Name</th>
                <th className="pb-1 pr-4 font-medium">ID-Normalized</th>
                <th className="pb-1 pr-4 font-medium">SD References</th>
                <th className="pb-1 font-medium">Resolved</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr
                  key={r.id}
                  className={r.hasAlias ? "bg-sky-50 dark:bg-sky-950/30" : i % 2 === 1 ? "bg-stone-50 dark:bg-stone-900/50" : ""}
                >
                  <td className="py-0.5 pr-4 font-mono text-stone-400 dark:text-stone-400">{r.id}</td>
                  <td className="py-0.5 pr-4">{r.castName ?? <span className="text-stone-300 dark:text-stone-600">—</span>}</td>
                  <td className="py-0.5 pr-4 text-stone-400 dark:text-stone-400">
                    {r.speakerTags ?? <span className="text-stone-300">—</span>}
                  </td>
                  <td className="py-0.5 pr-4 text-stone-400 dark:text-stone-400">
                    {r.castName ? <span className="text-stone-300 dark:text-stone-600">—</span> : r.idNorm}
                  </td>
                  <td className="py-0.5 pr-4 text-stone-400 dark:text-stone-400">
                    {r.sdRefs && r.sdRefs.length > 0 ? (
                      <span>
                        {r.sdRefs.map(({ token, locations }, idx) => (
                          <span key={token} className="relative group/tok inline-block">
                            {idx > 0 && <span className="mr-0.5">, </span>}
                            <span className="underline decoration-dotted cursor-help">{token}</span>
                            <span className="absolute bottom-full left-0 mb-1 hidden group-hover/tok:flex flex-col bg-stone-800 text-white text-[10px] leading-snug rounded px-2 py-1.5 whitespace-nowrap z-50 shadow-lg pointer-events-none min-w-max">
                              {locations.map((l, i) => (
                                <span key={i}>
                                  {l.actTitle}, {l.sceneTitle}{l.approxLine > 0 ? ` ~l.${l.approxLine}` : ""}
                                </span>
                              ))}
                            </span>
                          </span>
                        ))}
                      </span>
                    ) : (
                      <span className="text-stone-300 dark:text-stone-600">—</span>
                    )}
                  </td>
                  <td className="py-0.5 font-medium dark:text-stone-200">{r.resolved}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

interface FullyRemovedChar {
  charId: string;
  charName: string;
  remnantSds: Array<{ text: string; actTitle: string; sceneTitle: string }>;
}

interface MarkedChar {
  charId: string;
  charName: string;
  speechesRemaining: number;
  sdsRemaining: number;
  isFullyCut: boolean;
  remnantSds: Array<{ text: string; actTitle: string; sceneTitle: string }>;
}

function RemovedFlaggedSection({
  fullyRemovedChars,
  markedForRemoval,
  play,
  activeCut,
  characterAliases,
  onToggleMarked,
}: {
  fullyRemovedChars: FullyRemovedChar[];
  markedForRemoval: string[];
  play: Play;
  activeCut: Cut;
  characterAliases?: Record<string, string>;
  onToggleMarked?: (charId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [expandedChars, setExpandedChars] = useState<Set<string>>(new Set());

  function toggleChar(charId: string) {
    setExpandedChars((prev) => {
      const next = new Set(prev);
      if (next.has(charId)) next.delete(charId); else next.add(charId);
      return next;
    });
  }

  const markedSet = new Set(markedForRemoval);
  const fullyCutSet = new Set(fullyRemovedChars.map((c) => c.charId));

  // Build marked-but-not-fully-cut entries
  const markedChars: MarkedChar[] = markedForRemoval.map((charId) => {
    const charName = resolveCharacterName(charId, characterAliases, play.castList);
    let speechesRemaining = 0;
    let sdsRemaining = 0;
    const remnantSds: MarkedChar["remnantSds"] = [];
    for (const act of play.acts) {
      for (const scene of act.scenes) {
        for (const unit of scene.units) {
          if (unit.type === "speech" && unit.characterId === charId) {
            if ((activeCut.cutMap[unit.id] ?? "kept") === "kept") speechesRemaining++;
          } else if (unit.type === "stage") {
            const chars = activeCut.stageDirectionEdits?.[unit.id] ?? unit.characters;
            if (chars.includes(charId)) {
              if ((unit.stageType === "entrance" || unit.stageType === "exit") &&
                  (activeCut.cutMap[unit.id] ?? "kept") !== "cut") sdsRemaining++;
              if (activeCut.cutMap[unit.id] !== "cut") {
                remnantSds.push({ text: unit.text.trim(), actTitle: act.title, sceneTitle: scene.title });
              }
            }
          }
        }
      }
    }
    return { charId, charName, speechesRemaining, sdsRemaining, isFullyCut: fullyCutSet.has(charId), remnantSds };
  });

  // Combine: marked chars first, then auto-detected fully cut (not already in marked list)
  const autoDetectedChars = fullyRemovedChars.filter((c) => !markedSet.has(c.charId));
  const totalCount = markedChars.length + autoDetectedChars.length;
  const hasRemnants = [...markedChars, ...autoDetectedChars.map(c => ({ ...c, remnantSds: c.remnantSds }))].some((c) => c.remnantSds.length > 0);

  return (
    <div className="mt-6 border-t border-stone-200 dark:border-stone-700 pt-4">
      <button
        onClick={() => setOpen((o) => !o)}
        className="text-sm font-semibold text-stone-500 dark:text-stone-400 flex items-center gap-1.5 hover:text-stone-700 dark:hover:text-stone-200 transition-colors"
      >
        <span>{open ? "▼" : "▶"}</span>
        <span>Removed / Flagged Characters</span>
        {totalCount === 0 ? (
          <span className="font-normal text-green-500 text-xs ml-1">✓</span>
        ) : hasRemnants ? (
          <span className="font-normal text-amber-500 dark:text-amber-400">
            ({totalCount} character{totalCount !== 1 ? "s" : ""}, some with SD remnants)
          </span>
        ) : (
          <span className="font-normal text-stone-400 dark:text-stone-400">
            ({totalCount} character{totalCount !== 1 ? "s" : ""})
          </span>
        )}
      </button>
      {open && (
        <div className="mt-3">
          {totalCount === 0 ? (
            <div className="flex items-center gap-2 py-1 text-sm text-stone-400 dark:text-stone-400">
              <span className="text-green-500">✓</span>
              No removed or flagged characters in the current cut.
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-stone-400 dark:text-stone-400 mb-3">
                Characters marked for removal or fully cut. Check for remaining SD mentions that may need attention.
              </p>

              {/* Marked characters */}
              {markedChars.map(({ charId, charName, speechesRemaining, sdsRemaining, isFullyCut, remnantSds }) => {
                const isExpanded = expandedChars.has(charId);
                const fullyDone = speechesRemaining === 0 && sdsRemaining === 0;
                const statusPill = isFullyCut || fullyDone
                  ? "⚑ Marked · ✓ Fully cut"
                  : "⚑ Marked";
                const hasRemnantSds = remnantSds.length > 0;
                return (
                  <div
                    key={charId}
                    className="rounded border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/50 text-xs overflow-hidden"
                  >
                    <div className="flex items-center gap-2 px-3 py-2 text-amber-800 dark:text-amber-200 font-medium">
                      <span className="text-amber-500 shrink-0">⚑</span>
                      <span className="flex-1 min-w-0 truncate">{charName}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-normal shrink-0 ${
                        isFullyCut || fullyDone
                          ? "bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400"
                          : "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400"
                      }`}>
                        {statusPill}
                      </span>
                      {onToggleMarked && (
                        <button
                          onClick={() => onToggleMarked(charId)}
                          className="text-stone-400 hover:text-stone-600 dark:hover:text-stone-300 text-[10px] shrink-0 ml-1"
                          title="Unmark for removal"
                        >
                          × Unmark
                        </button>
                      )}
                      {hasRemnantSds && (
                        <button
                          onClick={() => toggleChar(charId)}
                          className="text-amber-400 dark:text-amber-500 shrink-0 ml-1"
                        >
                          {isExpanded ? "▲" : "▼"}
                        </button>
                      )}
                    </div>
                    {!(isFullyCut || fullyDone) && (
                      <div className="border-t border-amber-200 dark:border-amber-800 px-3 py-2 space-y-1">
                        <div className={`flex items-center gap-1.5 ${speechesRemaining === 0 ? "text-green-600 dark:text-green-400" : "text-amber-600 dark:text-amber-400"}`}>
                          <span>{speechesRemaining === 0 ? "✓" : "○"}</span>
                          <span>{speechesRemaining} speech{speechesRemaining !== 1 ? "es" : ""} remaining</span>
                        </div>
                        <div className={`flex items-center gap-1.5 ${sdsRemaining === 0 ? "text-green-600 dark:text-green-400" : "text-amber-600 dark:text-amber-400"}`}>
                          <span>{sdsRemaining === 0 ? "✓" : "○"}</span>
                          <span>{sdsRemaining} entrance/exit SD{sdsRemaining !== 1 ? "s" : ""} remaining</span>
                        </div>
                      </div>
                    )}
                    {isExpanded && hasRemnantSds && (
                      <div className="border-t border-amber-200 dark:border-amber-800 px-3 py-2 space-y-1.5">
                        <div className="text-amber-500 dark:text-amber-400 font-medium mb-1">
                          Still mentioned in stage directions
                        </div>
                        {remnantSds.map(({ text, actTitle, sceneTitle }, i) => (
                          <div key={i} className="space-y-0.5">
                            <div className="flex gap-1.5 text-amber-700 dark:text-amber-300">
                              <span className="text-amber-400 dark:text-amber-500 shrink-0">{actTitle}</span>
                              <span className="text-amber-300 dark:text-amber-600">›</span>
                              <span>{sceneTitle}</span>
                            </div>
                            <div className="text-amber-600 dark:text-amber-400 italic pl-2 truncate" title={text}>
                              &ldquo;{text}&rdquo;
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Auto-detected fully cut (not marked) */}
              {autoDetectedChars.map(({ charId, charName, remnantSds }) => {
                const hasRemnantSds = remnantSds.length > 0;
                const isExpanded = expandedChars.has(charId);
                if (!hasRemnantSds) {
                  return (
                    <div key={charId} className="flex items-center gap-2 px-3 py-2 rounded border border-stone-100 dark:border-stone-800 bg-stone-50 dark:bg-stone-900/50 text-xs">
                      <span className="text-green-500 shrink-0">✓</span>
                      <span className="text-stone-600 dark:text-stone-300">{charName}</span>
                      <span className="text-stone-400 dark:text-stone-500 ml-1">Auto-detected · Cleanly removed</span>
                    </div>
                  );
                }
                return (
                  <div
                    key={charId}
                    className="rounded border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/50 text-xs overflow-hidden"
                  >
                    <button
                      onClick={() => toggleChar(charId)}
                      className="w-full flex items-center gap-2 px-3 py-2 text-left text-amber-800 dark:text-amber-200 font-medium hover:bg-amber-100 dark:hover:bg-amber-900/50 transition-colors"
                    >
                      <span className="text-amber-500 shrink-0">⚠</span>
                      <span className="flex-1 min-w-0 truncate">{charName}</span>
                      <span className="text-stone-400 dark:text-stone-500 font-normal text-[10px]">Auto-detected</span>
                      <span className="text-amber-400 dark:text-amber-500 shrink-0 font-normal">
                        {remnantSds.length} SD{remnantSds.length !== 1 ? "s" : ""}
                      </span>
                      <span className="text-amber-400 dark:text-amber-500 shrink-0 ml-1">{isExpanded ? "▲" : "▼"}</span>
                    </button>
                    {isExpanded && (
                      <div className="border-t border-amber-200 dark:border-amber-800 px-3 py-2 space-y-1.5">
                        <div className="text-amber-500 dark:text-amber-400 font-medium mb-1">
                          Still mentioned in stage directions
                        </div>
                        {remnantSds.map(({ text, actTitle, sceneTitle }, i) => (
                          <div key={i} className="space-y-0.5">
                            <div className="flex gap-1.5 text-amber-700 dark:text-amber-300">
                              <span className="text-amber-400 dark:text-amber-500 shrink-0">{actTitle}</span>
                              <span className="text-amber-300 dark:text-amber-600">›</span>
                              <span>{sceneTitle}</span>
                            </div>
                            <div className="text-amber-600 dark:text-amber-400 italic pl-2 truncate" title={text}>
                              &ldquo;{text}&rdquo;
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface Props {
  play: Play;
  activeCut: Cut;
  stageTime: StageTimeResult;
  characterAliases?: Record<string, string>;
  onToggleMarkedForRemoval?: (characterId: string) => void;
}

export default function IntegrityChecks({ play, activeCut, stageTime, characterAliases, onToggleMarkedForRemoval }: Props) {
  const noExitIds = stageTime.warnings
    .filter((w) => w.type === "no-exit")
    .map((w) => w.characterId);
  const noEntranceIds = stageTime.warnings
    .filter((w) => w.type === "no-entrance")
    .map((w) => w.characterId);

  const noExitChars = buildCharDetails(play, activeCut, noExitIds, "exit", characterAliases);
  const noEntranceChars = buildCharDetails(play, activeCut, noEntranceIds, "entrance", characterAliases);

  const presenceOnlyChars: SimpleCharDetail[] = stageTime.warnings
    .filter((w) => w.type === "entrance-only")
    .map((w) => ({
      characterId: w.characterId,
      charName: resolveCharacterName(w.characterId, characterAliases, play.castList),
    }));

  const fewLinesChars: SimpleCharDetail[] = stageTime.warnings
    .filter((w) => w.type === "few-lines")
    .map((w) => ({
      characterId: w.characterId,
      charName: resolveCharacterName(w.characterId, characterAliases, play.castList),
      lineCount: w.lineCount,
    }));

  // Compute fully-removed characters and any SD remnants
  const fullyRemovedChars: FullyRemovedChar[] = [];
  {
    const speechesByChar = new Map<string, string[]>();
    const entranceExitSdsByChar = new Map<string, string[]>();
    const speakingCharIds = new Set<string>();

    for (const act of play.acts) {
      for (const scene of act.scenes) {
        for (const unit of scene.units) {
          if (unit.type === "speech") {
            speakingCharIds.add(unit.characterId);
            const arr = speechesByChar.get(unit.characterId) ?? [];
            arr.push(unit.id);
            speechesByChar.set(unit.characterId, arr);
          } else if (unit.type === "stage" && (unit.stageType === "entrance" || unit.stageType === "exit")) {
            const chars = activeCut.stageDirectionEdits?.[unit.id] ?? unit.characters;
            for (const charId of chars) {
              const arr = entranceExitSdsByChar.get(charId) ?? [];
              arr.push(unit.id);
              entranceExitSdsByChar.set(charId, arr);
            }
          }
        }
      }
    }

    for (const charId of speakingCharIds) {
      const speeches = speechesByChar.get(charId) ?? [];
      const entranceExitSds = entranceExitSdsByChar.get(charId) ?? [];
      const allSpeechesCut = speeches.length > 0 && speeches.every((id) => activeCut.cutMap[id] === "cut");
      const allEntranceExitSdsCut = entranceExitSds.every((id) => activeCut.cutMap[id] === "cut");
      if (!allSpeechesCut || !allEntranceExitSdsCut) continue;

      const remnantSds: FullyRemovedChar["remnantSds"] = [];
      for (const act of play.acts) {
        for (const scene of act.scenes) {
          for (const unit of scene.units) {
            if (unit.type === "stage") {
              const chars = activeCut.stageDirectionEdits?.[unit.id] ?? unit.characters;
              if (chars.includes(charId) && activeCut.cutMap[unit.id] !== "cut") {
                remnantSds.push({ text: unit.text.trim(), actTitle: act.title, sceneTitle: scene.title });
              }
            }
          }
        }
      }

      const charName = resolveCharacterName(charId, characterAliases, play.castList);
      fullyRemovedChars.push({ charId, charName, remnantSds });
    }

    fullyRemovedChars.sort((a, b) => a.charName.localeCompare(b.charName));
  }

  return (
    <div>
      <EntranceExitSection
        noExitChars={noExitChars}
        noEntranceChars={noEntranceChars}
        presenceOnlyChars={presenceOnlyChars}
        fewLinesChars={fewLinesChars}
      />
      <RemovedFlaggedSection
        fullyRemovedChars={fullyRemovedChars}
        markedForRemoval={activeCut.markedForRemoval ?? []}
        play={play}
        activeCut={activeCut}
        characterAliases={characterAliases}
        onToggleMarked={onToggleMarkedForRemoval}
      />
      <NameDiagnosticsTable play={play} characterAliases={characterAliases} />
    </div>
  );
}
