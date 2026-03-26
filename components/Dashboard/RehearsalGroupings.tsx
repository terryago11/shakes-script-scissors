"use client";

import type { Act, Play, Scene } from "@/types/play";
import type { Actor, ActorAssignment } from "@/types/project";
import { resolveCharacterName } from "@/lib/project/projectUtils";
import type { CharacterStageTime } from "@/lib/cuts/StageTimeEngine";
import type { LineCounts } from "@/types/cut";
import type { CharSceneData } from "./DashboardMatrix";

interface Props {
  play: Play;
  effectiveSceneOrder: string[];
  sceneById: Map<string, Scene>;
  sceneActMap: Map<string, Act>;
  actors: Actor[];
  assignments: ActorAssignment[];
  charSceneMatrix: Map<string, Map<string, CharSceneData>>;
  stageTimeByChar: Record<string, CharacterStageTime>;
  lineCounts: LineCounts;
  metric: "lines" | "words" | "time";
  wpm: number;
  /** Cut-level character display-name aliases */
  characterAliases?: Record<string, string>;
}

function fmtMins(m: number): string {
  if (m < 60) return `${Math.round(m)} min`;
  const h = Math.floor(m / 60);
  const rem = Math.round(m % 60);
  return rem > 0 ? `${h}h ${rem}m` : `${h}h`;
}

