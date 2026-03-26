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
  /** Minimum total minutes for a suggested block (default 5) */
  minBlockMinutes?: number;
  /** Maximum total minutes for a suggested block (default 60) */
  maxBlockMinutes?: number;
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
  minBlockMinutes = 5,
  maxBlockMinutes = 60,
}: Props) {
  const charToActor = new Map<string, string>();
  const actorToChars = new Map<string, string[]>();
  for (const a of assignments) {
    charToActor.set(a.characterId, a.actorId);
    if (!actorToChars.has(a.actorId)) actorToChars.set(a.actorId, []);
    actorToChars.get(a.actorId)!.push(a.characterId);
  }

  // ── By Actor section ─────────────────────────────────────────────────────────
  interface ActorSceneEntry {
    sceneId: string;
    value: number;
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
    actorTotals.set(actor.id, entries.reduce((s, e) => s + e.value, 0));
  }

  // ── Complete-linkage scene clustering ────────────────────────────────────────
  // Build sceneCharSet: characters with >0 lines afterCut in each scene
  const sceneCharSet = new Map<string, Set<string>>();
  for (const sceneId of effectiveSceneOrder) {
    const chars = new Set<string>();
    for (const [charId, sceneMap] of charSceneMatrix) {
      const data = sceneMap.get(sceneId);
      if (data && data.linesAfterCut > 0) chars.add(charId);
    }
    sceneCharSet.set(sceneId, chars);
  }

  // Jaccard similarity between two scenes by character overlap
  function jaccard(a: Set<string>, b: Set<string>): number {
    if (a.size === 0 && b.size === 0) return 0;
    let inter = 0;
    for (const c of a) if (b.has(c)) inter++;
    const union = a.size + b.size - inter;
    return union === 0 ? 0 : inter / union;
  }

  // Precompute pairwise similarity
  const simCache = new Map<string, number>();
  function getSim(a: string, b: string): number {
    const key = a < b ? `${a}|${b}` : `${b}|${a}`;
    if (!simCache.has(key)) {
      simCache.set(key, jaccard(sceneCharSet.get(a) ?? new Set(), sceneCharSet.get(b) ?? new Set()));
    }
    return simCache.get(key)!;
  }

  // Complete-linkage: cluster similarity = minimum pairwise Jaccard across clusters
  const JACCARD_THRESHOLD = 0.33;

  type SceneCluster = { sceneIds: string[] };
  let sceneClusters: SceneCluster[] = effectiveSceneOrder.map((id) => ({ sceneIds: [id] }));

  function clusterSim(c1: SceneCluster, c2: SceneCluster): number {
    let minSim = 1;
    for (const a of c1.sceneIds) {
      for (const b of c2.sceneIds) {
        const s = getSim(a, b);
        if (s < minSim) minSim = s;
      }
    }
    return minSim;
  }

  // Greedy agglomeration
  while (sceneClusters.length > 1) {
    let bestSim = -1;
    let bestI = -1, bestJ = -1;
    for (let i = 0; i < sceneClusters.length; i++) {
      for (let j = i + 1; j < sceneClusters.length; j++) {
        const sim = clusterSim(sceneClusters[i], sceneClusters[j]);
        if (sim > bestSim) { bestSim = sim; bestI = i; bestJ = j; }
      }
    }
    if (bestSim < JACCARD_THRESHOLD) break;
    sceneClusters[bestI] = {
      sceneIds: [...sceneClusters[bestI].sceneIds, ...sceneClusters[bestJ].sceneIds],
    };
    sceneClusters.splice(bestJ, 1);
  }

  // Sort scenes within each cluster by effectiveSceneOrder
  const sceneOrderIndex = new Map(effectiveSceneOrder.map((id, i) => [id, i]));
  for (const c of sceneClusters) {
    c.sceneIds.sort((a, b) => (sceneOrderIndex.get(a) ?? 999) - (sceneOrderIndex.get(b) ?? 999));
  }

  function clusterMinutes(ids: string[]): number {
    return ids.reduce((sum, sid) => {
      const sc = lineCounts.byScene[sid];
      return sum + (sc ? sc.words.afterCut / wpm : 0);
    }, 0);
  }

  interface RehearsalBlock {
    sceneIds: string[];
    totalMinutes: number;
  }

  const blocks: RehearsalBlock[] = [];

  for (const cluster of sceneClusters) {
    if (cluster.sceneIds.length < 2) continue;
    const totalMins = clusterMinutes(cluster.sceneIds);
    if (totalMins < minBlockMinutes) continue;

    if (totalMins <= maxBlockMinutes) {
      blocks.push({ sceneIds: cluster.sceneIds, totalMinutes: totalMins });
    } else {
      // Split into sub-blocks, each ≤ maxBlockMinutes
      let current: string[] = [];
      let currentMins = 0;
      for (const sid of cluster.sceneIds) {
        const sceneMins = (lineCounts.byScene[sid]?.words.afterCut ?? 0) / wpm;
        if (current.length >= 2 && currentMins + sceneMins > maxBlockMinutes) {
          blocks.push({ sceneIds: current, totalMinutes: currentMins });
          current = [sid];
          currentMins = sceneMins;
        } else {
          current.push(sid);
          currentMins += sceneMins;
        }
      }
      if (current.length >= 2 && currentMins >= minBlockMinutes) {
        blocks.push({ sceneIds: current, totalMinutes: currentMins });
      }
    }
  }

  // Sort by scene count descending
  blocks.sort((a, b) => b.sceneIds.length - a.sceneIds.length);

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

      {/* Suggested Rehearsal Blocks */}
      {blocks.length > 0 && (
        <section className="flex-1 min-w-0">
          <h2 className="text-xs font-semibold text-stone-400 dark:text-stone-400 uppercase tracking-wider mb-1">
            Suggested Rehearsal Blocks
          </h2>
          <p className="text-xs text-stone-400 dark:text-stone-400 mb-4">
            Scenes grouped by shared cast — call them together even if not consecutive.
          </p>
          <div className="space-y-4">
            {blocks.map((block, idx) => {
              // Identify which actors appear in this block
              const blockCharIds = new Set<string>();
              for (const sid of block.sceneIds) {
                for (const [charId, sceneMap] of charSceneMatrix) {
                  const data = sceneMap.get(sid);
                  if (data && data.linesAfterCut > 0) blockCharIds.add(charId);
                }
              }
              const blockActors = actors.filter((a) =>
                (actorToChars.get(a.id) ?? []).some((cid) => blockCharIds.has(cid))
              );

              return (
                <div
                  key={idx}
                  className="border border-stone-200 dark:border-stone-700 rounded-lg p-4"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="min-w-0 mr-3">
                      <div className="text-sm font-medium text-stone-700 dark:text-stone-200">
                        Block {idx + 1}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-sm font-semibold text-stone-700 dark:text-stone-200 tabular-nums">
                        {fmtMins(block.totalMinutes)}
                      </div>
                      <div className="text-xs text-stone-400 dark:text-stone-400">
                        {block.sceneIds.length} scenes
                      </div>
                    </div>
                  </div>

                  {/* Actor chips — only when actors are assigned */}
                  {blockActors.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-3">
                      {blockActors.map((actor) => {
                        const blockCharNames = (actorToChars.get(actor.id) ?? [])
                          .filter((cid) => blockCharIds.has(cid))
                          .map((cid) => resolveCharacterName(cid, characterAliases, play.castList));
                        return (
                          <span
                            key={actor.id}
                            className="text-xs px-2 py-1 rounded-lg border font-medium flex flex-col items-center leading-tight"
                            style={{
                              borderColor: actor.color + "60",
                              backgroundColor: actor.color + "18",
                              color: actor.color,
                            }}
                          >
                            <span>{actor.name}</span>
                            {blockCharNames.length > 0 && (
                              <span className="font-normal text-[10px] opacity-70">
                                {blockCharNames.join(" / ")}
                              </span>
                            )}
                          </span>
                        );
                      })}
                    </div>
                  )}

                  {/* Scene list with gap indicators */}
                  <div className="space-y-0.5">
                    {block.sceneIds.map((sceneId, sIdx) => {
                      const scene = sceneById.get(sceneId);
                      const act = sceneActMap.get(sceneId);
                      if (!scene || !act) return null;
                      const sc = lineCounts.byScene[sceneId];
                      const sceneMins = sc ? sc.words.afterCut / wpm : 0;

                      const prevSceneId = block.sceneIds[sIdx - 1];
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

      {blocks.length === 0 && (
        <section className="flex-1 min-w-0">
          <h2 className="text-xs font-semibold text-stone-400 dark:text-stone-400 uppercase tracking-wider mb-1">
            Suggested Rehearsal Blocks
          </h2>
          <p className="text-sm text-stone-400 dark:text-stone-400">
            No blocks found. Try adjusting the min/max duration in Settings.
          </p>
        </section>
      )}
    </div>
  );
}
