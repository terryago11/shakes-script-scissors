"use client";

import type { Character, StageDirection } from "@/types/play";
import { useProject } from "@/lib/project/ProjectStore";

interface Props {
  stage: StageDirection;
  status: "kept" | "cut";
  onToggle: (() => void) | null;
  castList: Character[];
}

export default function StageDirectionBlock({ stage, status, onToggle, castList }: Props) {
  const { activeCut, dispatch } = useProject();

  const isCut = status === "cut";
  const readonly = onToggle === null;

  // Only show character chips on entrance/exit SDs that are not cut and not readonly
  const showChips =
    !readonly &&
    !isCut &&
    (stage.stageType === "entrance" || stage.stageType === "exit") &&
    stage.characters.length > 0;

  const effectiveChars: string[] = showChips
    ? (activeCut?.stageDirectionEdits?.[stage.id] ?? stage.characters)
    : stage.characters;

  const removedChars: string[] = showChips
    ? stage.characters.filter((c) => !effectiveChars.includes(c))
    : [];

  function charName(id: string): string {
    return castList.find((c) => c.id === id)?.name ?? id.replace(/^#/, "");
  }

  function removeChar(charId: string) {
    dispatch({
      type: "SET_SD_CHARACTERS",
      stageId: stage.id,
      characters: effectiveChars.filter((c) => c !== charId),
    });
  }

  function restoreChar(charId: string) {
    dispatch({
      type: "SET_SD_CHARACTERS",
      stageId: stage.id,
      characters: [...effectiveChars, charId],
    });
  }

  return (
    <div className={`group flex items-start gap-3 py-1.5 px-2 rounded ${isCut ? "opacity-50" : ""}`}>
      <div className="w-1 shrink-0" />
      <div className="flex-1 min-w-0">
        <div className={`text-sm italic text-stone-500 ${isCut ? "line-through text-stone-400" : ""}`}>
          {stage.text}
        </div>
        {showChips && (effectiveChars.length > 0 || removedChars.length > 0) && (
          <div className="flex flex-wrap gap-1 mt-1">
            {/* Active characters — click × to remove */}
            {effectiveChars.map((charId) => (
              <button
                key={charId}
                onClick={() => removeChar(charId)}
                className="text-xs px-1.5 py-0.5 rounded bg-stone-100 text-stone-600 hover:bg-red-50 hover:text-red-600 transition-colors"
                title={`Remove ${charName(charId)} from this ${stage.stageType}`}
              >
                {charName(charId)} ×
              </button>
            ))}
            {/* Removed characters — click to restore */}
            {removedChars.map((charId) => (
              <button
                key={charId}
                onClick={() => restoreChar(charId)}
                className="text-xs px-1.5 py-0.5 rounded bg-stone-50 text-stone-300 hover:text-stone-500 line-through transition-colors"
                title={`Restore ${charName(charId)} to this ${stage.stageType}`}
              >
                {charName(charId)}
              </button>
            ))}
          </div>
        )}
      </div>
      {!readonly && isCut && (
        <button
          onClick={onToggle ?? undefined}
          className="opacity-0 group-hover:opacity-100 self-center text-xs px-2 py-0.5 rounded border border-green-200 bg-green-50 text-green-700 hover:bg-green-100 hover:border-green-300 transition-all shrink-0"
          title="Restore stage direction"
        >
          ↩ restore
        </button>
      )}
    </div>
  );
}