export default function RehearsalGroupings({
  play,
  effectiveSceneOrder,
  sceneById,
  sceneActMap,
  actors,
  assignments,
  charSceneMatrix,
  stageTimeByChar,
  lineCounts,
  metric,
  wpm,
  characterAliases,
}: Props) {
  const charToActor = new Map<string, string>();
  const actorToChars = new Map<string, string[]>();
  for (const a of assignments) {
    charToActor.set(a.characterId, a.actorId);
    if (!actorToChars.has(a.actorId)) actorToChars.set(a.actorId, []);
    actorToChars.get(a.actorId)!.push(a.characterId);
  }

  const charById = new Map(play.castList.map((c) => [c.id, c]));

  // For each actor, collect which scenes they appear in (via any of their characters)
  interface ActorSceneEntry {
    sceneId: string;
    value: number; // lines / words / time depending on metric
  }

  const actorScenes = new Map<string, ActorSceneEntry[]>();
  const actorTotals = new Map<string, number>();

  for (const actor of actors) {
    const entries: ActorSceneEntry[] = [];
    const charIds = actorToChars.get(actor.id) ?? [];

    for (const sceneId of effectiveSceneOrder) {
      let value = 0;
      for (const charId of charIds) {
        if (metric === "time") {
          const entry = stageTimeByChar[charId];
          value += entry?.scenes.find((s) => s.sceneId === sceneId)?.minutes ?? 0;
        } else {
          const data = charSceneMatrix.get(charId)?.get(sceneId);
          if (data) {
            value += metric === "words" ? data.wordsAfterCut : data.linesAfterCut;
          }
        }
      }
      if (value > 0) entries.push({ sceneId, value });
    }

    actorScenes.set(actor.id, entries);
    actorTotals.set(
      actor.id,
      entries.reduce((s, e) => s + e.value, 0)
    );
  }

  // ── Cluster-based rehearsal blocks (union-find) ──────────────────────────────
  // Build actor → scene set
  const actorSceneSet = new Map<string, Set<string>>();
  for (const actor of actors) {
    const scenes = new Set((actorScenes.get(actor.id) ?? []).map((e) => e.sceneId));
    actorSceneSet.set(actor.id, scenes);
  }

  const actorIds = actors.map((a) => a.id);

  // Union-find over actors
  const parent = new Map<string, string>(actorIds.map((id) => [id, id]));
  function find(x: string): string {
    if (parent.get(x) !== x) parent.set(x, find(parent.get(x)!));
    return parent.get(x)!;
  }
  function union(a: string, b: string) {
    const ra = find(a), rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  }

  // Merge actors who share ≥2 scenes
  for (let i = 0; i < actorIds.length; i++) {
    for (let j = i + 1; j < actorIds.length; j++) {
      const ai = actorIds[i], aj = actorIds[j];
      const si = actorSceneSet.get(ai) ?? new Set<string>();
      const shared = [...si].filter((s) => actorSceneSet.get(aj)?.has(s));
      if (shared.length >= 2) union(ai, aj);
    }
  }

  // Group actors by cluster root
  const clusterMap = new Map<string, string[]>();
  for (const id of actorIds) {
    const root = find(id);
    if (!clusterMap.has(root)) clusterMap.set(root, []);
    clusterMap.get(root)!.push(id);
  }

  interface RehearsalCluster {
    actorIds: string[];
    sceneIds: string[]; // in effectiveSceneOrder, deduplicated
    totalMinutes: number;
  }

  const clusters: RehearsalCluster[] = [];
  const sceneOrderIndex = new Map(effectiveSceneOrder.map((id, i) => [id, i]));

  for (const [, clusterActors] of clusterMap) {
    // Collect all scenes from any actor in this cluster
    const allScenes = new Set<string>();
    for (const aid of clusterActors) {
      for (const sid of actorSceneSet.get(aid) ?? []) allScenes.add(sid);
    }
    // Sort by effectiveSceneOrder
    const sortedScenes = [...allScenes].sort(
      (a, b) => (sceneOrderIndex.get(a) ?? 999) - (sceneOrderIndex.get(b) ?? 999)
    );
    if (sortedScenes.length < 2) continue;

    const totalMinutes = sortedScenes.reduce((sum, sid) => {
      const sc = lineCounts.byScene[sid];
      return sum + (sc ? sc.words.afterCut / wpm : 0);
    }, 0);

    clusters.push({ actorIds: clusterActors, sceneIds: sortedScenes, totalMinutes });
  }

  // Sort clusters by scene count descending
  clusters.sort((a, b) => b.sceneIds.length - a.sceneIds.length);

  const multiBlocks = clusters;

  return (
    <div className="flex gap-10 items-start">
      {/* By Actor */}
      <section className="flex-1 min-w-0">
        <h2 className="text-xs font-semibold text-stone-400 dark:text-stone-400 uppercase tracking-wider mb-4">
          By Actor
        </h2>
        {actors.length === 0 ? (
          <p className="text-sm text-stone-400 dark:text-stone-400">No actors assigned yet.</p>
        ) : (
          <div className="space-y-6">
            {actors.map((actor) => {
              const entries = actorScenes.get(actor.id) ?? [];
              const total = actorTotals.get(actor.id) ?? 0;
              if (entries.length === 0) return null;

              const charIds = actorToChars.get(actor.id) ?? [];

              return (
                <div key={actor.id}>
                  <div className="flex items-center gap-2 mb-2">
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: actor.color }}
                    />
                    <span className="font-semibold text-stone-700 dark:text-stone-200 text-sm">{actor.name}</span>
                    <span className="text-xs text-stone-400 dark:text-stone-400 ml-auto tabular-nums">
                      {entries.length} scenes ·{" "}
                      {metric === "time"
                        ? fmtMins(total)
                        : total.toLocaleString() + (metric === "words" ? " words" : " lines")}
                    </span>
                  </div>

                  {/* Character breakdown */}
                  <div className="text-xs text-stone-400 dark:text-stone-400 mb-2 pl-4">
                    {charIds
                      .map((cid) => resolveCharacterName(cid, characterAliases, play.castList))
                      .join(" / ")}
                  </div>

                  {/* Scene list */}
                  <div className="pl-4 space-y-1">
                    {entries.map(({ sceneId, value }) => {
                      const scene = sceneById.get(sceneId);
                      const act = sceneActMap.get(sceneId);
                      if (!scene || !act) return null;
                      return (
                        <div
                          key={sceneId}
                          className="flex items-center gap-2 text-xs text-stone-600 dark:text-stone-300"
                        >
                          <span className="text-stone-400 dark:text-stone-400 shrink-0 w-16 truncate">
                            {act.title}
                          </span>
                          <span className="flex-1 truncate">{scene.title}</span>
                          <span
                            className="tabular-nums font-medium px-1.5 py-0.5 rounded text-xs shrink-0"
                            style={{
                              backgroundColor: actor.color + "20",
                              color: actor.color,
                            }}
                          >
                            {metric === "time"
                              ? fmtMins(value)
                              : value.toLocaleString()}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Rehearsal Blocks */}
      {multiBlocks.length > 0 && (
        <section className="flex-1 min-w-0">
          <h2 className="text-xs font-semibold text-stone-400 dark:text-stone-400 uppercase tracking-wider mb-1">
            Suggested Rehearsal Blocks
          </h2>
          <p className="text-xs text-stone-400 dark:text-stone-400 mb-4">
            Actors sharing ≥2 scenes — call them together even if scenes aren't consecutive.
          </p>
          <div className="space-y-4">
            {multiBlocks.map((cluster, idx) => {
              const blockActors = actors.filter((a) => cluster.actorIds.includes(a.id));
              // Cluster name: actor names joined, truncated if many
              const nameList = blockActors.map((a) => a.name);
              const clusterName = nameList.length > 4
                ? `${nameList.slice(0, 3).join(" / ")} + ${nameList.length - 3} more`
                : nameList.join(" / ");

              return (
                <div
                  key={idx}
                  className="border border-stone-200 dark:border-stone-700 rounded-lg p-4"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="min-w-0 mr-3">
                      <div className="text-sm font-medium text-stone-700 dark:text-stone-200 truncate">
                        {clusterName}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-sm font-semibold text-stone-700 dark:text-stone-200 tabular-nums">
                        {fmtMins(cluster.totalMinutes)}
                      </div>
                      <div className="text-xs text-stone-400 dark:text-stone-400">
                        {cluster.sceneIds.length} scenes
                      </div>
                    </div>
                  </div>

                  {/* Actor chips */}
                  <div className="flex flex-wrap gap-1 mb-3">
                    {blockActors.map((actor) => (
                      <span
                        key={actor.id}
                        className="text-xs px-2 py-0.5 rounded-full border font-medium"
                        style={{
                          borderColor: actor.color + "60",
                          backgroundColor: actor.color + "18",
                          color: actor.color,
                        }}
                      >
                        {actor.name}
                      </span>
                    ))}
                  </div>

                  {/* Scene list with gap indicators */}
                  <div className="space-y-0.5">
                    {cluster.sceneIds.map((sceneId, sIdx) => {
                      const scene = sceneById.get(sceneId);
                      const act = sceneActMap.get(sceneId);
                      if (!scene || !act) return null;
                      const sc = lineCounts.byScene[sceneId];
                      const sceneMins = sc ? sc.words.afterCut / wpm : 0;

                      // Check if there's a gap before this scene in the effective order
                      const prevSceneId = cluster.sceneIds[sIdx - 1];
                      const prevIdx = prevSceneId != null ? (sceneOrderIndex.get(prevSceneId) ?? -1) : -1;
                      const curIdx = sceneOrderIndex.get(sceneId) ?? -1;
                      const hasGap = sIdx > 0 && curIdx - prevIdx > 1;

                      return (
                        <div key={sceneId}>
                          {hasGap && (
                            <div className="text-stone-300 dark:text-stone-600 text-xs text-center py-0.5">
                              ···
                            </div>
                          )}
                          <div className="flex items-center gap-2 text-xs text-stone-500 dark:text-stone-400">
                            <span className="w-1.5 h-1.5 rounded-full bg-stone-200 dark:bg-stone-700 shrink-0" />
                            <span className="text-stone-400 dark:text-stone-400 shrink-0">{act.title}</span>
                            <span className="flex-1 truncate">{scene.title}</span>
                            <span className="tabular-nums text-stone-400 dark:text-stone-400 shrink-0">
                              {fmtMins(sceneMins)}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
