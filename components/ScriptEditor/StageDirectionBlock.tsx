"use client";

import { useState } from "react";
import type { Character, StageDirection } from "@/types/play";
import { useProject } from "@/lib/project/ProjectStore";
import { resolveCharacterName } from "@/lib/project/projectUtils";

interface Props {
  stage: StageDirection;
  status: "kept" | "cut";
  onToggle: (() => void) | null;
  castList: Character[];
  /** Characters computed to be on stage just before this exit SD — enables the Sync exits button */
  onStageAtSd?: Set<string>;
}

export default function StageDirectionBlock({ stage, status, onToggle, castList, onStageAtSd }: Props) {
  const { activeCut, dispatch } = useProject();
  const [editingDuration, setEditingDuration] = useState(false);
  const [durationInput, setDurationInput] = useState("");

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
    return resolveCharacterName(id, activeCut?.characterAliases, castList);
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

  // Sync exits: available on exit SDs when the on-stage set is known and:
  // - the SD has no effective characters (empty "Exeunt"), OR
  // - the SD text matches "all" / "exeunt" (mass exit that may be incomplete)
  const showAutoFill =
    showChips &&
    stage.stageType === "exit" &&
    (onStageAtSd?.size ?? 0) > 0 &&
    (effectiveChars.length === 0 || /\ball\b|\bexeunt\b/i.test(stage.text));

  function handleAutoFill() {
    if (!onStageAtSd) return;
    dispatch({
      type: "SET_SD_CHARACTERS",
      stageId: stage.id,
      characters: [...onStageAtSd],
    });
  }

  const hasChipUI = showChips && (effectiveChars.length > 0 || removedChars.length > 0 || addableChars.length > 0 || showAutoFill);

  // Song / dance detection
  const isSong = stage.isSong === true;
  const isDance = stage.isDance === true;
  const isSpecial = isSong || isDance;

  // Duration editor (only for song/dance SDs that are kept and editable)
  const canEditDuration = isSpecial && !isCut && !readonly;
  const currentDuration = activeCut?.stageDurations?.[stage.id];

  function handleSaveDuration() {
    const mins = parseFloat(durationInput);
    if (!isNaN(mins) && mins > 0) {
      dispatch({ type: "SET_STAGE_DURATION", stageId: stage.id, minutes: mins });
    } else {
      dispatch({ type: "CLEAR_STAGE_DURATION", stageId: stage.id });
    }
    setEditingDuration(false);
    setDurationInput("");
  }

  function handleClearDuration() {
    dispatch({ type: "CLEAR_STAGE_DURATION", stageId: stage.id });
  }

  function handleDurationKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") handleSaveDuration();
    if (e.key === "Escape") { setEditingDuration(false); setDurationInput(""); }
  }

  // Derive text color for the SD based on type
  const sdTextColor = isSong
    ? "text-violet-600 dark:text-violet-400"
    : isDance
    ? "text-cyan-600 dark:text-cyan-400"
    : "text-stone-500 dark:text-stone-400";

  const sdPrefix = isSong ? "♪ " : isDance ? "⊛ " : "";

  return (
    <div className={`group flex items-start gap-3 py-1.5 px-2 rounded ${isCut ? "opacity-50" : ""}`}>
      <div className="w-1 shrink-0" />
      <div className="flex-1 min-w-0">
        <div className={`text-sm italic ${sdTextColor} ${isCut ? "line-through text-stone-400 dark:text-stone-400" : ""}`}>
          {sdPrefix}{stage.text}
          {/* Duration badge */}
          {canEditDuration && currentDuration && !editingDuration && (
            <span className="not-italic ml-1.5 text-xs text-amber-600 dark:text-amber-400">
              (+{currentDuration % 1 === 0 ? currentDuration : currentDuration.toFixed(1)}m)
            </span>
          )}
        </div>

        {/* Duration editor row — for song/dance SDs */}
        {canEditDuration && (
          <div className="mt-0.5 flex items-center gap-1.5">
            {editingDuration ? (
              <>
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  value={durationInput}
                  onChange={(e) => setDurationInput(e.target.value)}
                  onBlur={handleSaveDuration}
                  onKeyDown={handleDurationKeyDown}
                  autoFocus
                  className="w-14 text-xs px-1 py-0.5 rounded border border-amber-300 dark:border-amber-700 bg-white dark:bg-stone-900 text-stone-700 dark:text-stone-300 focus:outline-none focus:ring-1 focus:ring-amber-400"
                  placeholder="0"
                />
                <span className="text-xs text-stone-400 dark:text-stone-500">min</span>
                <button
                  onMouseDown={(e) => { e.preventDefault(); handleSaveDuration(); }}
                  className="text-xs px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200 dark:bg-amber-950/50 dark:text-amber-400 dark:border-amber-800 dark:hover:bg-amber-900/50 transition-colors"
                >
                  save
                </button>
              </>
            ) : (
              <>
                {currentDuration ? (
                  <>
                    <button
                      onClick={() => { setDurationInput(String(currentDuration)); setEditingDuration(true); }}
                      className="text-xs px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200 dark:bg-amber-950/50 dark:text-amber-400 dark:border-amber-800 dark:hover:bg-amber-900/50 transition-colors"
                    >
                      {currentDuration % 1 === 0 ? currentDuration : currentDuration.toFixed(1)}m
                    </button>
                    <button
                      onClick={handleClearDuration}
                      className="text-xs text-stone-300 hover:text-stone-500 dark:text-stone-600 dark:hover:text-stone-400 transition-colors"
                      title="Remove duration"
                    >
                      ×
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => { setDurationInput(""); setEditingDuration(true); }}
                    className="opacity-0 group-hover:opacity-100 text-xs text-stone-300 hover:text-amber-600 dark:text-stone-600 dark:hover:text-amber-400 transition-all"
                    title={`Add extra time for this ${isSong ? "song" : "dance"}`}
                  >
                    + time
                  </button>
                )}
              </>
            )}
          </div>
        )}

        {hasChipUI && (
          <div className="flex flex-wrap gap-1 mt-1">
            {/* Active characters — click × to remove */}
            {effectiveChars.map((charId) => (
              <button
                key={charId}
                onClick={() => removeChar(charId)}
                className="text-xs px-1.5 py-0.5 rounded bg-stone-100 text-stone-600 hover:bg-red-50 hover:text-red-600 dark:bg-stone-700 dark:text-stone-300 dark:hover:bg-red-950/50 dark:hover:text-red-400 transition-colors"
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
                className="text-xs px-1.5 py-0.5 rounded bg-stone-50 text-stone-300 hover:text-stone-500 dark:bg-stone-900 dark:text-stone-600 dark:hover:text-stone-400 line-through transition-colors"
                title={`Restore ${charName(charId)} to this ${stage.stageType}`}
              >
                {charName(charId)}
              </button>
            ))}
            {/* Sync exits from on-stage set — for empty/all-exit SDs */}
            {showAutoFill && (
              <button
                onClick={handleAutoFill}
                className="text-xs px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200 dark:bg-amber-950/50 dark:text-amber-400 dark:border-amber-800 dark:hover:bg-amber-900/50 transition-colors"
                title="Sync exit characters from on-stage tracking (based on entrance SDs)"
              >
                ⟳ sync exits
              </button>
            )}
            {/* Add characters not originally in this SD */}
            {addableChars.length > 0 && (
              <select
                value=""
                onChange={(e) => addChar(e.target.value)}
                className="text-xs px-1 py-0.5 rounded bg-stone-50 text-stone-400 hover:text-stone-600 border border-stone-200 hover:border-stone-300 dark:bg-stone-900 dark:text-stone-400 dark:hover:text-stone-300 dark:border-stone-700 dark:hover:border-stone-600 cursor-pointer transition-colors"
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
          className="opacity-0 group-hover:opacity-100 self-center text-xs px-2 py-0.5 rounded border border-green-200 bg-green-50 text-green-700 hover:bg-green-100 hover:border-green-300 dark:border-green-800 dark:bg-green-950/50 dark:text-green-400 dark:hover:bg-green-900/50 dark:hover:border-green-700 transition-all shrink-0"
          title="Restore stage direction"
        >
          ↩ restore
        </button>
      )}
    </div>
  );
}
