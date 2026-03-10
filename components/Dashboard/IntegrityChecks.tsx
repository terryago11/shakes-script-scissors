"use client";

import { useState } from "react";
import type { Play } from "@/types/play";
import type { Cut } from "@/types/project";
import type { StageTimeResult } from "@/lib/cuts/StageTimeEngine";
import { resolveCharacterName } from "@/lib/project/projectUtils";
import { characterIdToName } from "@/lib/folger/TeiParser";

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

interface Props {
  play: Play;
  activeCut: Cut;
  stageTime: StageTimeResult;
  characterAliases?: Record<string, string>;
}

export default function IntegrityChecks({ play, activeCut, stageTime, characterAliases }: Props) {
  const noExitIds = stageTime.warnings
    .filter((w) => w.type === "no-exit")
    .map((w) => w.characterId);
  const noEntranceIds = stageTime.warnings
    .filter((w) => w.type === "no-entrance")
    .map((w) => w.characterId);

  const noExitChars = buildCharDetails(play, activeCut, noExitIds, "exit", characterAliases);
  const noEntranceChars = buildCharDetails(play, activeCut, noEntranceIds, "entrance", characterAliases);

  return (
    <div>
      {noExitIds.length === 0 && noEntranceIds.length === 0 ? (
        <div className="flex items-center gap-2 py-6 text-sm text-stone-400 dark:text-stone-400">
          <span className="text-green-500">✓</span>
          No integrity issues found with the current cut.
        </div>
      ) : (
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
      <NameDiagnosticsTable play={play} characterAliases={characterAliases} />
    </div>
  );
}
