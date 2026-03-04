import type { Character } from "@/types/play";

interface Props {
  character: Character;
  counts: { original: number; afterCut: number };
  isFiltered?: boolean;
  onClick?: () => void;
  /** Overrides character.name for display (e.g. alias) */
  displayName?: string;
}

export default function CharacterRow({ character, counts, isFiltered, onClick, displayName }: Props) {
  const { original, afterCut } = counts;
  const hasAdded = afterCut > original + 0.5;
  const hasCut = !hasAdded && afterCut < original;
  const pctCut = original > 0 ? Math.round((1 - afterCut / original) * 100) : 0;
  const pctAdd = original > 0 ? Math.round((afterCut / original - 1) * 100) : 0;
  // Bar: cap at 100% for cuts; allow wider bar for additions (relative to original)
  const barMax = hasAdded ? afterCut : original;
  const pctBar = barMax > 0 ? Math.min(afterCut / barMax, 1) * 100 : 100;

  return (
    <div
      className={`flex flex-col gap-0.5 py-1 rounded px-1 -mx-1 transition-colors ${
        onClick ? "cursor-pointer hover:bg-stone-50" : ""
      } ${isFiltered ? "bg-amber-50" : ""}`}
      onClick={onClick}
    >
      {/* Name + count on the same line — name wraps, count stays right-aligned */}
      <div className="flex items-baseline gap-1.5 min-w-0">
        <span className={`text-xs leading-snug flex-1 min-w-0 ${isFiltered ? "text-amber-800 font-medium" : "text-stone-700"}`}>
          {displayName ?? character.name}
        </span>
        <span className="text-xs tabular-nums text-right shrink-0">
          <span className={hasAdded ? "text-green-600 font-medium" : hasCut ? "text-red-500 font-medium" : "text-stone-500"}>
            {afterCut.toLocaleString()}
          </span>
          {(hasCut || hasAdded) && (
            <span className="text-stone-300"> / {original.toLocaleString()}</span>
          )}
          {hasCut && pctCut > 0 && (
            <span className="text-red-400"> −{pctCut}%</span>
          )}
          {hasAdded && pctAdd > 0 && (
            <span className="text-green-500"> +{pctAdd}%</span>
          )}
        </span>
      </div>
      {/* Bar — full width below the name row */}
      <div className="h-1 bg-stone-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${hasAdded ? "bg-green-400" : isFiltered ? "bg-amber-400" : hasCut ? "bg-red-300" : "bg-stone-400"}`}
          style={{ width: `${pctBar}%` }}
        />
      </div>
    </div>
  );
}
