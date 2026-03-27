"use client";

import { useState } from "react";
import type { Act, Play, Scene } from "@/types/play";
import type { Actor, ActorAssignment, Cut } from "@/types/project";
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
  characterAliases?: Record<string, string>;
  minBlockMinutes?: number;
  maxBlockMinutes?: number;
  activeCut: Cut;
}

function fmtMins(m: number): string {
  if (m < 60) return `${Math.round(m)} min`;
  const h = Math.floor(m / 60);
  const rem = Math.round(m % 60);
  return rem > 0 ? `${h}h ${rem}m` : `${h}h`;
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/** A sub-scene: a contiguous segment of a scene split at major entrances */
interface SubScene {
  id: string;         // `${sceneId}::${partIdx}`
  sceneId: string;
  partIdx: number;
  totalParts: number;
  charSet: Set<string>;   // all chars present (speakers + onstage non-speakers)
  wordCount: number;
  minutes: number;
}

/**
 * Walk a scene's units and split into sub-scenes at major entrances (≥2 chars
 * entering at once after at least one speech in the current segment).
 *
 * Character sets include everyone onstage, not just speakers — needed for blocking.
 */
function buildSubScenes(scene: Scene, cut: Cut, wpm: number): SubScene[] {
  const segments: Array<{ chars: Set<string>; words: number }> = [
    { chars: new Set(), words: 0 },
  ];

  // Track who's onstage across the whole scene so non-speaking onstage chars
  // are included in each segment's character set.
  const onstage = new Set<string>();

  for (const unit of scene.units) {
    if (unit.type === "stage") {
      const chars = cut.stageDirectionEdits?.[unit.id] ?? unit.characters;
      if (unit.stageType === "entrance") {
        for (const cid of chars) onstage.add(cid);

        const current = segments[segments.length - 1];
        // Major entrance: ≥2 entering + current segment already has speeches → split
        if (chars.length >= 2 && current.words > 0) {
          // New segment starts with everyone now onstage (including just-entered)
          segments.push({ chars: new Set<string>(onstage), words: 0 });
        } else {
          // Minor entrance — add entering chars to the current segment
          for (const cid of chars) current.chars.add(cid);
        }
      } else if (unit.stageType === "exit") {
        for (const cid of chars) onstage.delete(cid);
      }
    } else if (unit.type === "speech") {
      const isKept = (cut.cutMap[unit.id] ?? "kept") === "kept";
      if (!isKept) continue;

      const current = segments[segments.length - 1];

      // Pull in everyone currently onstage (catches non-speakers present during this speech)
      for (const cid of onstage) current.chars.add(cid);

      // Effective speakers (handle reassignments + multi-speaker)
      const speakers = cut.speechReassignments?.[unit.id]
        ?? unit.characterIds
        ?? [unit.characterId];
      for (const cid of speakers) {
        current.chars.add(cid);
        onstage.add(cid); // ensure speaker is tracked as onstage
      }

      for (const line of unit.lines) {
        if (cut.lineCutMap?.[line.id] === "cut") continue;
        current.words += countWords(line.text);
      }
    }
  }

  const valid = segments.filter((s) => s.words > 0);
  if (valid.length === 0) return [];

  return valid.map((seg, i) => ({
    id: `${scene.id}::${i}`,
    sceneId: scene.id,
    partIdx: i,
    totalParts: valid.length,
    charSet: seg.chars,
    wordCount: seg.words,
    minutes: seg.words / wpm,
  }));
}

interface RehearsalBlock {
  subScenes: SubScene[];
  totalMinutes: number;
  isBigScene?: boolean;
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
  activeCut,
}: Props) {
  const [clusterMode, setClusterMode] = useState<"character" | "actor">("character");
  const [showHelp, setShowHelp] = useState(false);
  const [actorSearch, setActorSearch] = useState("");
  const [collapsedActors, setCollapsedActors] = useState(new Set<string>());

  function toggleCollapse(id: string) {
    setCollapsedActors((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  const charToActor = new Map<string, string>();
  const actorToChars = new Map<string, string[]>();
  for (const a of assignments) {
    charToActor.set(a.characterId, a.actorId);
    if (!actorToChars.has(a.actorId)) actorToChars.set(a.actorId, []);
    actorToChars.get(a.actorId)!.push(a.characterId);
  }

  // Convert a character set to an actor set (unmapped chars are dropped)
  function charSetToActorSet(charSet: Set<string>): Set<string> {
    const actorSet = new Set<string>();
    for (const cid of charSet) {
      const aid = charToActor.get(cid);
      if (aid) actorSet.add(aid);
    }
    return actorSet;
  }

  // ── By Actor section ─────────────────────────────────────────────────────────
  interface ActorSceneEntry { sceneId: string; value: number }

  const actorScenes = new Map<string, ActorSceneEntry[]>();
  const actorTotals = new Map<string, number>();

  for (const actor of actors) {
    const entries: ActorSceneEntry[] = [];
    const charIds = actorToChars.get(actor.id) ?? [];
    for (const sceneId of effectiveSceneOrder) {
      let value = 0;
      for (const charId of charIds) {
        if (metric === "time") {
          value += stageTimeByChar[charId]?.scenes.find((s) => s.sceneId === sceneId)?.minutes ?? 0;
        } else {
          const data = charSceneMatrix.get(charId)?.get(sceneId);
          if (data) value += metric === "words" ? data.wordsAfterCut : data.linesAfterCut;
        }
      }
      if (value > 0) entries.push({ sceneId, value });
    }
    actorScenes.set(actor.id, entries);
    actorTotals.set(actor.id, entries.reduce((s, e) => s + e.value, 0));
  }

  // ── Big scene detection ───────────────────────────────────────────────────────
  // Any scene within 80% of the max speaking-character count AND >10 min is
  // treated as a "full company" scene and isolated in its own block.
  const bigSceneIds = new Set<string>();
  {
    let maxChars = 0;
    const sceneCounts = new Map<string, { chars: number; mins: number }>();
    for (const sceneId of effectiveSceneOrder) {
      const mins = (lineCounts.byScene[sceneId]?.words.afterCut ?? 0) / wpm;
      let charCount = 0;
      for (const [, sceneMap] of charSceneMatrix) {
        if ((sceneMap.get(sceneId)?.linesAfterCut ?? 0) > 0) charCount++;
      }
      sceneCounts.set(sceneId, { chars: charCount, mins });
      if (mins >= 10 && charCount > maxChars) maxChars = charCount;
    }
    if (maxChars > 0) {
      for (const [sceneId, { chars, mins }] of sceneCounts) {
        if (mins >= 10 && chars >= maxChars * 0.8) bigSceneIds.add(sceneId);
      }
    }
  }

  // ── Sub-scene building ────────────────────────────────────────────────────────
  const allSubScenes: SubScene[] = [];
  for (const sceneId of effectiveSceneOrder) {
    if (bigSceneIds.has(sceneId)) continue;
    const scene = sceneById.get(sceneId);
    if (!scene) continue;
    const subs = buildSubScenes(scene, activeCut, wpm);
    allSubScenes.push(...subs);
  }

  // ── Jaccard clustering (character-based or actor-based) ───────────────────────
  function jaccard(a: Set<string>, b: Set<string>): number {
    if (a.size === 0 && b.size === 0) return 0;
    let inter = 0;
    for (const c of a) if (b.has(c)) inter++;
    const union = a.size + b.size - inter;
    return union === 0 ? 0 : inter / union;
  }

  // Resolve the set to use for similarity (actor mode maps chars → actor ids)
  function simSet(ss: SubScene): Set<string> {
    return clusterMode === "actor" ? charSetToActorSet(ss.charSet) : ss.charSet;
  }

  const simCache = new Map<string, number>();
  function getSim(a: SubScene, b: SubScene): number {
    const key = a.id < b.id ? `${a.id}|${b.id}` : `${b.id}|${a.id}`;
    if (!simCache.has(key)) simCache.set(key, jaccard(simSet(a), simSet(b)));
    return simCache.get(key)!;
  }

  const THRESHOLD = 0.33;
  type Cluster = { items: SubScene[] };
  let clusters: Cluster[] = allSubScenes.map((ss) => ({ items: [ss] }));

  function clusterSim(c1: Cluster, c2: Cluster): number {
    let min = 1;
    for (const a of c1.items) for (const b of c2.items) {
      const s = getSim(a, b);
      if (s < min) min = s;
    }
    return min;
  }

  while (clusters.length > 1) {
    let best = -1, bi = -1, bj = -1;
    for (let i = 0; i < clusters.length; i++)
      for (let j = i + 1; j < clusters.length; j++) {
        const s = clusterSim(clusters[i], clusters[j]);
        if (s > best) { best = s; bi = i; bj = j; }
      }
    if (best < THRESHOLD) break;
    clusters[bi] = { items: [...clusters[bi].items, ...clusters[bj].items] };
    clusters.splice(bj, 1);
  }

  // Sort sub-scenes within each cluster by scene order, then part index
  const sceneOrderIndex = new Map(effectiveSceneOrder.map((id, i) => [id, i]));
  function subSceneOrder(ss: SubScene): number {
    return (sceneOrderIndex.get(ss.sceneId) ?? 999) * 100 + ss.partIdx;
  }
  for (const c of clusters) c.items.sort((a, b) => subSceneOrder(a) - subSceneOrder(b));

  // ── Build rehearsal blocks ────────────────────────────────────────────────────
  const blocks: RehearsalBlock[] = [];

  for (const cluster of clusters) {
    const distinctScenes = new Set(cluster.items.map((ss) => ss.sceneId));
    if (distinctScenes.size < 2) continue;

    const totalMins = cluster.items.reduce((s, ss) => s + ss.minutes, 0);
    if (totalMins < minBlockMinutes) continue;

    if (totalMins <= maxBlockMinutes) {
      blocks.push({ subScenes: cluster.items, totalMinutes: totalMins });
    } else {
      let current: SubScene[] = [];
      let currentMins = 0;
      for (const ss of cluster.items) {
        if (current.length >= 2 && currentMins + ss.minutes > maxBlockMinutes) {
          const dScenes = new Set(current.map((s) => s.sceneId));
          if (dScenes.size >= 2 && currentMins >= minBlockMinutes)
            blocks.push({ subScenes: current, totalMinutes: currentMins });
          current = [ss];
          currentMins = ss.minutes;
        } else {
          current.push(ss);
          currentMins += ss.minutes;
        }
      }
      const dScenes = new Set(current.map((s) => s.sceneId));
      if (dScenes.size >= 2 && currentMins >= minBlockMinutes)
        blocks.push({ subScenes: current, totalMinutes: currentMins });
    }
  }

  blocks.sort((a, b) => new Set(b.subScenes.map((s) => s.sceneId)).size - new Set(a.subScenes.map((s) => s.sceneId)).size);

  // Add each big scene as its own isolated "full company" block (in script order)
  for (const bigId of effectiveSceneOrder.filter((id) => bigSceneIds.has(id))) {
    const bigMins = (lineCounts.byScene[bigId]?.words.afterCut ?? 0) / wpm;
    const bigCharSet = new Set<string>();
    for (const [cid, sceneMap] of charSceneMatrix) {
      if ((sceneMap.get(bigId)?.linesAfterCut ?? 0) > 0) bigCharSet.add(cid);
    }
    const bigSub: SubScene = {
      id: `${bigId}::big`,
      sceneId: bigId,
      partIdx: 0,
      totalParts: 1,
      charSet: bigCharSet,
      wordCount: lineCounts.byScene[bigId]?.words.afterCut ?? 0,
      minutes: bigMins,
    };
    blocks.push({ subScenes: [bigSub], totalMinutes: bigMins, isBigScene: true });
  }

  const hasActors = actors.length > 0 && assignments.length > 0;

  // Filter actors by search term (actor name or any assigned character name)
  const filteredActors = actors.filter((actor) => {
    if (!actorSearch) return true;
    const term = actorSearch.toLowerCase();
    if (actor.name.toLowerCase().includes(term)) return true;
    return (actorToChars.get(actor.id) ?? []).some((cid) =>
      resolveCharacterName(cid, characterAliases, play.castList).toLowerCase().includes(term)
    );
  });

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="flex gap-10 items-start">
      {/* By Actor */}
      <section className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-3">
          <h2 className="text-xs font-semibold text-stone-400 dark:text-stone-400 uppercase tracking-wider">
            By Actor
          </h2>
          {actors.length > 0 && (
            <input
              type="search"
              placeholder="Filter actors/characters…"
              value={actorSearch}
              onChange={(e) => setActorSearch(e.target.value)}
              className="ml-auto text-xs px-2 py-1 border border-stone-200 dark:border-stone-700 rounded bg-white dark:bg-stone-900 text-stone-600 dark:text-stone-300 placeholder-stone-300 dark:placeholder-stone-600 focus:outline-none focus:ring-1 focus:ring-amber-400 w-32"
            />
          )}
        </div>
        {actors.length === 0 ? (
          <p className="text-sm text-stone-400 dark:text-stone-400">No actors assigned yet.</p>
        ) : filteredActors.length === 0 ? (
          <p className="text-sm text-stone-400 dark:text-stone-400">No actors match &ldquo;{actorSearch}&rdquo;.</p>
        ) : (
          <div className="space-y-4">
            {filteredActors.map((actor) => {
              const entries = actorScenes.get(actor.id) ?? [];
              const total = actorTotals.get(actor.id) ?? 0;
              if (entries.length === 0) return null;
              const charIds = actorToChars.get(actor.id) ?? [];
              const isCollapsed = collapsedActors.has(actor.id);
              return (
                <div key={actor.id}>
                  <button
                    onClick={() => toggleCollapse(actor.id)}
                    className="flex items-center gap-2 mb-1 w-full text-left group"
                    aria-expanded={!isCollapsed}
                  >
                    <span className="text-stone-400 dark:text-stone-500 text-xs w-3 shrink-0 select-none">
                      {isCollapsed ? "▸" : "▾"}
                    </span>
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: actor.color }} />
                    <span className="font-semibold text-stone-700 dark:text-stone-200 text-sm group-hover:text-stone-900 dark:group-hover:text-stone-100">
                      {actor.name}
                    </span>
                    <span className="text-xs text-stone-400 dark:text-stone-400 ml-auto tabular-nums">
                      {entries.length} scenes ·{" "}
                      {metric === "time"
                        ? fmtMins(total)
                        : total.toLocaleString() + (metric === "words" ? " words" : " lines")}
                    </span>
                  </button>
                  {!isCollapsed && (
                    <>
                      <div className="text-xs text-stone-400 dark:text-stone-400 mb-2 pl-5">
                        {charIds.map((cid) => resolveCharacterName(cid, characterAliases, play.castList)).join(" / ")}
                      </div>
                      <div className="pl-5 space-y-1">
                        {entries.map(({ sceneId, value }) => {
                          const scene = sceneById.get(sceneId);
                          const act = sceneActMap.get(sceneId);
                          if (!scene || !act) return null;
                          return (
                            <div key={sceneId} className="flex items-center gap-2 text-xs text-stone-600 dark:text-stone-300">
                              <span className="text-stone-400 dark:text-stone-400 shrink-0 w-16 truncate">{act.title}</span>
                              <span className="flex-1 truncate">{scene.title}</span>
                              <span
                                className="tabular-nums font-medium px-1.5 py-0.5 rounded text-xs shrink-0"
                                style={{ backgroundColor: actor.color + "20", color: actor.color }}
                              >
                                {metric === "time" ? fmtMins(value) : value.toLocaleString()}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Suggested Rehearsal Blocks */}
      <section className="flex-1 min-w-0">
        <div className="flex items-center gap-3 mb-1">
          <h2 className="text-xs font-semibold text-stone-400 dark:text-stone-400 uppercase tracking-wider">
            Suggested Rehearsal Blocks
          </h2>
          <button
            onClick={() => setShowHelp((v) => !v)}
            title="How does this work?"
            className={`w-4 h-4 rounded-full border text-[10px] font-bold leading-none flex items-center justify-center transition-colors shrink-0 ${
              showHelp
                ? "bg-stone-600 dark:bg-stone-400 border-stone-600 dark:border-stone-400 text-white dark:text-stone-900"
                : "border-stone-300 dark:border-stone-600 text-stone-400 dark:text-stone-500 hover:border-stone-500 dark:hover:border-stone-400 hover:text-stone-600 dark:hover:text-stone-300"
            }`}
          >
            ?
          </button>
          {/* Character / Actor toggle */}
          <div className="ml-auto flex items-center gap-1 bg-stone-100 dark:bg-stone-800 rounded-md p-0.5 text-xs">
            <button
              onClick={() => setClusterMode("character")}
              className={`px-2 py-0.5 rounded transition-colors ${
                clusterMode === "character"
                  ? "bg-white dark:bg-stone-600 text-stone-700 dark:text-stone-200 shadow-sm font-medium"
                  : "text-stone-400 dark:text-stone-500 hover:text-stone-600 dark:hover:text-stone-300"
              }`}
            >
              By character
            </button>
            <button
              onClick={() => setClusterMode("actor")}
              disabled={!hasActors}
              title={!hasActors ? "Assign actors in Casting first" : undefined}
              className={`px-2 py-0.5 rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                clusterMode === "actor"
                  ? "bg-white dark:bg-stone-600 text-stone-700 dark:text-stone-200 shadow-sm font-medium"
                  : "text-stone-400 dark:text-stone-500 hover:text-stone-600 dark:hover:text-stone-300"
              }`}
            >
              By actor
            </button>
          </div>
        </div>
        <p className="text-xs text-stone-400 dark:text-stone-400 mb-1">
          {clusterMode === "actor"
            ? "Scenes grouped by shared actors — reflects doubling. Scenes split at major entrances."
            : "Scenes grouped by shared characters (including onstage non-speakers). Scenes split at major entrances."}
        </p>

        {showHelp && (
          <div className="mb-4 p-3 rounded-lg bg-stone-50 dark:bg-stone-800/50 border border-stone-200 dark:border-stone-700 text-xs text-stone-500 dark:text-stone-400 space-y-2">
            <p className="font-semibold text-stone-600 dark:text-stone-300">How rehearsal blocks are suggested</p>
            <p>
              Each scene is first split into <strong className="text-stone-600 dark:text-stone-300">sub-scenes</strong> at major
              entrances (two or more characters entering at once after dialogue has already begun).
              This separates scenes that contain distinct dramatic units — for example, the mechanicals&apos;
              rehearsal and the lovers&apos; quarrel within a single act.
            </p>
            <p>
              Sub-scenes are then grouped by <strong className="text-stone-600 dark:text-stone-300">cast overlap</strong> using
              complete-linkage hierarchical clustering with Jaccard similarity. Two groups only merge
              if <em>every</em> pair of sub-scenes across them shares at least ⅓ of their cast — this
              prevents a large mixed-cast scene from acting as a bridge and pulling unrelated scenes together.
            </p>
            <p>
              In <strong className="text-stone-600 dark:text-stone-300">By character</strong> mode, similarity is computed on
              character IDs directly (including characters onstage but not speaking). In{" "}
              <strong className="text-stone-600 dark:text-stone-300">By actor</strong> mode, character IDs are first mapped
              to actors, so doubling collapses into a single presence — useful once casting is set.
            </p>
            <p>
              Blocks must contain at least two distinct scenes and fall within the min/max duration
              you set in <strong className="text-stone-600 dark:text-stone-300">Settings</strong> (default 5–60 min).
              Scenes whose cast is within 80% of the largest speaking-cast count <em>and</em> run
              over 10 minutes are isolated as their own block; when every assigned actor appears in
              a block it is labelled <strong className="text-stone-600 dark:text-stone-300">★ Full company</strong>.
            </p>
          </div>
        )}

        {!showHelp && <div className="mb-4" />}

        {blocks.length === 0 ? (
          <p className="text-sm text-stone-400 dark:text-stone-400">
            No blocks found. Try adjusting the min/max duration in Settings.
          </p>
        ) : (
          <div className="space-y-4">
            {(() => {
              let blockNum = 0;
              return blocks.map((block, idx) => {
              const blockCharIds = new Set<string>();
              for (const ss of block.subScenes) for (const c of ss.charSet) blockCharIds.add(c);
              const blockActors = actors.filter((a) =>
                (actorToChars.get(a.id) ?? []).some((cid) => blockCharIds.has(cid))
              );
              const distinctScenes = new Set(block.subScenes.map((ss) => ss.sceneId));
              // "Full company" only when every assigned actor is called for this block
              const isFullCompany = actors.length > 0 && blockActors.length === actors.length;
              if (!isFullCompany) blockNum++;
              const displayNum = blockNum;

              return (
                <div
                  key={idx}
                  className={`border rounded-lg p-4 ${
                    isFullCompany
                      ? "border-amber-300 dark:border-amber-700 bg-amber-50/30 dark:bg-amber-950/10"
                      : "border-stone-200 dark:border-stone-700"
                  }`}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="min-w-0 mr-3">
                      <div className="text-sm font-medium text-stone-700 dark:text-stone-200 flex items-center gap-1.5">
                        {isFullCompany ? (
                          <><span className="text-amber-600 dark:text-amber-400">★</span> Full company</>
                        ) : (
                          `Block ${displayNum}`
                        )}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-sm font-semibold text-stone-700 dark:text-stone-200 tabular-nums">
                        {fmtMins(block.totalMinutes)}
                      </div>
                      <div className="text-xs text-stone-400 dark:text-stone-400">
                        {distinctScenes.size} scene{distinctScenes.size !== 1 ? "s" : ""}
                        {block.subScenes.length > distinctScenes.size &&
                          ` · ${block.subScenes.length} parts`}
                      </div>
                    </div>
                  </div>

                  {/* Actor chips with characters */}
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

                  {/* Sub-scene list */}
                  <div className="space-y-0.5">
                    {block.subScenes.map((ss, sIdx) => {
                      const scene = sceneById.get(ss.sceneId);
                      const act = sceneActMap.get(ss.sceneId);
                      if (!scene || !act) return null;

                      const prevSs = block.subScenes[sIdx - 1];
                      const prevOrder = prevSs ? subSceneOrder(prevSs) : -1;
                      const hasGap = sIdx > 0 && subSceneOrder(ss) - prevOrder > 1;

                      const label = ss.totalParts > 1
                        ? `${scene.title} (pt. ${ss.partIdx + 1})`
                        : scene.title;

                      return (
                        <div key={ss.id}>
                          {hasGap && (
                            <div className="text-stone-300 dark:text-stone-600 text-xs text-center py-0.5">···</div>
                          )}
                          <div className="flex items-center gap-2 text-xs text-stone-500 dark:text-stone-400">
                            <span className="w-1.5 h-1.5 rounded-full bg-stone-200 dark:bg-stone-700 shrink-0" />
                            <span className="text-stone-400 dark:text-stone-400 shrink-0">{act.title}</span>
                            <span className="flex-1 truncate">{label}</span>
                            <span className="tabular-nums text-stone-400 dark:text-stone-400 shrink-0">
                              {fmtMins(ss.minutes)}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
              });
            })()}
          </div>
        )}
      </section>
    </div>
  );
}
