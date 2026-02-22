import type { Character } from "@/types/play";

interface Props {
  character: Character;
  counts: { original: number; afterCut: number };
}

export default function CharacterRow({ character, counts }: Props) {
  const { original, afterCut } = counts;
  const pct = original > 0 ? afterCut / original : 1;
  const cut = original - afterCut;

  return (
    <div className="flex items-center gap-2 py-0.5">
      <div className="text-xs text-stone-700 truncate w-28">{character.name}</div>
      <div className="flex-1 h-1 bg-stone-100 rounded-full overflow-hidden">
        <div
          className="h-full bg-stone-400 rounded-full"
          style={{ width: `${pct * 100}%` }}
        />
      </div>
      <div className="text-xs text-stone-500 tabular-nums w-14 text-right">
        {afterCut}
        {cut > 0 && <span className="text-stone-300"> -{cut}</span>}
      </div>
    </div>
  );
}
