"use client";

import { useState } from "react";
import type { Character } from "@/types/play";
import type { InsertedSD } from "@/types/insertedsd";
import { useEditMode } from "@/lib/ui/EditModeContext";
import { useViewMode } from "@/lib/ui/ViewModeContext";
import { resolveCharacterName } from "@/lib/project/projectUtils";
import InsertedSDModal from "./InsertedSDModal";

interface Props {
  sd: InsertedSD;
  /** "kept" or "cut" from the cut's cutMap */
  status: "kept" | "cut";
  castList: Character[];
  characterAliases?: Record<string, string>;
  onToggle: (() => void) | null;
  onRemove: (sdId: string) => void;
  onEdit: (sd: InsertedSD) => void;
}

export default function InsertedSDBlock({
  sd,
  status,
  castList,
  characterAliases,
  onToggle,
  onRemove,
  onEdit,
}: Props) {
  const { activeTool } = useEditMode();
  const { viewMode } = useViewMode();
  const [editOpen, setEditOpen] = useState(false);
  const isClean = viewMode === "clean";
  const isCut = status === "cut";

  // In clean view: hide cut SDs; render kept SDs without green styling
  if (isClean) {
    if (isCut) return null;
    const isSong = sd.isSong === true;
    const isDance = sd.isDance === true;
    const sdTextColor = isSong
      ? "text-violet-600 dark:text-violet-400"
      : isDance
      ? "text-cyan-600 dark:text-cyan-400"
      : "text-stone-500 dark:text-stone-400";
    const prefix = isSong && isDance
      ? <><span className="text-violet-600 dark:text-violet-400 not-italic">♪</span><span className="text-cyan-600 dark:text-cyan-400 not-italic">⊛</span>{" "}</>
      : isSong ? "♪ " : isDance ? "⊛ " : "";
    return (
      <div className="flex items-start gap-3 py-1.5 px-2 rounded">
        <div className="w-1 shrink-0" />
        <div className={`flex-1 text-sm italic ${sdTextColor}`}>{prefix}{sd.text}</div>
      </div>
    );
  }

  const isSong = sd.isSong === true;
  const isDance = sd.isDance === true;
  const sdTextColor = isSong
    ? "text-violet-600 dark:text-violet-400"
    : isDance
    ? "text-cyan-600 dark:text-cyan-400"
    : "text-stone-500 dark:text-stone-400";
  const prefix = isSong && isDance
    ? <><span className="text-violet-600 dark:text-violet-400 not-italic">♪</span><span className="text-cyan-600 dark:text-cyan-400 not-italic">⊛</span>{" "}</>
    : isSong ? "♪ " : isDance ? "⊛ " : "";

  const showChars = !isCut && (sd.stageType === "entrance" || sd.stageType === "exit") && sd.characters.length > 0;

  return (
    <>
      <div className={`group flex items-start gap-3 py-1.5 px-2 rounded border-l-2 border-green-400 dark:border-green-600 bg-green-50/50 dark:bg-green-950/20 ${isCut ? "opacity-50" : ""}`}>
        <div className="w-1 shrink-0" />
        <div className="flex-1 min-w-0">
          {/* Header row with badge + edit/remove controls */}
          <div className="flex items-center gap-1.5 mb-0.5 min-w-0">
            <span className="text-[10px] text-green-600 dark:text-green-500 italic font-normal bg-green-100 dark:bg-green-900/50 px-1 rounded shrink-0">
              inserted
            </span>
            {activeTool === "edit-sds" && !isCut && (
              <div className="ml-auto flex items-center gap-1 shrink-0">
                <button
                  onClick={(e) => { e.stopPropagation(); setEditOpen(true); }}
                  className="text-xs px-1.5 py-0.5 rounded border border-stone-200 bg-stone-50 text-stone-500 hover:bg-stone-100 hover:border-stone-300 dark:border-stone-700 dark:bg-stone-900/50 dark:text-stone-400 dark:hover:bg-stone-800 transition-all"
                  title="Edit this stage direction"
                >
                  ✎ edit
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); onRemove(sd.id); }}
                  className="text-xs px-1.5 py-0.5 rounded border border-red-200 bg-red-50 text-red-600 hover:bg-red-100 hover:border-red-300 dark:border-red-800 dark:bg-red-950/50 dark:text-red-400 dark:hover:bg-red-900/50 transition-all"
                  title="Remove this stage direction"
                >
                  ✕ remove
                </button>
              </div>
            )}
          </div>

          {/* SD text */}
          <div className={`text-sm italic ${sdTextColor} ${isCut ? "line-through text-stone-400 dark:text-stone-400" : ""}`}>
            {prefix}{sd.text}
          </div>

          {/* Character chips for entrance/exit */}
          {showChars && (
            <div className="flex flex-wrap gap-1 mt-1">
              {sd.characters.map((charId) => (
                <span
                  key={charId}
                  className="text-xs px-1.5 py-0.5 rounded bg-stone-100 text-stone-500 dark:bg-stone-700 dark:text-stone-400"
                >
                  {resolveCharacterName(charId, characterAliases, castList)}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Restore button in restore mode */}
        {onToggle !== null && isCut && activeTool === "restore" && (
          <button
            onClick={onToggle}
            className="self-center text-xs px-2 py-0.5 rounded border border-green-200 bg-green-50 text-green-700 hover:bg-green-100 hover:border-green-300 dark:border-green-800 dark:bg-green-950/50 dark:text-green-400 dark:hover:bg-green-900/50 dark:hover:border-green-700 transition-all shrink-0"
            title="Restore stage direction"
          >
            ↩ restore
          </button>
        )}
      </div>

      {editOpen && (
        <InsertedSDModal
          afterUnitId={sd.afterUnitId}
          castList={castList}
          existing={sd}
          onConfirm={onEdit}
          onClose={() => setEditOpen(false)}
        />
      )}
    </>
  );
}
