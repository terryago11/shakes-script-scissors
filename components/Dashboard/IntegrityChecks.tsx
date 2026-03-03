"use client";

import { useState } from "react";
import type { Play } from "@/types/play";
import type { Cut } from "@/types/project";
import type { StageTimeResult } from "@/lib/cuts/StageTimeEngine";
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
): CharDetail[] {
  const existingType = missingType === "exit" ? "entrance" : "exit";
  return characterIds.map((charId) => {
    const charName =
      play.castList.find((c) => c.id === charId)?.name ||
      characterIdToName(charId) ||
      charId; // final fallback: show raw ID when name can't be resolved

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
      <h2 className="text-sm font-semibold text-stone-500 uppercase tracking-wider mb-1">
        {title}
      </h2>
      <p className="text-xs text-stone-400 mb-3">{description}</p>
      <div className="space-y-2">
        {chars.map(({ characterId, charName, appearances, existingSds, existingSdLabel }) => {
          const isExpanded = expandedChars.has(characterId);
          return (
            <div
              key={characterId}
              className="rounded border border-amber-200 bg-amber-50 text-xs overflow-hidden"
            >
              <button
                onClick={() => toggleChar(characterId)}
                className="w-full flex items-center gap-2 px-3 py-2 text-left text-amber-800 font-medium hover:bg-amber-100 transition-colors"
              >
                <span className="text-amber-500 shrink-0">⚠</span>
                <span className="flex-1 min-w-0 truncate">{charName}</span>
                <span className="text-amber-400 shrink-0 font-normal">
                  {appearances.length}sc
                </span>
                <span className="text-amber-400 shrink-0 ml-1">{isExpanded ? "▲" : "▼"}</span>
              </button>
              {isExpanded && (
                <div className="border-t border-amber-200 px-3 py-2 space-y-2">
                  {/* Scenes where character speaks */}
                  <div>
                    <div className="text-amber-500 font-medium mb-1">Speaks in</div>
                    <div className="space-y-0.5">
                      {appearances.map(({ actTitle, sceneTitle }, i) => (
                        <div key={i} className="flex gap-1.5 text-amber-700">
                          <span className="text-amber-400 shrink-0">{actTitle}</span>
                          <span className="text-amber-300">›</span>
                          <span>{sceneTitle}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  {/* Existing complementary SDs */}
                  {existingSds.length > 0 ? (
                    <div>
                      <div className="text-amber-500 font-medium mb-1 capitalize">
                        Known {existingSdLabel}s
                      </div>
                      <div className="space-y-0.5">
                        {existingSds.map(({ actTitle, sceneTitle, approxLine }, i) => (
                          <div key={i} className="flex gap-1.5 text-amber-700">
                            <span className="text-amber-400 shrink-0">{actTitle}</span>
                            <span className="text-amber-300">›</span>
                            <span className="flex-1">{sceneTitle}</span>
                            {approxLine > 0 && (
                              <span className="text-amber-400 shrink-0 tabular-nums">~l.{approxLine}</span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="text-amber-500 italic">
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

interface Props {
  play: Play;
  activeCut: Cut;
  stageTime: StageTimeResult;
}

export default function IntegrityChecks({ play, activeCut, stageTime }: Props) {
  const noExitIds = stageTime.warnings
    .filter((w) => w.type === "no-exit")
    .map((w) => w.characterId);
  const noEntranceIds = stageTime.warnings
    .filter((w) => w.type === "no-entrance")
    .map((w) => w.characterId);

  if (noExitIds.length === 0 && noEntranceIds.length === 0) {
    return (
      <div>
        <div className="flex items-center gap-2 py-6 text-sm text-stone-400">
          <span className="text-green-500">✓</span>
          No integrity issues found with the current cut.
        </div>
      </div>
    );
  }

  const noExitChars = buildCharDetails(play, activeCut, noExitIds, "exit");
  const noEntranceChars = buildCharDetails(play, activeCut, noEntranceIds, "entrance");

  return (
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
  );
}
