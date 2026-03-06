import { useState } from "react";
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
  /** Current display-name alias for this character (cut-level) */
  alias?: string;
  /** Called when the user sets or clears a display-name alias */
  onSetAlias?: (alias: string | null) => void;
  /** IDs of characters that are explicitly linked to this one (must share an actor) */
  linkedCharIds?: Set<string>;
  /** All active (non-fully-cut) characters available for linking, with resolved display names */
  allActiveChars?: Array<{ id: string; name: string }>;
  /** Called to toggle a character link — adds if absent, removes if present */
  onToggleLink?: (otherId: string) => void;
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
  alias,
  onSetAlias,
  linkedCharIds,
  allActiveChars,
  onToggleLink,
}: Props) {
  const [editingAlias, setEditingAlias] = useState(false);
  const [aliasInput, setAliasInput] = useState("");
  const [showLinkSelect, setShowLinkSelect] = useState(false);

  const assignedActor = actors.find((a) => a.id === assignedActorId) || null;
  const assignmentConflicts =
    assignedActorId != null && (conflictingActorIds?.has(assignedActorId) ?? false);

  const displayName = alias || character.name;

  function startEdit() {
    setAliasInput(alias || character.name);
    setEditingAlias(true);
  }

  function commitEdit() {
    const trimmed = aliasInput.trim();
    if (trimmed && trimmed !== character.name) {
      onSetAlias?.(trimmed);
    } else {
      onSetAlias?.(null);
    }
    setEditingAlias(false);
  }

  return (
    <div className={`border rounded-lg bg-white dark:bg-stone-900 px-4 py-3 flex items-center gap-3 ${
      isFullyCut ? "border-stone-100 dark:border-stone-800 opacity-50" : "border-stone-200 dark:border-stone-700"
    }`}>
      {/* Actor color swatch */}
      <div
        className="w-3 h-3 rounded-full shrink-0 border border-stone-200 dark:border-stone-700"
        style={{ backgroundColor: assignedActor?.color || "#e5e7eb" }}
      />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          {editingAlias ? (
            <input
              autoFocus
              type="text"
              value={aliasInput}
              onChange={(e) => setAliasInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitEdit();
                else if (e.key === "Escape") setEditingAlias(false);
              }}
              onBlur={commitEdit}
              className="text-sm font-semibold text-stone-700 dark:text-stone-200 bg-transparent border-b border-amber-400 focus:outline-none w-32"
            />
          ) : (
            <span
              className={`group/name flex items-center gap-1 text-sm font-semibold truncate ${
                isFullyCut ? "text-stone-400 dark:text-stone-500 italic" : "text-stone-700 dark:text-stone-200"
              }`}
            >
              <span
                className={onSetAlias ? "cursor-text hover:text-stone-900 dark:hover:text-stone-100" : ""}
                title={onSetAlias ? "Click to rename" : undefined}
                onClick={onSetAlias && !isFullyCut ? startEdit : undefined}
              >
                {displayName}
              </span>
              {onSetAlias && !isFullyCut && (
                <span
                  className="text-stone-300 dark:text-stone-600 opacity-0 group-hover/name:opacity-100 transition-opacity text-xs select-none"
                  aria-hidden
                >
                  ✎
                </span>
              )}
            </span>
          )}
          {alias && !editingAlias && (
            <span className="text-xs text-stone-400 dark:text-stone-500 italic truncate shrink-0" title={`TEI: ${character.name}`}>
              ({character.name})
            </span>
          )}
          {isFullyCut && (
            <span className="text-xs text-stone-400 dark:text-stone-500 bg-stone-100 dark:bg-stone-800 px-1.5 py-0.5 rounded font-normal shrink-0">
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
          <div className="text-xs text-stone-400 dark:text-stone-500">{assignedActor.name}</div>
        )}
        {(lineCounts || wordCounts || stageMinutes != null) && !isFullyCut && (
          <div className="text-xs text-stone-400 dark:text-stone-500 tabular-nums mt-0.5 flex gap-2">
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

        {/* Character links — "must share an actor" pins for the Suggest algorithm */}
        {onToggleLink && !isFullyCut && (
          <div className="mt-1.5 flex flex-wrap gap-1 items-center">
            {linkedCharIds && [...linkedCharIds].map((id) => {
              const linkedName = allActiveChars?.find((c) => c.id === id)?.name ?? id;
              return (
                <span
                  key={id}
                  className="inline-flex items-center gap-0.5 text-xs bg-sky-50 dark:bg-sky-950/50 text-sky-600 dark:text-sky-400 border border-sky-200 dark:border-sky-800 rounded-full px-2 py-0.5"
                >
                  🔗 {linkedName}
                  <button
                    onClick={() => onToggleLink(id)}
                    className="text-sky-400 dark:text-sky-500 hover:text-sky-700 dark:hover:text-sky-300 leading-none ml-0.5"
                    title={`Remove link with ${linkedName}`}
                  >
                    ×
                  </button>
                </span>
              );
            })}
            {showLinkSelect ? (
              <select
                autoFocus
                defaultValue=""
                onChange={(e) => {
                  if (e.target.value) onToggleLink(e.target.value);
                  setShowLinkSelect(false);
                }}
                onBlur={() => setShowLinkSelect(false)}
                className="text-xs border border-stone-300 dark:border-stone-600 rounded px-1.5 py-0.5 bg-white dark:bg-stone-800 text-stone-600 dark:text-stone-300 focus:outline-none focus:ring-1 focus:ring-amber-400"
              >
                <option value="" disabled>Link with…</option>
                {allActiveChars
                  ?.filter((c) => c.id !== character.id && !linkedCharIds?.has(c.id))
                  .map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
              </select>
            ) : (
              <button
                onClick={() => setShowLinkSelect(true)}
                className="text-xs text-stone-300 dark:text-stone-600 hover:text-stone-500 dark:hover:text-stone-400 transition-colors"
                title="Pin this character to always share an actor with another (used by Suggest)"
              >
                + link
              </button>
            )}
          </div>
        )}
      </div>

      <select
        value={assignedActorId || ""}
        onChange={(e) => onAssign(e.target.value || null)}
        disabled={isFullyCut}
        className={`text-xs border rounded px-2 py-1 bg-white dark:bg-stone-800 focus:outline-none focus:ring-2 focus:ring-amber-400 disabled:cursor-not-allowed ${
          assignmentConflicts
            ? "border-amber-400 text-amber-700 dark:text-amber-400"
            : "border-stone-300 dark:border-stone-600 text-stone-600 dark:text-stone-300"
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
