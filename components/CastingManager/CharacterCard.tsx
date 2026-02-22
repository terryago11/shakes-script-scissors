import type { Character } from "@/types/play";
import type { Actor } from "@/types/project";

interface Props {
  character: Character;
  assignedActorId: string | null;
  actors: Actor[];
  onAssign: (actorId: string | null) => void;
}

export default function CharacterCard({ character, assignedActorId, actors, onAssign }: Props) {
  const assignedActor = actors.find((a) => a.id === assignedActorId) || null;

  return (
    <div className="border border-stone-200 rounded-lg bg-white px-4 py-3 flex items-center gap-3">
      {/* Actor color swatch */}
      <div
        className="w-3 h-3 rounded-full shrink-0 border border-stone-200"
        style={{ backgroundColor: assignedActor?.color || "#e5e7eb" }}
      />

      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-stone-700 truncate">
          {character.name}
        </div>
        {assignedActor && (
          <div className="text-xs text-stone-400">{assignedActor.name}</div>
        )}
      </div>

      <select
        value={assignedActorId || ""}
        onChange={(e) => onAssign(e.target.value || null)}
        className="text-xs border border-stone-300 rounded px-2 py-1 bg-white text-stone-600 focus:outline-none focus:ring-2 focus:ring-amber-400"
      >
        <option value="">Unassigned</option>
        {actors.map((actor) => (
          <option key={actor.id} value={actor.id}>
            {actor.name}
          </option>
        ))}
      </select>
    </div>
  );
}
