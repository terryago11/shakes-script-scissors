"use client";

import { useState } from "react";
import type { Play } from "@/types/play";
import type { Cut } from "@/types/project";
import type { StageTimeResult } from "@/lib/cuts/StageTimeEngine";
import { characterIdToName } from "@/lib/folger/TeiParser";

interface CharDetail {
  characterId: string;
  charName: string;
  /** Acts/scenes where this character has kept speeches */
  appearances: Array<{ actTitle: string; sceneTitle: string }>;
}

function buildCharDetails(
  play: Play,
  activeCut: Cut,
  characterIds: string[],
): CharDetail[] {
  return characterIds.map((charId) => {
    const charName =
      play.castList.find((c) => c.id === charId)?.name ??
      characterIdToName(charId);

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

    return { characterId: charId, charName, appearances };
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

  return (
    <div>
      <h2 className="text-sm font-semibold text-stone-500 uppercase tracking-wider mb-1">
        {title}
      </h2>
      <p className="text-xs text-stone-400 mb-3">{description}</p>
      <div className="space-y-2">
        {chars.map(({ characterId, charName, appearances }) => {
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
                <span className="flex-1">{charName}</span>
                <span className="text-amber-400 shrink-0 font-normal">
                  {appearances.length} scene{appearances.length !== 1 ? "s" : ""}
                </span>
                <span className="text-amber-400 shrink-0 ml-1">{isExpanded ? "▲" : "▼"}</span>
              </button>
              {isExpanded && (
                <div className="border-t border-amber-200 px-3 py-2 space-y-1">
                  {appearances.map(({ actTitle, sceneTitle }, i) => (
                    <div key={i} className="flex gap-2 text-amber-700">
                      <span className="text-amber-400 shrink-0">{actTitle}</span>
                      <span className="text-amber-300">›</span>
                      <span>{sceneTitle}</span>
                    </div>
                  ))}
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
      <div className="max-w-xl">
        <div className="flex items-center gap-2 py-6 text-sm text-stone-400">
          <span className="text-green-500">✓</span>
          No integrity issues found with the current cut.
        </div>
      </div>
    );
  }

  const noExitChars = buildCharDetails(play, activeCut, noExitIds);
  const noEntranceChars = buildCharDetails(play, activeCut, noEntranceIds);

  return (
    <div className="max-w-xl space-y-8">
      {noExitChars.length > 0 && (
        <WarningSection
          title="Missing Exit Stage Directions"
          description="These characters have kept speeches but no paired exit SD. Their stage time accumulates until end of scene — add a corresponding SD as needed."
          chars={noExitChars}
        />
      )}
      {noEntranceChars.length > 0 && (
        <WarningSection
          title="Missing Entrance Stage Directions"
          description="These characters have kept speeches but no paired entrance SD. Their stage time accumulates from start of scene — add a corresponding SD as needed."
          chars={noEntranceChars}
        />
      )}
    </div>
  );
}
