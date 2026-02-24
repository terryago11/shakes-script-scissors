"use client";

import type { Play } from "@/types/play";
import type { Actor, ActorAssignment } from "@/types/project";
import type { LineCounts } from "@/types/cut";
import CharacterRow from "./CharacterRow";
import ActorRow from "./ActorRow";

type FilterState = { type: "character"; id: string } | { type: "actor"; id: string } | null;

interface Props {
  play: Play;
  lineCounts: LineCounts;
  actors: Actor[];
  assignments: ActorAssignment[];
  filter?: FilterState;
  onFilterCharacter?: (characterId: string | null) => void;
  onFilterActor?: (actorId: string | null) => void;
}

export default function LineCountPanel({ play, lineCounts, actors, filter, onFilterCharacter, onFilterActor }: Props) {
  const { total, byCharacter, byActor } = lineCounts;
  const pct = total.original > 0
    ? Math.round((1 - total.afterCut / total.original) * 100)
    : 0;

  function handleCharacterClick(characterId: string) {
    onFilterCharacter?.(filter?.type === "character" && filter.id === characterId ? null : characterId);
  }

  function handleActorClick(actorId: string) {
    onFilterActor?.(filter?.type === "actor" && filter.id === actorId ? null : actorId);
  }

  return (
    <div className="p-4">
      {/* Total */}
      <div className="mb-5">
        <div className="text-xs font-semibold text-stone-400 uppercase tracking-wider mb-2">
          Total Lines
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-bold text-stone-800">{total.afterCut}</span>
          <span className="text-sm text-stone-400">/ {total.original}</span>
        </div>
        {pct > 0 && (
          <div className="mt-1 text-xs text-amber-600 font-medium">{pct}% cut</div>
        )}
        {/* Progress bar */}
        <div className="mt-2 h-1.5 bg-stone-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-amber-400 rounded-full transition-all"
            style={{ width: `${total.original > 0 ? (total.afterCut / total.original) * 100 : 100}%` }}
          />
        </div>
      </div>

      {/* By Actor */}
      {actors.length > 0 && (
        <div className="mb-5">
          <div className="text-xs font-semibold text-stone-400 uppercase tracking-wider mb-2">
            By Actor
            {filter?.type === "actor" && (
              <button
                onClick={() => onFilterActor?.(null)}
                className="ml-2 normal-case font-normal text-amber-500 hover:text-amber-700"
              >
                Clear filter
              </button>
            )}
          </div>
          <div className="space-y-2">
            {actors.map((actor) => {
              const isFiltered = filter?.type === "actor" && filter.id === actor.id;
              return (
                <ActorRow
                  key={actor.id}
                  actor={actor}
                  counts={byActor[actor.id] || { characters: [], original: 0, afterCut: 0 }}
                  play={play}
                  isFiltered={isFiltered}
                  onClick={onFilterActor ? () => handleActorClick(actor.id) : undefined}
                />
              );
            })}
          </div>
        </div>
      )}

      {/* By Character */}
      <div>
        <div className="text-xs font-semibold text-stone-400 uppercase tracking-wider mb-2">
          By Character
          {filter?.type === "character" && (
            <button
              onClick={() => onFilterCharacter?.(null)}
              className="ml-2 normal-case font-normal text-amber-500 hover:text-amber-700"
            >
              Clear filter
            </button>
          )}
        </div>
        <div className="space-y-1">
          {play.castList
            .filter((c) => (byCharacter[c.id]?.original ?? 0) > 0)
            .sort(
              (a, b) =>
                (byCharacter[b.id]?.original ?? 0) - (byCharacter[a.id]?.original ?? 0)
            )
            .map((char) => (
              <CharacterRow
                key={char.id}
                character={char}
                counts={byCharacter[char.id] || { original: 0, afterCut: 0 }}
                isFiltered={filter?.type === "character" && filter.id === char.id}
                onClick={onFilterCharacter ? () => handleCharacterClick(char.id) : undefined}
              />
            ))}
        </div>
      </div>
    </div>
  );
}
