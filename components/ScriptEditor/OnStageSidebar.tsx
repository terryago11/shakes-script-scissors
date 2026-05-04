"use client";

import { useMemo } from "react";
import type { Play } from "@/types/play";
import type { Cut, Actor, ActorAssignment } from "@/types/project";
import { resolveCharacterName } from "@/lib/project/projectUtils";

interface Props {
  play: Play;
  activeCut: Cut;
  onStageByScene: Map<string, Set<string>>;
  activeSceneId: string | null;
  actors: Actor[];
  assignments: ActorAssignment[];
  characterAliases?: Record<string, string>;
}

export default function OnStageSidebar({
  play,
  onStageByScene,
  activeSceneId,
  actors,
  assignments,
  characterAliases,
}: Props) {
  const actorById = useMemo(() => new Map(actors.map((a) => [a.id, a])), [actors]);
  const charToActor = useMemo(() => new Map(assignments.map((a) => [a.characterId, a.actorId])), [assignments]);
  const allScenes = useMemo(() => play.acts.flatMap((act) => act.scenes), [play.acts]);

  const activeScene = activeSceneId
    ? allScenes.find((s) => s.id === activeSceneId)
    : null;

  const onStageSet = activeSceneId
    ? (onStageByScene.get(activeSceneId) ?? new Set<string>())
    : new Set<string>();

  const charIds = [...onStageSet].sort((a, b) => {
    // Sort by actor assignment first (assigned chars first), then by name
    const aHasActor = charToActor.has(a) ? 0 : 1;
    const bHasActor = charToActor.has(b) ? 0 : 1;
    if (aHasActor !== bHasActor) return aHasActor - bHasActor;
    const aName = resolveCharacterName(a, characterAliases, play.castList);
    const bName = resolveCharacterName(b, characterAliases, play.castList);
    return aName.localeCompare(bName);
  });

  return (
    <div className="p-3">
      <div className="mb-3">
        <p className="text-xs font-semibold text-stone-500 dark:text-stone-400 uppercase tracking-wide">
          On Stage
        </p>
        {activeScene && (
          <p className="text-xs text-stone-400 dark:text-stone-500 mt-0.5 truncate" title={activeScene.title}>
            {activeScene.title || "Scene"}
          </p>
        )}
      </div>

      {!activeSceneId && (
        <p className="text-xs text-stone-400 dark:text-stone-500 italic">
          Scroll to a scene to see who&apos;s on stage.
        </p>
      )}

      {activeSceneId && charIds.length === 0 && (
        <p className="text-xs text-stone-400 dark:text-stone-500 italic">
          No characters on stage.
        </p>
      )}

      <div className="space-y-2">
        {charIds.map((charId) => {
          const actorId = charToActor.get(charId);
          const actor = actorId ? actorById.get(actorId) : undefined;
          const charName = resolveCharacterName(charId, characterAliases, play.castList);

          return (
            <div key={charId} className="flex items-start gap-2">
              <span
                className="mt-0.5 w-2.5 h-2.5 rounded-full shrink-0"
                style={{ backgroundColor: actor?.color ?? "#94a3b8" }}
              />
              <div className="min-w-0">
                <p className="text-xs font-medium text-stone-700 dark:text-stone-300 truncate">
                  {charName}
                </p>
                {actor && (
                  <p className="text-xs text-stone-400 dark:text-stone-500 truncate">
                    {actor.name}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
