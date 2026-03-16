"use client";

import type { Character } from "@/types/play";
import type { Insertion } from "@/types/insertion";
import { useEditMode } from "@/lib/ui/EditModeContext";
import { useViewMode } from "@/lib/ui/ViewModeContext";
import { resolveCharacterName } from "@/lib/project/projectUtils";

interface Props {
  insertion: Insertion;
  castList: Character[];
  characterAliases?: Record<string, string>;
  /** When true, this insertion continues from the same character as the preceding speech */
  isContinuation?: boolean;
  /** Called when the user clicks the ✕ Remove button */
  onRemove: (insertionId: string) => void;
  /** Called when the user clicks the ✎ Edit button */
  onEdit?: (insertion: Insertion) => void;
}

export default function InsertionBlock({
  insertion,
  castList,
  characterAliases,
  isContinuation,
  onRemove,
  onEdit,
}: Props) {
  const charName = resolveCharacterName(insertion.characterId, characterAliases, castList);
  const { activeTool } = useEditMode();
  const { viewMode } = useViewMode();
  const isClean = viewMode === "clean";

  // In clean view: render as a normal speech block (no green styling, no badge, no cont. label).
  // When continuing the same character, hide the name header entirely.
  if (isClean) {
    return (
      <div className="group flex gap-3 py-2 px-2 rounded">
        <div className="w-1 rounded-full shrink-0 mt-1 bg-stone-300 dark:bg-stone-600" style={{ minHeight: "1.25rem" }} />
        <div className="flex-1 min-w-0">
          {!isContinuation && (
          <div className="flex items-center gap-1.5 mb-1">
            <span className="text-xs font-bold uppercase tracking-wider text-stone-600 dark:text-stone-300 shrink-0">
              {charName}
            </span>
          </div>
          )}
          <div className="font-serif text-sm leading-relaxed text-stone-800 dark:text-stone-100">
            {insertion.lines.map((line) => (
              <div key={line.id}><span>{line.text}</span></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="group flex gap-3 py-2 px-2 rounded border-l-2 border-green-400 dark:border-green-600 bg-green-50/50 dark:bg-green-950/20">
      {/* Green bar */}
      <div className="w-1 rounded-full shrink-0 mt-1 bg-green-400 dark:bg-green-600" style={{ minHeight: "1.25rem" }} />

      <div className="flex-1 min-w-0">
        {/* Header row */}
        <div className="flex items-center gap-1.5 mb-1 min-w-0">
          <span className="text-xs font-bold uppercase tracking-wider text-green-700 dark:text-green-400 shrink-0">
            {isContinuation
              ? <span className="font-normal italic normal-case tracking-normal text-green-600 dark:text-green-500">{charName.toLowerCase()} cont.</span>
              : charName}
          </span>
          <span className="text-[10px] text-green-600 dark:text-green-500 italic font-normal normal-case tracking-normal shrink-0 bg-green-100 dark:bg-green-900/50 px-1 rounded">
            inserted
          </span>
          <span className="text-xs text-green-600 dark:text-green-500 font-normal normal-case tracking-normal shrink-0">
            ({insertion.lines.length}L)
          </span>
          {activeTool === "insert" && (
            <div className="ml-auto flex items-center gap-1 shrink-0">
              {onEdit && (
                <button
                  onClick={(e) => { e.stopPropagation(); onEdit(insertion); }}
                  className="text-xs px-1.5 py-0.5 rounded border border-stone-200 bg-stone-50 text-stone-500 hover:bg-stone-100 hover:border-stone-300 dark:border-stone-700 dark:bg-stone-900/50 dark:text-stone-400 dark:hover:bg-stone-800 transition-all"
                  title="Edit this insertion"
                >
                  ✎ edit
                </button>
              )}
              <button
                onClick={(e) => { e.stopPropagation(); onRemove(insertion.id); }}
                className="text-xs px-1.5 py-0.5 rounded border border-red-200 bg-red-50 text-red-600 hover:bg-red-100 hover:border-red-300 dark:border-red-800 dark:bg-red-950/50 dark:text-red-400 dark:hover:bg-red-900/50 transition-all"
                title="Remove this insertion"
              >
                ✕ remove
              </button>
            </div>
          )}
        </div>

        {/* Lines */}
        <div className="font-serif text-sm leading-relaxed text-stone-800 dark:text-stone-100">
          {insertion.lines.map((line) => (
            <div key={line.id} className="flex items-baseline gap-1">
              <span className="flex-1">{line.text}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
