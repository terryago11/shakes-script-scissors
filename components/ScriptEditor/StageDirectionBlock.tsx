"use client";

import type { Character, StageDirection } from "@/types/play";
import { useProject } from "@/lib/project/ProjectStore";
import { useEditMode } from "@/lib/ui/EditModeContext";
import { resolveCharacterName } from "@/lib/project/projectUtils";

interface Props {
  stage: StageDirection;
  status: "kept" | "cut";
  onToggle: (() => void) | null;
  castList: Character[];
  /** Characters computed to be on stage just before this exit SD — enables the Sync exits button */
  onStageAtSd?: Set<string>;
  /** Characters who speak after this entrance SD but aren't yet on stage — enables Sync entrances button */
  entranceSuggestionsAtSd?: Set<string>;
}

export default function StageDirectionBlock({ stage, status, onToggle, castList, onStageAtSd, entranceSuggestionsAtSd }: Props) {
  const { activeCut, dispatch } = useProject();
  const { activeTool } = useEditMode();

  const isCut = status === "cut";
  const readonly = onToggle === null;

  // Show character chips (read-only display) on kept entrance/exit SDs — always visible
  const showChips =
    !isCut &&
    (stage.stageType === "entrance" || stage.stageType === "exit");

  // Interactive chip controls (×, +add, ⟳ sync) — only when SD Chars tool is active
  const showInteractiveChips = !readonly && showChips && activeTool === "edit-sds";

  const effectiveChars: string[] = (showChips || showInteractiveChips)
    ? (activeCut?.stageDirectionEdits?.[stage.id] ?? stage.characters)
    : stage.characters;

  // Characters removed from the original SD (were in original, now removed)
  const removedChars: string[] = showInteractiveChips
    ? stage.characters.filter((c) => !effectiveChars.includes(c))
    : [];

  // Characters that could be added (in castList but never in the original SD)
  const addableChars: Character[] = showInteractiveChips
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

  // Sync exits: show on exit SDs in SD Chars mode when the on-stage set is known.
  const showAutoFill =
    showInteractiveChips &&
    stage.stageType === "exit" &&
    (onStageAtSd?.size ?? 0) > 0;

  function handleAutoFill() {
    if (!onStageAtSd) return;
    dispatch({
      type: "SET_SD_CHARACTERS",
      stageId: stage.id,
      characters: [...onStageAtSd],
    });
  }

  // Sync entrances: show on entrance SDs in SD Chars mode when suggestions are known.
  const showSyncEntrances =
    showInteractiveChips &&
    stage.stageType === "entrance" &&
    (entranceSuggestionsAtSd?.size ?? 0) > 0;

  function handleSyncEntrances() {
    if (!entranceSuggestionsAtSd) return;
    // Merge suggestions with existing effective chars (don't overwrite what's already listed)
    const merged = new Set([...effectiveChars, ...entranceSuggestionsAtSd]);
    dispatch({
      type: "SET_SD_CHARACTERS",
      stageId: stage.id,
      characters: [...merged],
    });
  }

  const hasChipUI = showChips && (effectiveChars.length > 0 || removedChars.length > 0 || addableChars.length > 0 || showAutoFill || showSyncEntrances);

  // Song / dance detection — apply sdFlagOverrides on top of TEI values
  const flagOverride = activeCut?.sdFlagOverrides?.[stage.id];
  const isSong = flagOverride?.isSong ?? stage.isSong ?? false;
  const isDance = flagOverride?.isDance ?? stage.isDance ?? false;
  const isSpecial = isSong || isDance;

  // Duration set in the Scenes & Pauses dashboard — show read-only badge in script
  const currentDuration = isSpecial ? activeCut?.stageDurations?.[stage.id] : undefined;

  // Song/Dance tool active — flag toggle buttons on non-cut SDs
  const showFlagToggles = !readonly && !isCut && activeTool === "song-dance";

  function toggleSong() {
    dispatch({ type: "SET_SD_FLAGS", sdId: stage.id, isSong: !isSong, isDance });
  }

  function toggleDance() {
    dispatch({ type: "SET_SD_FLAGS", sdId: stage.id, isSong, isDance: !isDance });
  }

  // Derive text color for the SD based on type
  // Song+dance together → violet for prose text (gradient only on the symbols)
  const sdTextColor = isSong
    ? "text-violet-600 dark:text-violet-400"
    : isDance
    ? "text-cyan-600 dark:text-cyan-400"
    : "text-stone-500 dark:text-stone-400";

  // Both flags set → two separately-coloured symbols so neither is lost
  const sdPrefixNode = isSong && isDance ? (
    <><span className="text-violet-600 dark:text-violet-400 not-italic">♪</span><span className="text-cyan-600 dark:text-cyan-400 not-italic">⊛</span>{" "}</>
  ) : isSong ? "♪ " : isDance ? "⊛ " : "";

  return (
    <>
      <div className={`group flex items-start gap-3 py-1.5 px-2 rounded ${isCut ? "opacity-50" : ""}`}>
        <div className="w-1 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className={`text-sm italic ${sdTextColor} ${isCut ? "line-through text-stone-400 dark:text-stone-400" : ""}`}>
            {sdPrefixNode}{stage.text}
            {/* Read-only duration badge — editing happens in the Scenes & Pauses dashboard */}
            {currentDuration && !isCut && (
              <span className="not-italic ml-1.5 text-xs text-amber-600 dark:text-amber-400">
                (+{currentDuration % 1 === 0 ? currentDuration : currentDuration.toFixed(1)}m)
              </span>
            )}
          </div>

          {hasChipUI && (
            <div className="flex flex-wrap gap-1 mt-1">
              {/* Active characters */}
              {effectiveChars.map((charId) =>
                showInteractiveChips ? (
                  // Interactive: click × to remove
                  <button
                    key={charId}
                    onClick={() => removeChar(charId)}
                    className="text-xs px-1.5 py-0.5 rounded bg-stone-100 text-stone-600 hover:bg-red-50 hover:text-red-600 dark:bg-stone-700 dark:text-stone-300 dark:hover:bg-red-950/50 dark:hover:text-red-400 transition-colors"
                    title={`Remove ${charName(charId)} from this ${stage.stageType}`}
                  >
                    {charName(charId)} ×
                  </button>
                ) : (
                  // Read-only: static pill, no hover/click
                  <span
                    key={charId}
                    className="text-xs px-1.5 py-0.5 rounded bg-stone-100 text-stone-500 dark:bg-stone-700 dark:text-stone-400"
                  >
                    {charName(charId)}
                  </span>
                )
              )}
              {/* Removed characters — restore pill (interactive only) */}
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
              {/* Sync exits from on-stage set (interactive only) */}
              {showAutoFill && (
                <span className="relative group/sync inline-block">
                  <button
                    onClick={handleAutoFill}
                    className="text-xs px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200 dark:bg-amber-950/50 dark:text-amber-400 dark:border-amber-800 dark:hover:bg-amber-900/50 transition-colors"
                  >
                    ⟳ sync exits
                  </button>
                  <span className="absolute bottom-full left-0 mb-1 hidden group-hover/sync:block bg-stone-800 text-white text-[10px] leading-snug rounded px-2 py-1.5 whitespace-nowrap z-50 shadow-lg pointer-events-none">
                    Adds any onstage characters not mentioned in the exit text to the list
                  </span>
                </span>
              )}
              {/* Sync entrances from forward-scan (interactive only) */}
              {showSyncEntrances && (
                <span className="relative group/sync-ent inline-block">
                  <button
                    onClick={handleSyncEntrances}
                    className="text-xs px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200 dark:bg-amber-950/50 dark:text-amber-400 dark:border-amber-800 dark:hover:bg-amber-900/50 transition-colors"
                  >
                    ⟳ sync entrances
                  </button>
                  <span className="absolute bottom-full left-0 mb-1 hidden group-hover/sync-ent:block bg-stone-800 text-white text-[10px] leading-snug rounded px-2 py-1.5 whitespace-nowrap z-50 shadow-lg pointer-events-none">
                    Adds characters who exit later in the scene but have no prior entrance SD
                  </span>
                </span>
              )}
              {/* Add characters not originally in this SD (interactive only) */}
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

          {/* Song/Dance tool: flag toggles + Insert SD button */}
          {showFlagToggles && (
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              <button
                onClick={toggleSong}
                className={`text-xs px-2 py-0.5 rounded border transition-colors ${
                  isSong
                    ? "bg-violet-100 text-violet-700 border-violet-300 dark:bg-violet-950/60 dark:text-violet-300 dark:border-violet-700"
                    : "bg-stone-50 text-stone-400 border-stone-200 hover:text-violet-600 hover:border-violet-300 dark:bg-stone-900 dark:text-stone-500 dark:border-stone-700 dark:hover:text-violet-400 dark:hover:border-violet-700"
                }`}
                title={isSong ? "Remove song flag" : "Mark as song"}
              >
                ♪ song
              </button>
              <button
                onClick={toggleDance}
                className={`text-xs px-2 py-0.5 rounded border transition-colors ${
                  isDance
                    ? "bg-cyan-100 text-cyan-700 border-cyan-300 dark:bg-cyan-950/60 dark:text-cyan-300 dark:border-cyan-700"
                    : "bg-stone-50 text-stone-400 border-stone-200 hover:text-cyan-600 hover:border-cyan-300 dark:bg-stone-900 dark:text-stone-500 dark:border-stone-700 dark:hover:text-cyan-400 dark:hover:border-cyan-700"
                }`}
                title={isDance ? "Remove dance flag" : "Mark as dance"}
              >
                ⊛ dance
              </button>

            </div>
          )}
        </div>
        {!readonly && isCut && activeTool === "restore" && (
          <button
            onClick={onToggle ?? undefined}
            className="self-center text-xs px-2 py-0.5 rounded border border-green-200 bg-green-50 text-green-700 hover:bg-green-100 hover:border-green-300 dark:border-green-800 dark:bg-green-950/50 dark:text-green-400 dark:hover:bg-green-900/50 dark:hover:border-green-700 transition-all shrink-0"
            title="Restore stage direction"
          >
            ↩ restore
          </button>
        )}
      </div>

    </>
  );
}
