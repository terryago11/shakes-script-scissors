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
  const cut = original - afterCut;

  return (
    <div
      className={`flex items-center gap-2 py-0.5 rounded px-1 -mx-1 transition-colors ${
        onClick ? "cursor-pointer hover:bg-stone-50" : ""
      } ${isFiltered ? "bg-amber-50" : ""}`}
      onClick={onClick}
    >
      <div className={`text-xs truncate w-28 ${isFiltered ? "text-amber-800 font-medium" : "text-stone-700"}`}>
        {character.name}
      </div>
      <div className="flex-1 h-1 bg-stone-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${isFiltered ? "bg-amber-400" : "bg-stone-400"}`}
          style={{ width: `${pct * 100}%` }}
        />
      </div>
      <div className="text-xs text-stone-500 tabular-nums w-14 text-right">
        {afterCut.toLocaleString()}
        {cut > 0 && <span className="text-stone-300"> -{cut.toLocaleString()}</span>}
      </div>
    </div>
  );
}
