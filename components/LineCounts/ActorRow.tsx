import type { Play } from "@/types/play";
import type { Actor } from "@/types/project";

interface Props {
  actor: Actor;
  counts: { characters: string[]; original: number; afterCut: number };
  play: Play;
  isFiltered?: boolean;
  onClick?: () => void;
}

export default function ActorRow({ actor, counts, play, isFiltered, onClick }: Props) {
  const { original, afterCut, characters } = counts;
  const pct = original > 0 ? afterCut / original : 1;

  const charNames = characters
    .map((cId) => play.castList.find((c) => c.id === cId)?.name || cId)
    .join(", ");

  return (
    <div
      className={`py-1 rounded px-1 -mx-1 transition-colors ${
        onClick ? "cursor-pointer hover:bg-stone-50" : ""
      } ${isFiltered ? "bg-amber-50" : ""}`}
      onClick={onClick}
    >
      <div className="flex items-center gap-2 mb-0.5">
        <div
          className="w-2 h-2 rounded-full shrink-0"
          style={{ backgroundColor: actor.color }}
        />
        <div className={`text-xs font-medium truncate ${isFiltered ? "text-amber-800" : "text-stone-700"}`}>
          {actor.name}
        </div>
        <div className="ml-auto text-xs text-stone-500 tabular-nums">
          <span className="font-medium">{afterCut.toLocaleString()}</span>
          <span className="text-stone-300"> / {original.toLocaleString()}</span>
          {original > 0 && afterCut < original && (
            <span className="text-amber-600 ml-1">−{Math.round((1 - afterCut / original) * 100)}%</span>
          )}
        </div>
      </div>
      <div className="ml-4">
        <div className="h-1 bg-stone-100 rounded-full overflow-hidden mb-0.5">
          <div
            className="h-full rounded-full"
            style={{ width: `${pct * 100}%`, backgroundColor: actor.color }}
          />
        </div>
        {charNames && (
          <div className="text-xs text-stone-400 truncate">{charNames}</div>
        )}
      </div>
    </div>
  );
}
