"use client";

import { useState } from "react";
import type { Character, StageDirection } from "@/types/play";
import { useProject } from "@/lib/project/ProjectStore";
import { useEditMode } from "@/lib/ui/EditModeContext";
import { useViewMode } from "@/lib/ui/ViewModeContext";
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
  /** When true, render stage.text as-is without applying sdTextEdits (used by DiffView's original column) */
  ignoreTextEdits?: boolean;
}

export default function StageDirectionBlock({ stage, status, onToggle, castList, onStageAtSd, entranceSuggestionsAtSd, ignoreTextEdits }: Props) {
  const { activeCut, dispatch } = useProject();
  const { activeTool } = useEditMode();
  const { viewMode } = useViewMode();

  const isCut = status === "cut";
  const readonly = onToggle === null;

  // Effective text: use sdTextEdits override unless caller requests the raw original
  const effectiveText = ignoreTextEdits
    ? stage.text
    : (activeCut?.sdTextEdits?.[stage.id] ?? stage.text);
  const hasTextEdit = !ignoreTextEdits && !!activeCut?.sdTextEdits?.[stage.id];

  // Inline text-edit state (only active in edit-sds mode)
  const [isEditingText, setIsEditingText] = useState(false);
  const [draftText, setDraftText] = useState("");

  function startTextEdit() {
    setDraftText(effectiveText);
    setIsEditingText(true);
  }

  function commitTextEdit() {
    dispatch({ type: "SET_SD_TEXT", stageId: stage.id, text: draftText });
    setIsEditingText(false);
  }

  function cancelTextEdit() {
    setIsEditingText(false);
  }

  function restoreText() {
    dispatch({ type: "SET_SD_TEXT", stageId: stage.id, text: null });
  }

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

  // Text editing is available in edit-sds mode on non-cut, non-readonly SDs
  const canEditText = !readonly && !isCut && activeTool === "edit-sds";

  // Show green insertion style when the text has been edited (standard + diff only, not clean)
  const showEditedStyle = hasTextEdit && !isCut && viewMode !== "clean";

  // Cut text style mirrors SpeechBlock: red in standard mode, red+bg in diff
  const cutTextClass = isCut
    ? viewMode === "diff"
      ? "text-red-500 line-through"
      : "text-red-400 line-through opacity-60"
    : "";

  return (
    <>
      <div data-unit-id={stage.id} className={`group flex items-start gap-3 py-1.5 px-2 rounded ${showEditedStyle ? "border-l-2 border-green-400 dark:border-green-600 bg-green-50/50 dark:bg-green-950/20" : ""}`}>
        <div className="w-1 shrink-0" />
        <div className="flex-1 min-w-0">
          {showEditedStyle && (
            <div className="flex items-center gap-1.5 mb-0.5">
              <span className="text-[10px] text-green-600 dark:text-green-500 italic font-normal bg-green-100 dark:bg-green-900/50 px-1 rounded">
                edited
              </span>
            </div>
          )}
          <div className={`text-sm italic ${isCut ? cutTextClass : sdTextColor}`}>
            {sdPrefixNode}
            {isEditingText ? (
              <textarea
                autoFocus
                value={draftText}
                rows={Math.max(1, draftText.split("\n").length)}
                onChange={(e) => setDraftText(e.target.value)}
                onBlur={commitTextEdit}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    commitTextEdit();
                  } else if (e.key === "Escape") {
                    e.preventDefault();
                    cancelTextEdit();
                  }
                }}
                className="not-italic w-full bg-stone-50 dark:bg-stone-800 border border-stone-300 dark:border-stone-600 rounded px-1.5 py-0.5 text-stone-700 dark:text-stone-200 text-sm resize-none focus:outline-none focus:border-amber-400 dark:focus:border-amber-500"
              />
            ) : canEditText ? (
              <span className="inline">
                <span>{effectiveText}</span>
                <button
                  onClick={startTextEdit}
                  className="not-italic ml-1 text-xs text-stone-400 hover:text-stone-600 dark:text-stone-500 dark:hover:text-stone-300 transition-colors"
                  title="Edit stage direction text"
                >✎</button>
              </span>
            ) : (
              <span>{effectiveText}</span>
            )}
            {/* Read-only duration badge — editing happens in the Scenes & Pauses dashboard */}
            {!isEditingText && currentDuration && !isCut && (
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
        {!readonly && activeTool === "edit-sds" && !isCut && (
          <div className="flex flex-col gap-1 shrink-0 self-center">
            <button
              onClick={() => dispatch({ type: "TOGGLE_UNIT", unitId: stage.id })}
              className="text-xs px-2 py-0.5 rounded border border-stone-200 bg-stone-50 text-stone-400 hover:bg-red-50 hover:text-red-600 hover:border-red-200 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-500 dark:hover:bg-red-950/50 dark:hover:text-red-400 dark:hover:border-red-800 transition-all"
              title="Cut this stage direction entirely (use Restore tool or undo to recover)"
            >
              ✂ cut
            </button>
          </div>
        )}
        {!readonly && activeTool === "restore" && (
          <div className="flex flex-col gap-1 shrink-0 self-center">
            {isCut && (
              <button
                onClick={onToggle ?? undefined}
                className="text-xs px-2 py-0.5 rounded border border-green-200 bg-green-50 text-green-700 hover:bg-green-100 hover:border-green-300 dark:border-green-800 dark:bg-green-950/50 dark:text-green-400 dark:hover:bg-green-900/50 dark:hover:border-green-700 transition-all"
                title="Restore stage direction"
              >
                ↩ restore
              </button>
            )}
            {!isCut && hasTextEdit && (
              <button
                onClick={restoreText}
                className="text-xs px-2 py-0.5 rounded border border-green-200 bg-green-50 text-green-700 hover:bg-green-100 hover:border-green-300 dark:border-green-800 dark:bg-green-950/50 dark:text-green-400 dark:hover:bg-green-900/50 dark:hover:border-green-700 transition-all"
                title="Restore original stage direction text"
              >
                ↩ restore text
              </button>
            )}
          </div>
        )}
      </div>

    </>
  );
}
