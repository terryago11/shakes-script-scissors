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

  // Rehearsal blocks: consecutive scenes that share at least one actor
  // Build scene → actor set map
  const sceneActors = new Map<string, Set<string>>();
  for (const sceneId of effectiveSceneOrder) {
    const present = new Set<string>();
    for (const actor of actors) {
      const entries = actorScenes.get(actor.id) ?? [];
      if (entries.some((e) => e.sceneId === sceneId)) present.add(actor.id);
    }
    sceneActors.set(sceneId, present);
  }

  // Group consecutive scenes sharing actors into "blocks"
  interface RehearsalBlock {
    sceneIds: string[];
    actorIds: Set<string>;
    totalMinutes: number;
    totalValue: number;
  }

  const blocks: RehearsalBlock[] = [];
  let currentBlock: RehearsalBlock | null = null;

  for (const sceneId of effectiveSceneOrder) {
    const present = sceneActors.get(sceneId) ?? new Set();
    if (present.size === 0) {
      // No actors in scene — start fresh
      currentBlock = null;
      continue;
    }

    const sceneMins = (() => {
      const sc = lineCounts.byScene[sceneId];
      return sc ? sc.words.afterCut / wpm : 0;
    })();
    const sceneVal = (() => {
      const sc = lineCounts.byScene[sceneId];
      if (!sc) return 0;
      return metric === "time"
        ? sc.words.afterCut / wpm
        : metric === "words"
        ? sc.words.afterCut
        : sc.lines.afterCut;
    })();

    if (!currentBlock) {
      currentBlock = {
        sceneIds: [sceneId],
        actorIds: new Set(present),
        totalMinutes: sceneMins,
        totalValue: sceneVal,
      };
      blocks.push(currentBlock);
    } else {
      // Check overlap with current block actors
      const overlap = [...present].some((aid) => currentBlock!.actorIds.has(aid));
      if (overlap) {
        currentBlock.sceneIds.push(sceneId);
        for (const aid of present) currentBlock.actorIds.add(aid);
        currentBlock.totalMinutes += sceneMins;
        currentBlock.totalValue += sceneVal;
      } else {
        // No overlap — start a new block
        currentBlock = {
          sceneIds: [sceneId],
          actorIds: new Set(present),
          totalMinutes: sceneMins,
          totalValue: sceneVal,
        };
        blocks.push(currentBlock);
      }
    }
  }

  // Filter to multi-scene blocks (single scenes aren't really "rehearsal blocks")
  const multiBlocks = blocks.filter((b) => b.sceneIds.length > 1);

  return (
    <div className="flex gap-10 items-start">
      {/* By Actor */}
      <section className="flex-1 min-w-0">
        <h2 className="text-xs font-semibold text-stone-400 uppercase tracking-wider mb-4">
          By Actor
        </h2>
        {actors.length === 0 ? (
          <p className="text-sm text-stone-400">No actors assigned yet.</p>
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
                    <span className="font-semibold text-stone-700 text-sm">{actor.name}</span>
                    <span className="text-xs text-stone-400 ml-auto tabular-nums">
                      {entries.length} scenes ·{" "}
                      {metric === "time"
                        ? fmtMins(total)
                        : total.toLocaleString() + (metric === "words" ? " words" : " lines")}
                    </span>
                  </div>

                  {/* Character breakdown */}
                  <div className="text-xs text-stone-400 mb-2 pl-4">
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
                          className="flex items-center gap-2 text-xs text-stone-600"
                        >
                          <span className="text-stone-400 shrink-0 w-16 truncate">
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
          <h2 className="text-xs font-semibold text-stone-400 uppercase tracking-wider mb-1">
            Suggested Rehearsal Blocks
          </h2>
          <p className="text-xs text-stone-400 mb-4">
            Consecutive scenes sharing cast — group these into a single rehearsal call.
          </p>
          <div className="space-y-4">
            {multiBlocks.map((block, idx) => {
              const blockActors = actors.filter((a) => block.actorIds.has(a.id));
              const firstScene = sceneById.get(block.sceneIds[0]);
              const lastScene = sceneById.get(block.sceneIds[block.sceneIds.length - 1]);
              const firstAct = firstScene ? sceneActMap.get(block.sceneIds[0]) : null;
              const lastAct = lastScene
                ? sceneActMap.get(block.sceneIds[block.sceneIds.length - 1])
                : null;

              const rangeLabel =
                firstAct && lastAct && firstScene && lastScene
                  ? firstScene.id === lastScene.id
                    ? `${firstAct.title} · ${firstScene.title}`
                    : `${firstAct.title} · ${firstScene.title} → ${lastAct.title} · ${lastScene.title}`
                  : "";

              return (
                <div
                  key={idx}
                  className="border border-stone-200 rounded-lg p-4"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <div className="text-sm font-medium text-stone-700">
                        Block {idx + 1}
                      </div>
                      <div className="text-xs text-stone-400 mt-0.5">{rangeLabel}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-sm font-semibold text-stone-700 tabular-nums">
                        {fmtMins(block.totalMinutes)}
                      </div>
                      <div className="text-xs text-stone-400">
                        {block.sceneIds.length} scenes
                      </div>
                    </div>
                  </div>

                  {/* Actors needed */}
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

                  {/* Scene list */}
                  <div className="space-y-0.5">
                    {block.sceneIds.map((sceneId) => {
                      const scene = sceneById.get(sceneId);
                      const act = sceneActMap.get(sceneId);
                      if (!scene || !act) return null;
                      const sc = lineCounts.byScene[sceneId];
                      const sceneMins = sc ? sc.words.afterCut / wpm : 0;
                      return (
                        <div
                          key={sceneId}
                          className="flex items-center gap-2 text-xs text-stone-500"
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-stone-200 shrink-0" />
                          <span className="text-stone-400 shrink-0">{act.title}</span>
                          <span className="flex-1 truncate">{scene.title}</span>
                          <span className="tabular-nums text-stone-400 shrink-0">
                            {fmtMins(sceneMins)}
                          </span>
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
