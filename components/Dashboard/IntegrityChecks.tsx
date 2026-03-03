"use client";

import { useState } from "react";
import type { Play } from "@/types/play";
import type { Cut } from "@/types/project";
import type { StageTimeResult } from "@/lib/cuts/StageTimeEngine";
import { characterIdToName } from "@/lib/folger/TeiParser";

interface NoExitDetail {
  characterId: string;
  charName: string;
  /** Acts/scenes where this character has kept speeches */
  appearances: Array<{ actTitle: string; sceneTitle: string }>;
}

interface Props {
  play: Play;
  activeCut: Cut;
  stageTime: StageTimeResult;
}

export default function IntegrityChecks({ play, activeCut, stageTime }: Props) {
  const [expandedChars, setExpandedChars] = useState<Set<string>>(new Set());

  function toggleChar(charId: string) {
    setExpandedChars((prev) => {
      const next = new Set(prev);
      if (next.has(charId)) next.delete(charId);
      else next.add(charId);
      return next;
    });
  }

  // Build act/scene lookup
  const actByScene = new Map<string, string>();
  const sceneTitleById = new Map<string, string>();
  for (const act of play.acts) {
    for (const scene of act.scenes) {
      actByScene.set(scene.id, act.title);
      sceneTitleById.set(scene.id, scene.title);
    }
  }

  // No-exit warnings with location detail
  const noExitWarnings: NoExitDetail[] = stageTime.warnings
    .filter((w) => w.type === "no-exit")
    .map((w) => {
      const charName =
        play.castList.find((c) => c.id === w.characterId)?.name ??
        characterIdToName(w.characterId);

      // Find scenes where this character has kept speeches
      const seenScenes = new Set<string>();
      const appearances: Array<{ actTitle: string; sceneTitle: string }> = [];
      for (const act of play.acts) {
        for (const scene of act.scenes) {
          if (seenScenes.has(scene.id)) continue;
          const hasKeptSpeech = scene.units.some(
            (u) =>
              u.type === "speech" &&
              u.characterId === w.characterId &&
              (activeCut.cutMap[u.id] ?? "kept") === "kept"
          );
          if (hasKeptSpeech) {
            seenScenes.add(scene.id);
            appearances.push({ actTitle: act.title, sceneTitle: scene.title });
          }
        }
      }

      return { characterId: w.characterId, charName, appearances };
    });

  if (noExitWarnings.length === 0) {
    return (
      <div className="max-w-xl">
        <div className="flex items-center gap-2 py-6 text-sm text-stone-400">
          <span className="text-green-500">✓</span>
          No integrity issues found with the current cut.
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-xl space-y-6">
      {/* No-exit section */}
      <div>
        <h2 className="text-sm font-semibold text-stone-500 uppercase tracking-wider mb-1">
          Missing Exit Stage Directions
        </h2>
        <p className="text-xs text-stone-400 mb-3">
          These characters have kept speeches but no exit SD anywhere in the play.
          Their stage time accumulates indefinitely — check the DraCor source data or add an exit SD.
        </p>
        <div className="space-y-2">
          {noExitWarnings.map(({ characterId, charName, appearances }) => {
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
                    <div className="text-amber-500 mt-1.5 pt-1.5 border-t border-amber-200 leading-snug">
                      No exit SD found anywhere in the play. Stage time calculation
                      will be inaccurate — the character never leaves the stage.
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
