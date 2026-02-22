"use client";

import type { Play } from "@/types/play";
import type { Actor, ActorAssignment } from "@/types/project";
import type { LineCounts } from "@/types/cut";
import CharacterRow from "./CharacterRow";
import ActorRow from "./ActorRow";

interface Props {
  play: Play;
  lineCounts: LineCounts;
  actors: Actor[];
  assignments: ActorAssignment[];
}

export default function LineCountPanel({ play, lineCounts, actors, assignments }: Props) {
  const { total, byCharacter, byActor } = lineCounts;
  const pct = total.original > 0
    ? Math.round((1 - total.afterCut / total.original) * 100)
    : 0;

  // Unassigned characters (have lines, not assigned to any actor)
  const assignedCharIds = new Set(assignments.map((a) => a.characterId));
  const unassignedChars = play.castList.filter(
    (c) => !assignedCharIds.has(c.id) && (byCharacter[c.id]?.original ?? 0) > 0
  );

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
          </div>
          <div className="space-y-2">
            {actors.map((actor) => (
              <ActorRow
                key={actor.id}
                actor={actor}
                counts={byActor[actor.id] || { characters: [], original: 0, afterCut: 0 }}
                play={play}
              />
            ))}
          </div>
        </div>
      )}

      {/* By Character */}
      <div>
        <div className="text-xs font-semibold text-stone-400 uppercase tracking-wider mb-2">
          By Character
        </div>
        <div className="space-y-1">
          {play.castList
            .filter((c) => (byCharacter[c.id]?.original ?? 0) > 0)
            .sort(
              (a, b) =>
                (byCharacter[b.id]?.original ?? 0) - (byCharacter[a.id]?.original ?? 0)
            )
            .map((char) => {
              const assignment = assignments.find((a) => a.characterId === char.id);
              return (
                <CharacterRow
                  key={char.id}
                  character={char}
                  counts={byCharacter[char.id] || { original: 0, afterCut: 0 }}
                />
              );
            })}
          {unassignedChars.length > 0 && actors.length === 0 && null}
        </div>
      </div>
    </div>
  );
}
