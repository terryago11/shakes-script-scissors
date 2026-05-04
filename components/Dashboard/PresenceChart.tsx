"use client";

import { useState } from "react";
import type { Act, Character, Play, Scene, Speech } from "@/types/play";
import type { Actor, ActorAssignment, Cut } from "@/types/project";
import type { EffectiveSceneEntry } from "@/lib/cuts/SceneSubdivisionUtils";
import { resolveCharacterName } from "@/lib/project/projectUtils";

interface Props {
  play: Play;
  activeCut: Cut;
  effectiveSceneOrder: string[];
  columnEntries: EffectiveSceneEntry[];
  actors: Actor[];
  assignments: ActorAssignment[];
  characters: Character[];
  characterAliases?: Record<string, string>;
}

export default function PresenceChart({
  play,
  activeCut,
  columnEntries,
  actors,
  assignments,
  characters,
  characterAliases,
}: Props) {
  const [selectedCharIds, setSelectedCharIds] = useState<Set<string>>(new Set());
  const [selectedSceneIds, setSelectedSceneIds] = useState<Set<string>>(new Set());

  function toggleChar(charId: string) {
    setSelectedCharIds((prev) => {
      const next = new Set(prev);
      if (next.has(charId)) next.delete(charId);
      else next.add(charId);
      return next;
    });
  }

  function toggleScene(sceneId: string) {
    setSelectedSceneIds((prev) => {
      const next = new Set(prev);
      if (next.has(sceneId)) next.delete(sceneId);
      else next.add(sceneId);
      return next;
    });
  }

  function clearFilters() {
    setSelectedCharIds(new Set());
    setSelectedSceneIds(new Set());
  }

  // ── Lookups ──────────────────────────────────────────────────────────────
  const charToActor = new Map(assignments.map((a) => [a.characterId, a.actorId]));
  const actorById = new Map(actors.map((a) => [a.id, a]));

  function getActor(charId: string): Actor | null {
    const actorId = charToActor.get(charId);
    return actorId ? (actorById.get(actorId) ?? null) : null;
  }

  // ── Scene → Act lookup (for labels) ──────────────────────────────────────
  const sceneActMap = new Map<string, Act>();
  for (const act of play.acts) {
    for (const scene of act.scenes) sceneActMap.set(scene.id, act);
  }

  // ── Collect all speeches per character from the play ─────────────────────
  // Also build: speechId → scene label, charId → total line count
  const charSpeeches = new Map<string, Speech[]>();
  const speechSceneLabel = new Map<string, string>();
  const charTotalLines = new Map<string, number>();

  for (const act of play.acts) {
    for (const scene of act.scenes) {
      const label = `${act.title} · ${scene.title}`;
      for (const unit of scene.units) {
        if (unit.type !== "speech") continue;
        const speech = unit as Speech;
        if (speech.lines.length === 0) continue;

        const charId = effectiveCharId(speech);
        speechSceneLabel.set(speech.id, label);

        if (!charSpeeches.has(charId)) charSpeeches.set(charId, []);
        charSpeeches.get(charId)!.push(speech);
        charTotalLines.set(charId, (charTotalLines.get(charId) ?? 0) + speech.lineCount);
      }
    }
  }

  // ── Active character IDs (any speech in the play) ─────────────────────────
  const activeCharIds = new Set(charSpeeches.keys());

  // ── Actor groups (mirror DashboardMatrix grouping) ────────────────────────
  const actorToChars = new Map<string, string[]>();
  for (const a of assignments) {
    if (!actorToChars.has(a.actorId)) actorToChars.set(a.actorId, []);
    actorToChars.get(a.actorId)!.push(a.characterId);
  }
  const castCharIds = new Set(assignments.map((a) => a.characterId));

  const charById = new Map(characters.map((c) => [c.id, c]));

  const actorGroups: Array<{ actor: Actor | null; charIds: string[] }> = [];
  for (const actor of actors) {
    const charIds = (actorToChars.get(actor.id) ?? []).filter(
      (id) => activeCharIds.has(id) && charById.has(id)
    );
    if (charIds.length > 0) actorGroups.push({ actor, charIds });
  }
  // Uncast characters
  const uncastCharIds = characters
    .filter((c) => activeCharIds.has(c.id) && !castCharIds.has(c.id))
    .map((c) => c.id);
  if (uncastCharIds.length > 0) actorGroups.push({ actor: null, charIds: uncastCharIds });

  // ── Scene → character membership (for scene filter) ───────────────────────
  const sceneToCharIds = new Map<string, Set<string>>();
  for (const entry of columnEntries) {
    const charSet = new Set<string>();
    for (const unit of entry.units) {
      if (unit.type === "speech" && (unit as Speech).lines.length > 0)
        charSet.add(effectiveCharId(unit as Speech));
    }
    sceneToCharIds.set(entry.id, charSet);
  }

  // ── FTLN range (Panel 1 x-axis) ───────────────────────────────────────────
  let minFtln = Infinity;
  let maxFtln = -Infinity;
  for (const act of play.acts) {
    for (const scene of act.scenes) {
      for (const unit of scene.units) {
        if (unit.type !== "speech") continue;
        const speech = unit as Speech;
        for (const line of speech.lines) {
          if (line.ftln < minFtln) minFtln = line.ftln;
          if (line.ftln > maxFtln) maxFtln = line.ftln;
        }
      }
    }
  }
  if (!isFinite(minFtln)) minFtln = 0;
  if (!isFinite(maxFtln)) maxFtln = 1;
  const ftlnRange = maxFtln - minFtln || 1;

  // ── Act boundaries (first speech FTLN per act) ────────────────────────────
  const actBoundaries: Array<{ act: Act; ftln: number; pct: number }> = [];
  for (const act of play.acts) {
    let firstFtln: number | null = null;
    outer: for (const scene of act.scenes) {
      for (const unit of scene.units) {
        if (unit.type === "speech" && (unit as Speech).lines.length > 0) {
          firstFtln = (unit as Speech).lines[0].ftln;
          break outer;
        }
      }
    }
    if (firstFtln !== null) {
      actBoundaries.push({
        act,
        ftln: firstFtln,
        pct: ((firstFtln - minFtln) / ftlnRange) * 100,
      });
    }
  }

  // ── FTLN tick marks ───────────────────────────────────────────────────────
  const tickStep = ftlnRange <= 500 ? 100 : ftlnRange <= 1000 ? 200 : 500;
  const tickStart = Math.ceil(minFtln / tickStep) * tickStep;
  const ftlnTicks: number[] = [];
  for (let t = tickStart; t <= maxFtln; t += tickStep) ftlnTicks.push(t);

  // ── Helpers ───────────────────────────────────────────────────────────────
  function effectiveCharId(speech: Speech): string {
    return activeCut.speechReassignments?.[speech.id]?.[0] ?? speech.characterId;
  }

  function isKept(speech: Speech): boolean {
    return (activeCut.cutMap[speech.id] ?? "kept") === "kept";
  }

  function speechLeft(speech: Speech): number {
    const ftln = speech.lines[0]?.ftln ?? minFtln;
    return ((ftln - minFtln) / ftlnRange) * 100;
  }

  function speechWidth(speech: Speech): number {
    return Math.max(0.2, (speech.lineCount / ftlnRange) * 100);
  }

  function charName(charId: string): string {
    return resolveCharacterName(charId, characterAliases, characters);
  }

  if (actorGroups.length === 0) {
    return (
      <p className="text-sm text-stone-400 dark:text-stone-400 py-4">
        No character data to display.
      </p>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-10">
      {/* ── Panel 1: Play-level swimlane ───────────────────────────────── */}
      <div>
        <div className="flex items-center gap-3 mb-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-stone-400 dark:text-stone-500">
            By line number
          </h3>
          {(selectedCharIds.size > 0 || selectedSceneIds.size > 0) && (
            <button
              onClick={clearFilters}
              className="text-xs text-stone-400 dark:text-stone-500 underline hover:text-stone-600 dark:hover:text-stone-300"
            >
              Clear filters
            </button>
          )}
        </div>
        <div className="overflow-x-auto">
          <div className="relative" style={{ minWidth: "560px" }}>
            {/* Act dividers — rendered behind rows */}
            <div className="absolute inset-0 pointer-events-none" style={{ top: "1.5rem" }}>
              {actBoundaries.map(({ act, pct }) => (
                <div
                  key={act.id}
                  className="absolute top-0 bottom-5 border-l border-stone-200 dark:border-stone-700"
                  style={{ left: `calc(${pct}% + 7rem + 0.5rem)` }}
                />
              ))}
            </div>

            {/* Act header row */}
            <div className="flex items-stretch gap-2 mb-1">
              {/* Spacer matching name column */}
              <div className="w-28 shrink-0" />
              {/* Act spans */}
              <div className="flex-1 flex overflow-hidden rounded">
                {actBoundaries.map(({ act, pct }, i) => {
                  const nextPct = actBoundaries[i + 1]?.pct ?? 100;
                  const widthPct = nextPct - pct;
                  return (
                    <div
                      key={act.id}
                      className="shrink-0 text-[10px] font-semibold text-stone-500 dark:text-stone-400 bg-stone-100 dark:bg-stone-800 px-1.5 py-0.5 border-r border-white dark:border-stone-950 truncate"
                      style={{ width: `${widthPct}%` }}
                      title={act.title}
                    >
                      {act.title}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Actor → character rows */}
            {actorGroups.map(({ actor, charIds }) => (
              <div key={actor?.id ?? "uncast"} className="mb-2">
                {/* Actor header */}
                <div
                  className="text-[10px] font-semibold uppercase tracking-wide mb-0.5 pl-1"
                  style={{ color: actor?.color ?? "#78716c", paddingLeft: "calc(7rem + 0.5rem + 2px)" }}
                >
                  {actor?.name ?? "Uncast"}
                </div>

                {/* Character swimlanes */}
                {charIds.map((charId) => {
                  const color = actor?.color ?? "#a8a29e";
                  const speeches = charSpeeches.get(charId) ?? [];
                  const dimmed =
                    (selectedCharIds.size > 0 && !selectedCharIds.has(charId)) ||
                    (selectedSceneIds.size > 0 && ![...selectedSceneIds].some((sid) => sceneToCharIds.get(sid)?.has(charId)));
                  return (
                    <div
                      key={charId}
                      className="flex items-center mb-px gap-2"
                      style={{ opacity: dimmed ? 0.2 : 1, transition: "opacity 0.15s" }}
                    >
                      {/* Name label — clickable filter */}
                      <button
                        className="w-28 shrink-0 text-right text-xs truncate pr-1 hover:underline cursor-pointer bg-transparent border-0 p-0 text-right"
                        style={{ color, fontWeight: selectedCharIds.has(charId) ? 700 : 400 }}
                        title={`Filter to ${charName(charId)}`}
                        aria-label={`Filter to ${charName(charId)}`}
                        onClick={() => toggleChar(charId)}
                      >
                        {charName(charId)}
                      </button>

                      {/* Track */}
                      <div className="flex-1 relative h-4 bg-stone-100 dark:bg-stone-800 rounded overflow-hidden">
                        {speeches.map((speech) => (
                          <div
                            key={speech.id}
                            className="absolute top-0 h-full"
                            style={{
                              left: `${speechLeft(speech)}%`,
                              width: `${speechWidth(speech)}%`,
                              backgroundColor: color,
                              opacity: isKept(speech) ? 0.82 : 0.13,
                            }}
                            title={`${charName(charId)} · ${speechSceneLabel.get(speech.id) ?? ""} · ${speech.lineCount} line${speech.lineCount !== 1 ? "s" : ""}`}
                          />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}

            {/* X-axis ticks */}
            <div className="flex items-center mt-1" style={{ paddingLeft: "calc(7rem + 0.5rem + 2px)" }}>
              <div className="flex-1 relative h-4 border-t border-stone-200 dark:border-stone-700">
                {ftlnTicks.map((ftln) => (
                  <span
                    key={ftln}
                    className="absolute top-0.5 text-[9px] text-stone-400 dark:text-stone-500 -translate-x-1/2"
                    style={{ left: `${((ftln - minFtln) / ftlnRange) * 100}%` }}
                  >
                    {ftln}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Panel 2: Scene-level strips ────────────────────────────────── */}
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-stone-400 dark:text-stone-500 mb-3">
          By scene
        </h3>
        {(() => {
          // Pre-compute per-scene speech lists and totals
          const sceneData = columnEntries.map((entry) => {
            const speeches = entry.units.filter(
              (u): u is Speech => u.type === "speech" && (u as Speech).lines.length > 0
            );
            const total = speeches.reduce((s, sp) => s + sp.lineCount, 0);
            return { entry, speeches, total };
          }).filter((d) => d.total > 0);

          const maxSceneLines = sceneData.reduce((m, d) => Math.max(m, d.total), 0) || 1;

          return (
            <div className="space-y-px">
              {sceneData.map(({ entry, speeches, total }) => {
                const sceneSelected = selectedSceneIds.has(entry.id);
                const sceneLabel = sceneActMap.get(entry.realSceneId)?.title
                  ? `${sceneActMap.get(entry.realSceneId)!.title} · ${entry.title}`
                  : entry.title;
                const sceneDimmed = selectedSceneIds.size > 0 && !sceneSelected;
                return (
                <div
                  key={entry.id}
                  className="flex items-center gap-2"
                  style={{ opacity: sceneDimmed ? 0.25 : 1, transition: "opacity 0.15s" }}
                >
                  {/* Scene label — clickable filter */}
                  <button
                    className="w-36 shrink-0 text-xs truncate text-right bg-transparent border-0 p-0 cursor-pointer hover:underline"
                    style={{
                      color: sceneSelected ? "#44403c" : undefined,
                      fontWeight: sceneSelected ? 700 : 400,
                    }}
                    title={`Filter to ${sceneLabel}`}
                    aria-label={`Filter to ${sceneLabel}`}
                    onClick={() => toggleScene(entry.id)}
                  >
                    {sceneLabel}
                  </button>

                  {/* Speech strip — width proportional to scene vs longest scene */}
                  <div
                    className="flex h-5 rounded overflow-hidden bg-stone-100 dark:bg-stone-800"
                    style={{ width: `${(total / maxSceneLines) * 100}%` }}
                  >
                    {speeches.map((sp) => {
                      const charId = effectiveCharId(sp);
                      const actor = getActor(charId);
                      const color = actor?.color ?? "#a8a29e";
                      const kept = isKept(sp);
                      const isSelected = selectedCharIds.has(charId);
                      const dimmed = selectedCharIds.size > 0 && !isSelected;
                      return (
                        <div
                          key={sp.id}
                          className="h-full shrink-0 cursor-pointer"
                          style={{
                            width: `${(sp.lineCount / total) * 100}%`,
                            minWidth: "3px",
                            backgroundColor: color,
                            opacity: dimmed ? 0.08 : kept ? 0.8 : 0.18,
                            transition: "opacity 0.15s",
                          }}
                          title={`${charName(charId)} · ${sp.lineCount} line${sp.lineCount !== 1 ? "s" : ""}${kept ? "" : " (cut)"}`}
                          onClick={() => toggleChar(charId)}
                        />
                      );
                    })}
                  </div>
                </div>
                );
              })}
            </div>
          );
        })()}
      </div>
    </div>
  );
}
