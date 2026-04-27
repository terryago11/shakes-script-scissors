import { useState } from "react";
import Link from "next/link";
import type { Character } from "@/types/play";
import type { Actor } from "@/types/project";

export interface CompatEntry {
  charId: string;
  charName: string;
  status: "ok" | "conflict";
  reason?: string;
  /** True if this character is already assigned to the same actor */
  assigned: boolean;
}

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
  /** Characters the assigned actor could/couldn't also play */
  compatibilityList?: CompatEntry[];
  /** Whether any "must double" linked character is assigned to a different actor */
  hasLinkViolation?: boolean;
  /** For fully-cut characters: count of non-cut SDs still mentioning them */
  sdRemnantCount?: number;
  /** Project ID for the integrity link */
  projectId?: string;
  /** When true, all editing controls (assign select, alias, links) are disabled */
  readOnly?: boolean;
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
  compatibilityList,
  hasLinkViolation,
  sdRemnantCount,
  projectId,
  readOnly,
}: Props) {
  const [editingAlias, setEditingAlias] = useState(false);
  const [aliasInput, setAliasInput] = useState("");
  const [showLinkSelect, setShowLinkSelect] = useState(false);
  const [showCompat, setShowCompat] = useState(false);

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

  const compatSiblings = compatibilityList?.filter((e) => e.assigned) ?? [];
  const compatOk = compatibilityList?.filter((e) => !e.assigned && e.status === "ok") ?? [];
  const compatConflict = compatibilityList?.filter((e) => !e.assigned && e.status === "conflict") ?? [];

  return (
    <div className={`border rounded-lg bg-white dark:bg-stone-900 px-4 py-3 flex items-start gap-3 ${
      isFullyCut ? "border-stone-100 dark:border-stone-800 opacity-50" : "border-stone-200 dark:border-stone-700"
    }`}>
      {/* Actor color swatch */}
      <div
        className="w-3 h-3 rounded-full shrink-0 border border-stone-200 dark:border-stone-700 mt-0.5"
        style={{ backgroundColor: assignedActor?.color || "#e5e7eb" }}
      />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
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
                isFullyCut ? "text-stone-400 dark:text-stone-400 italic" : "text-stone-700 dark:text-stone-200"
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
            <span className="text-xs text-stone-400 dark:text-stone-400 italic truncate shrink-0" title={`TEI: ${character.name}`}>
              ({character.name})
            </span>
          )}
          {isFullyCut && (
            <span className="text-xs text-stone-400 dark:text-stone-400 bg-stone-100 dark:bg-stone-800 px-1.5 py-0.5 rounded font-normal shrink-0">
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
          {!isFullyCut && hasLinkViolation && (
            <span
              className="text-xs text-amber-600 font-medium shrink-0"
              title="Must-double conflict — linked characters are assigned to different actors"
            >
              ⚠ must-double conflict
            </span>
          )}
        </div>
        {assignedActor && (
          <div className="text-xs text-stone-400 dark:text-stone-400">{assignedActor.name}</div>
        )}
        {(lineCounts || wordCounts || stageMinutes != null) && !isFullyCut && (
          <div className="text-xs text-stone-400 dark:text-stone-400 tabular-nums mt-0.5 flex flex-wrap gap-x-2 items-center">
            {lineCounts && lineCounts.afterCut > 0 && (
              <span className="flex items-center gap-0.5">
                {lineCounts.afterCut.toLocaleString()} lines
                <span className="relative group/linetip">
                  <span className="text-[9px] opacity-40 cursor-help border border-current rounded-full w-3 h-3 inline-flex items-center justify-center leading-none ml-0.5">?</span>
                  <span className="absolute bottom-full left-0 mb-1 hidden group-hover/linetip:block w-48 max-w-[min(12rem,calc(100vw-1rem))] bg-stone-800 text-white text-[10px] leading-snug rounded px-2 py-1.5 whitespace-normal z-50 shadow-lg pointer-events-none text-left font-normal normal-case tracking-normal">
                    Each kept line counts as 1. Partial lines (e.g. half-lines shared between characters) each count as 1 full line.
                  </span>
                </span>
              </span>
            )}
            {wordCounts && wordCounts.afterCut > 0 && (
              <span>{wordCounts.afterCut.toLocaleString()} words</span>
            )}
            {stageMinutes != null && stageMinutes > 0.01 && (
              <span>{fmtMins(stageMinutes)}</span>
            )}
          </div>
        )}

        {/* Must-double links — characters pinned to always share an actor */}
        {onToggleLink && !isFullyCut && (
          <div className="mt-1.5 flex flex-wrap gap-1 items-center">
            {linkedCharIds && [...linkedCharIds].map((id) => {
              const linkedName = allActiveChars?.find((c) => c.id === id)?.name ?? id;
              return (
                <span
                  key={id}
                  className="inline-flex items-center gap-0.5 text-xs bg-sky-50 dark:bg-sky-950/50 text-sky-600 dark:text-sky-400 border border-sky-200 dark:border-sky-800 rounded-full px-2 py-0.5"
                >
                  = {linkedName}
                  <button
                    onClick={() => onToggleLink(id)}
                    className="text-sky-400 dark:text-sky-500 hover:text-sky-700 dark:hover:text-sky-300 leading-none ml-0.5"
                    title={`Remove "must double" with ${linkedName}`}
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
                <option value="" disabled>Must double with…</option>
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
                + must double
              </button>
            )}
          </div>
        )}

        {/* Compatibility list — who else can this actor play? */}
        {compatibilityList && !isFullyCut && assignedActorId && (
          <div className="mt-1.5">
            <button
              onClick={() => setShowCompat((v) => !v)}
              className="text-xs text-stone-400 dark:text-stone-500 hover:text-stone-600 dark:hover:text-stone-300 transition-colors flex items-center gap-0.5"
            >
              <span>{showCompat ? "▾" : "▸"}</span>
              <span>
                {assignedActor?.name ?? "Actor"} can also play
                {!showCompat && ` (${compatOk.length} ✓, ${compatConflict.length} ✗)`}
              </span>
            </button>
            {showCompat && (
              <div className="mt-1 space-y-0.5 max-h-40 overflow-y-auto pr-1">
                {compatSiblings.length > 0 && (
                  <>
                    <div className="text-[10px] text-stone-400 dark:text-stone-500 font-medium uppercase tracking-wider mt-1 mb-0.5">
                      Also plays
                    </div>
                    {compatSiblings.map((e) => (
                      <div key={e.charId} className="text-xs text-stone-500 dark:text-stone-400 flex gap-1 items-start">
                        <span className="text-stone-400 dark:text-stone-500 shrink-0">↔</span>
                        <span>{e.charName}</span>
                      </div>
                    ))}
                  </>
                )}
                {compatOk.length > 0 && (
                  <>
                    <div className="text-[10px] text-stone-400 dark:text-stone-500 font-medium uppercase tracking-wider mt-1.5 mb-0.5">
                      Compatible
                    </div>
                    {compatOk.map((e) => (
                      <div key={e.charId} className="text-xs text-green-700 dark:text-green-400 flex gap-1 items-start">
                        <span className="shrink-0">✓</span>
                        <span>{e.charName}</span>
                      </div>
                    ))}
                  </>
                )}
                {compatConflict.length > 0 && (
                  <>
                    <div className="text-[10px] text-stone-400 dark:text-stone-500 font-medium uppercase tracking-wider mt-1.5 mb-0.5">
                      Conflicts
                    </div>
                    {compatConflict.map((e) => (
                      <div key={e.charId} className="text-xs text-amber-700 dark:text-amber-400 flex gap-1 items-start">
                        <span className="shrink-0">⚠</span>
                        <span>
                          {e.charName}
                          {e.reason && <span className="text-stone-400 dark:text-stone-500 ml-1">— {e.reason}</span>}
                        </span>
                      </div>
                    ))}
                  </>
                )}
                {compatibilityList.length === 0 && (
                  <div className="text-xs text-stone-400 dark:text-stone-500 italic">
                    No other characters to compare.
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Integrity link for fully-cut characters that still appear in stage directions */}
        {isFullyCut && sdRemnantCount && sdRemnantCount > 0 && projectId && (
          <Link
            href={`/projects/${projectId}/dashboard?tab=integrity`}
            className="mt-1.5 text-xs text-amber-600 dark:text-amber-400 hover:text-amber-800 dark:hover:text-amber-200 flex items-center gap-0.5"
          >
            <span>⚠</span>
            <span className="underline decoration-dotted">
              Still in {sdRemnantCount} stage direction{sdRemnantCount > 1 ? "s" : ""} — view in Integrity
            </span>
          </Link>
        )}
      </div>

      <select
        value={assignedActorId || ""}
        onChange={(e) => onAssign(e.target.value || null)}
        disabled={isFullyCut || readOnly}
        title={readOnly && !isFullyCut ? "Turn on Audition Mode to edit casting" : undefined}
        className={`text-xs border rounded px-2 py-1 bg-white dark:bg-stone-800 focus:outline-none focus:ring-2 focus:ring-amber-400 disabled:cursor-not-allowed shrink-0 ${
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
