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

  // Show character chips on entrance/exit SDs that are not cut and not readonly
  const showChips =
    !readonly &&
    !isCut &&
    (stage.stageType === "entrance" || stage.stageType === "exit");

  const effectiveChars: string[] = showChips
    ? (activeCut?.stageDirectionEdits?.[stage.id] ?? stage.characters)
    : stage.characters;

  // Characters removed from the original SD (were in original, now removed)
  const removedChars: string[] = showChips
    ? stage.characters.filter((c) => !effectiveChars.includes(c))
    : [];

  // Characters that could be added (in castList but never in the original SD)
  const addableChars: Character[] = showChips
    ? castList.filter((c) => !stage.characters.includes(c.id) && !effectiveChars.includes(c.id))
    : [];

  function charName(id: string): string {
    const found = castList.find((c) => c.id === id);
    if (found) return found.name;
    // Fallback: strip leading # and _PlayId suffix, then title-case each segment.
    // e.g. "#ATTENDANTS_Err" → "Attendants", "#LORDS.COURT_Ham" → "Lords Court"
    const stem = id.replace(/^#/, "").replace(/_[A-Za-z]+$/, "");
    return stem
      .split(".")
      .map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
      .join(" ");
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

  function addChar(charId: string) {
    if (!charId) return;
    dispatch({
      type: "SET_SD_CHARACTERS",
      stageId: stage.id,
      characters: [...effectiveChars, charId],
    });
  }

  const hasChipUI = showChips && (effectiveChars.length > 0 || removedChars.length > 0 || addableChars.length > 0);

  return (
    <div className={`group flex items-start gap-3 py-1.5 px-2 rounded ${isCut ? "opacity-50" : ""}`}>
      <div className="w-1 shrink-0" />
      <div className="flex-1 min-w-0">
        <div className={`text-sm italic text-stone-500 ${isCut ? "line-through text-stone-400" : ""}`}>
          {stage.text}
        </div>
        {hasChipUI && (
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
            {/* Add characters not originally in this SD */}
            {addableChars.length > 0 && (
              <select
                value=""
                onChange={(e) => addChar(e.target.value)}
                className="text-xs px-1 py-0.5 rounded bg-stone-50 text-stone-400 hover:text-stone-600 border border-stone-200 hover:border-stone-300 cursor-pointer transition-colors"
                title={`Add a character to this ${stage.stageType}`}
              >
                <option value="">+ add</option>
                {addableChars.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            )}
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
