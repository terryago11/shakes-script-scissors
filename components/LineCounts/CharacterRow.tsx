import type { Character } from "@/types/play";

interface Props {
  character: Character;
  counts: { original: number; afterCut: number };
  isFiltered?: boolean;
  onClick?: () => void;
}

export default function CharacterRow({ character, counts, isFiltered, onClick }: Props) {
  const { original, afterCut } = counts;
  const pct = original > 0 ? afterCut / original : 1;
  const pctCut = original > 0 ? Math.round((1 - pct) * 100) : 0;

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
          {character.name}
        </span>
        <span className="text-xs text-stone-500 tabular-nums text-right shrink-0">
          {afterCut.toLocaleString()}
          {pctCut > 0 && (
            <>
              <span className="text-stone-300"> / {original.toLocaleString()}</span>
              <span className="text-stone-400"> −{pctCut}%</span>
            </>
          )}
        </span>
      </div>
      {/* Bar — full width below the name row */}
      <div className="h-1 bg-stone-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${isFiltered ? "bg-amber-400" : "bg-stone-400"}`}
          style={{ width: `${pct * 100}%` }}
        />
      </div>
    </div>
  );
}
