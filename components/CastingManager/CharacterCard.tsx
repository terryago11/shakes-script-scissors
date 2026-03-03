import type { Character } from "@/types/play";
import type { Actor } from "@/types/project";

interface Props {
  character: Character;
  assignedActorId: string | null;
  actors: Actor[];
  onAssign: (actorId: string | null) => void;
  conflictCount?: number;
  /** Actor IDs that would cause a doubling conflict with this character */
  conflictingActorIds?: Set<string>;
  /** When true, all speeches for this character are cut — grey out and disable assignment */
  isFullyCut?: boolean;
  /** Cut-only line count */
  lineCounts?: { original: number; afterCut: number };
  /** Cut-only word count */
  wordCounts?: { original: number; afterCut: number };
  /** Cut-only stage minutes */
  stageMinutes?: number;
}

function fmtMins(m: number): string {
  const r = Math.round(m);
  if (r < 60) return `${r}m`;
  return `${Math.floor(r / 60)}h ${r % 60}m`;
}

export default function CharacterCard({
  character,
  assignedActorId,
  actors,
  onAssign,
  conflictCount,
  conflictingActorIds,
  isFullyCut,
  lineCounts,
  wordCounts,
  stageMinutes,
}: Props) {
  const assignedActor = actors.find((a) => a.id === assignedActorId) || null;
  const assignmentConflicts =
    assignedActorId != null && (conflictingActorIds?.has(assignedActorId) ?? false);

  return (
    <div className={`border rounded-lg bg-white px-4 py-3 flex items-center gap-3 ${
      isFullyCut ? "border-stone-100 opacity-50" : "border-stone-200"
    }`}>
      {/* Actor color swatch */}
      <div
        className="w-3 h-3 rounded-full shrink-0 border border-stone-200"
        style={{ backgroundColor: assignedActor?.color || "#e5e7eb" }}
      />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className={`text-sm font-semibold truncate ${isFullyCut ? "text-stone-400 italic" : "text-stone-700"}`}>
            {character.name}
          </span>
          {isFullyCut && (
            <span className="text-xs text-stone-400 bg-stone-100 px-1.5 py-0.5 rounded font-normal shrink-0">
              fully cut
            </span>
          )}
          {!isFullyCut && (conflictCount ?? 0) > 0 && (
            <span
              className="text-xs text-amber-600 font-medium shrink-0"
              title={`${conflictCount} doubling conflict${conflictCount! > 1 ? "s" : ""} — this actor is on stage as two characters simultaneously`}
            >
              ⚠ {conflictCount}
            </span>
          )}
        </div>
        {assignedActor && (
          <div className="text-xs text-stone-400">{assignedActor.name}</div>
        )}
        {(lineCounts || wordCounts || stageMinutes != null) && !isFullyCut && (
          <div className="text-xs text-stone-400 tabular-nums mt-0.5 flex gap-2">
            {lineCounts && lineCounts.afterCut > 0 && (
              <span>{lineCounts.afterCut.toLocaleString()} lines</span>
            )}
            {wordCounts && wordCounts.afterCut > 0 && (
              <span>{wordCounts.afterCut.toLocaleString()} words</span>
            )}
            {stageMinutes != null && stageMinutes > 0.01 && (
              <span>{fmtMins(stageMinutes)}</span>
            )}
          </div>
        )}
      </div>

      <select
        value={assignedActorId || ""}
        onChange={(e) => onAssign(e.target.value || null)}
        disabled={isFullyCut}
        className={`text-xs border rounded px-2 py-1 bg-white focus:outline-none focus:ring-2 focus:ring-amber-400 disabled:cursor-not-allowed ${
          assignmentConflicts
            ? "border-amber-400 text-amber-700"
            : "border-stone-300 text-stone-600"
        }`}
      >
        <option value="">Unassigned</option>
        {actors.map((actor) => {
          const wouldConflict = conflictingActorIds?.has(actor.id) ?? false;
          return (
            <option key={actor.id} value={actor.id}>
              {wouldConflict ? "⚠ " : ""}{actor.name}
            </option>
          );
        })}
      </select>
    </div>
  );
}
