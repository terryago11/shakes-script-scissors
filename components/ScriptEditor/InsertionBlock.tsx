"use client";

import type { Character } from "@/types/play";
import type { Insertion } from "@/types/insertion";
import { resolveCharacterName } from "@/lib/project/projectUtils";

interface Props {
  insertion: Insertion;
  castList: Character[];
  characterAliases?: Record<string, string>;
  /** Called when the user clicks the ✕ Remove button */
  onRemove: (insertionId: string) => void;
}

export default function InsertionBlock({
  insertion,
  castList,
  characterAliases,
  onRemove,
}: Props) {
  const charName = resolveCharacterName(insertion.characterId, characterAliases, castList);

  return (
    <div className="group flex gap-3 py-2 px-2 rounded border-l-2 border-green-400 dark:border-green-600 bg-green-50/50 dark:bg-green-950/20">
      {/* Green bar */}
      <div className="w-1 rounded-full shrink-0 mt-1 bg-green-400 dark:bg-green-600" style={{ minHeight: "1.25rem" }} />

      <div className="flex-1 min-w-0">
        {/* Header row */}
        <div className="flex items-center gap-1.5 mb-1 min-w-0">
          <span className="text-xs font-bold uppercase tracking-wider text-green-700 dark:text-green-400 shrink-0">
            {charName}
          </span>
          <span className="text-[10px] text-green-600 dark:text-green-500 italic font-normal normal-case tracking-normal shrink-0 bg-green-100 dark:bg-green-900/50 px-1 rounded">
            inserted
          </span>
          <span className="text-xs text-green-600 dark:text-green-500 font-normal normal-case tracking-normal shrink-0">
            ({insertion.lines.length}L)
          </span>
          <button
            onClick={(e) => { e.stopPropagation(); onRemove(insertion.id); }}
            className="opacity-0 group-hover:opacity-100 ml-auto text-xs px-1.5 py-0.5 rounded border border-red-200 bg-red-50 text-red-600 hover:bg-red-100 hover:border-red-300 dark:border-red-800 dark:bg-red-950/50 dark:text-red-400 dark:hover:bg-red-900/50 transition-all shrink-0"
            title="Remove this insertion"
          >
            ✕ remove
          </button>
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
