"use client";

import { useEffect, useRef, useState } from "react";
import type { Play, Act, Scene } from "@/types/play";
import type { LineCounts, ScriptUnitWithStatus } from "@/types/cut";
import type { Actor, ActorAssignment } from "@/types/project";
import type { SpeechEdit } from "@/types/edit";
import type { CharacterStageTime, StageTimeResult } from "@/lib/cuts/StageTimeEngine";
import { useProject } from "@/lib/project/ProjectStore";
import { computeCuts } from "@/lib/cuts/CutEngine";
import { computeStageTime, getEffectiveCharacters } from "@/lib/cuts/StageTimeEngine";
import { applyEditsToLine } from "@/lib/cuts/applyEdits";
import ActBlock from "./ActBlock";
import DiffView from "./DiffView";
import ShakespeareAnimation from "@/components/EasterEgg/ShakespeareAnimation";
import LineCountPanel from "@/components/LineCounts/LineCountPanel";
import { useSceneJump } from "@/lib/ui/SceneJumpContext";
import { useCutMode } from "@/lib/ui/CutModeContext";
import { useViewMode } from "@/lib/ui/ViewModeContext";
import { useMetric } from "@/lib/ui/MetricContext";
import type { EditOp } from "@/types/edit";
import { resolveSelectionToOps } from "@/lib/cuts/resolveSelection";

const DEFAULT_WPM = 135;

/** Compute line/word counts for a single scene's units (for focus mode). */
function computeFocusedLineCounts(
  units: ScriptUnitWithStatus[],
  speechEdits: Record<string, SpeechEdit>,
  assignments: ActorAssignment[],
  actors: Actor[],
): LineCounts {
  function countWords(text: string) { return text.trim().split(/\s+/).filter(Boolean).length; }

  const byCharacter: Record<string, { original: number; afterCut: number }> = {};
  const wordsByCharacter: Record<string, { original: number; afterCut: number }> = {};
  let totalOriginal = 0, totalAfterCut = 0;
  let totalWordsOriginal = 0, totalWordsAfterCut = 0;

  for (const { unit, status, lineStatuses } of units) {
    if (unit.type !== "speech") continue;
    const charId = unit.characterId;
    if (!byCharacter[charId]) {
      byCharacter[charId] = { original: 0, afterCut: 0 };
      wordsByCharacter[charId] = { original: 0, afterCut: 0 };
    }

    const lineWords = unit.lines.reduce((s, l) => s + countWords(l.text), 0);
    byCharacter[charId].original += unit.lineCount;
    wordsByCharacter[charId].original += lineWords;
    totalOriginal += unit.lineCount;
    totalWordsOriginal += lineWords;

    if (status === "cut") continue;

    const lineStatusMap = new Map((lineStatuses ?? []).map((ls) => [ls.lineId, ls.status]));
    const edit = speechEdits[unit.id];
    for (const line of unit.lines) {
      if ((lineStatusMap.get(line.id) ?? "kept") === "cut") continue;
      byCharacter[charId].afterCut += 1;
      totalAfterCut += 1;
      const ops = edit?.ops ?? [];
      if (ops.length > 0) {
        const segs = applyEditsToLine(line.id, line.text, ops);
        const keptText = segs.filter((s) => s.type !== "cut").map((s) => s.text).join("").trim();
        const w = keptText.length > 0 ? countWords(keptText) : 0;
        wordsByCharacter[charId].afterCut += w;
        totalWordsAfterCut += w;
      } else {
        const w = countWords(line.text);
        wordsByCharacter[charId].afterCut += w;
        totalWordsAfterCut += w;
      }
    }
  }

  const actorToChars: Record<string, string[]> = {};
  for (const a of assignments) {
    if (!actorToChars[a.actorId]) actorToChars[a.actorId] = [];
    actorToChars[a.actorId].push(a.characterId);
  }
  const byActor: LineCounts["byActor"] = {};
  for (const actor of actors) {
    const chars = (actorToChars[actor.id] ?? []).filter((c) => (byCharacter[c]?.original ?? 0) > 0);
    const original = chars.reduce((s, c) => s + byCharacter[c].original, 0);
    const afterCut = chars.reduce((s, c) => s + byCharacter[c].afterCut, 0);
    if (original > 0) byActor[actor.id] = { characters: chars, original, afterCut };
  }
  const wordsByActor: LineCounts["words"]["byActor"] = {};
  for (const actor of actors) {
    const chars = (actorToChars[actor.id] ?? []).filter((c) => (wordsByCharacter[c]?.original ?? 0) > 0);
    const original = chars.reduce((s, c) => s + wordsByCharacter[c].original, 0);
    const afterCut = chars.reduce((s, c) => s + wordsByCharacter[c].afterCut, 0);
    if (original > 0) wordsByActor[actor.id] = { characters: chars, original, afterCut };
  }

  return {
    total: { original: totalOriginal, afterCut: totalAfterCut },
    byCharacter,
    byActor,
    byScene: {},
    byAct: {},
    words: {
      total: { original: totalWordsOriginal, afterCut: totalWordsAfterCut },
      byCharacter: wordsByCharacter,
      byActor: wordsByActor,
    },
  };
}

/** Estimate per-character speaking time from word counts for a focused scene. */
function computeSceneSpeakingTime(
  lineCounts: LineCounts,
  wpm: number,
): StageTimeResult {
  const byCharacter: Record<string, CharacterStageTime> = {};
  for (const [charId, counts] of Object.entries(lineCounts.words.byCharacter)) {
    byCharacter[charId] = {
      characterId: charId,
      minutes: counts.afterCut / wpm,
      originalMinutes: counts.original / wpm,
      scenes: [],
    };
  }
  return {
    byCharacter,
    totalMinutes: lineCounts.words.total.afterCut / wpm,
    originalTotalMinutes: lineCounts.words.total.original / wpm,
    pauseMinutes: 0,
    warnings: [],
  };
}

interface Props {
  playId: string;
}

export default function ScriptEditor({ playId }: Props) {
  const { project, activeCut, dispatch } = useProject();
  const [play, setPlay] = useState<Play | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  type FilterState = { type: "character"; id: string } | { type: "actor"; id: string } | null;
  const [filter, setFilter] = useState<FilterState>(null);
  const [cutCount, setCutCount] = useState(0);
  const [easterEggVisible, setEasterEggVisible] = useState(false);
  const [easterEggVariant, setEasterEggVariant] = useState<"cut" | "restore">("cut");
  const CUT_THRESHOLD = 20;
  const { setScenes, setActiveSceneId, jumpingRef, focusedSceneId, setFocusedSceneId } = useSceneJump();
  const { cutModeActive, setCutModeActive } = useCutMode();
  const { viewMode } = useViewMode();
  const { setWpm } = useMetric();
  const scriptColRef = useRef<HTMLDivElement>(null);

  // Keep MetricContext WPM in sync with project settings
  useEffect(() => {
    setWpm(project?.settings?.wordsPerMinute ?? DEFAULT_WPM);
  }, [project?.settings?.wordsPerMinute, setWpm]);

  // Esc key exits cut mode
  useEffect(() => {
    if (!cutModeActive) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setCutModeActive(false);
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [cutModeActive, setCutModeActive]);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/play/${playId}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data: Play) => {
        setPlay(data);
        setLoading(false);
        // Short labels: "1:1", "1:2", "2:1" …
        const scenesList: { id: string; label: string }[] = [];
        data.acts.forEach((act, ai) => {
          act.scenes.forEach((scene, si) => {
            scenesList.push({ id: scene.id, label: `${ai + 1}:${si + 1}` });
          });
        });
        setScenes(scenesList);
        if (scenesList.length > 0) {
          setActiveSceneId(scenesList[0].id);
        }
      })
      .catch((e) => {
        setError(String(e.message));
        setLoading(false);
      });
  }, [playId, setScenes]);

  // Track which scene is at the top of the viewport
  useEffect(() => {
    if (!play) return;
    const sceneIds = play.acts.flatMap((act) => act.scenes.map((s) => s.id));
    const ratios = new Map<string, number>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const sceneId = entry.target.id.replace(/^scene-/, "");
          ratios.set(sceneId, entry.intersectionRatio);
        }
        const visible = sceneIds.filter((id) => (ratios.get(id) ?? 0) > 0);
        if (visible.length > 0 && !jumpingRef.current) setActiveSceneId(visible[0]);
      },
      { rootMargin: "-56px 0px -40% 0px", threshold: [0, 0.1, 0.5, 1.0] }
    );
    const timeout = setTimeout(() => {
      for (const id of sceneIds) {
        const el = document.getElementById(`scene-${id}`);
        if (el) observer.observe(el);
      }
    }, 100);
    return () => { clearTimeout(timeout); observer.disconnect(); };
  }, [play, setActiveSceneId]);

  if (loading) {
    return <div className="flex items-center justify-center py-24 text-stone-400">Loading {playId}…</div>;
  }
  if (error || !play) {
    return <div className="flex items-center justify-center py-24 text-red-500">Failed to load play: {error}</div>;
  }
  if (!project || !activeCut) return null;

  const { unitsByScene, lineCounts } = computeCuts(
    play,
    activeCut,
    project.assignments,
    project.actors
  );

  const stageTime = computeStageTime(play, activeCut, project.settings);

  const focusedLineCounts: LineCounts | null = focusedSceneId
    ? computeFocusedLineCounts(
        unitsByScene.get(focusedSceneId) ?? [],
        activeCut.speechEdits ?? {},
        project.assignments,
        project.actors,
      )
    : null;

  // Time tab in focus mode: estimated speaking time from word counts
  const focusedStageTime: StageTimeResult | null = focusedLineCounts
    ? computeSceneSpeakingTime(focusedLineCounts, project.settings?.wordsPerMinute ?? DEFAULT_WPM)
    : null;

  function handleToggle(unitId: string) {
    // Determine current status to detect a cut action for the easter egg
    const currentStatus = activeCut?.cutMap?.[unitId] ?? "kept";
    dispatch({ type: "TOGGLE_UNIT", unitId });
    if (currentStatus === "kept") {
      // This is a cut action
      setCutCount((prev) => {
        const next = prev + 1;
        if (next >= CUT_THRESHOLD) {
          setEasterEggVariant("cut");
          setEasterEggVisible(true);
          return 0;
        }
        return next;
      });
    }
  }

  function handleRestoreScene() {
    setEasterEggVariant("restore");
    setEasterEggVisible(true);
  }

  function handleClearEdits(unitId: string) {
    dispatch({ type: "CLEAR_SPEECH_EDITS", unitId });
  }

  function handleReassign(unitId: string, characterId: string | null) {
    dispatch({ type: "REASSIGN_SPEECH", unitId, characterId });
  }

  function handleScriptMouseUp() {
    if (!cutModeActive || !scriptColRef.current) return;
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    const targets = resolveSelectionToOps(range, scriptColRef.current);
    if (targets.length === 0) return;

    const speechLines = new Map<string, Array<{ id: string; text: string }>>();
    for (const act of play!.acts) {
      for (const scene of act.scenes) {
        for (const unit of scene.units) {
          if (unit.type === "speech") speechLines.set(unit.id, unit.lines);
        }
      }
    }

    const byUnit = new Map<string, typeof targets>();
    for (const t of targets) {
      const arr = byUnit.get(t.unitId) ?? [];
      arr.push(t);
      byUnit.set(t.unitId, arr);
    }

    const unitCuts: string[] = [];
    const wordOps: Array<{ unitId: string; op: EditOp }> = [];

    for (const [unitId, unitTargets] of byUnit) {
      const lines = speechLines.get(unitId);
      if (lines && lines.length > 0) {
        const targetMap = new Map(unitTargets.map((t) => [t.lineId, t]));
        const allCovered = lines.every((line) => {
          const t = targetMap.get(line.id);
          return t && t.start === 0 && t.end >= line.text.length;
        });
        if (allCovered) { unitCuts.push(unitId); continue; }
      }
      for (const t of unitTargets) {
        wordOps.push({ unitId, op: { type: "cut" as const, lineId: t.lineId, start: t.start, end: t.end } });
      }
    }

    for (const unitId of unitCuts) {
      dispatch({ type: "SET_UNIT_STATUS", unitId, status: "cut" });
    }
    if (wordOps.length > 0) {
      dispatch({ type: "BULK_ADD_EDIT_OPS", ops: wordOps });
    }
    sel.removeAllRanges();
  }

  function handleFilterCharacter(characterId: string | null) {
    if (!characterId) { setFilter(null); return; }
    setFilter((prev) =>
      prev?.type === "character" && prev.id === characterId ? null : { type: "character", id: characterId }
    );
  }

  function handleFilterActor(actorId: string | null) {
    if (!actorId) { setFilter(null); return; }
    setFilter((prev) =>
      prev?.type === "actor" && prev.id === actorId ? null : { type: "actor", id: actorId }
    );
  }

  const filteredCharacterIds: Set<string> = (() => {
    if (!filter || !project) return new Set();
    if (filter.type === "character") return new Set([filter.id]);
    return new Set(project.assignments.filter((a) => a.actorId === filter.id).map((a) => a.characterId));
  })();

  const filterLabel = (() => {
    if (!filter || !play) return null;
    if (filter.type === "character") return play.castList.find((c) => c.id === filter.id)?.name ?? filter.id;
    const actor = project?.actors.find((a) => a.id === filter.id);
    return actor ? actor.name : filter.id;
  })();

  const defaultSceneOrder = play.acts.flatMap((act) => act.scenes.map((s) => s.id));
  const effectiveSceneOrder = activeCut.sceneOrder ?? defaultSceneOrder;

  const sceneMap = new Map<string, Scene>();
  const sceneActMap = new Map<string, Act>();
  for (const act of play.acts) {
    for (const scene of act.scenes) {
      sceneMap.set(scene.id, scene);
      sceneActMap.set(scene.id, act);
    }
  }

  type OrderedGroup = { act: Act; scenes: Scene[] };
  const orderedGroups: OrderedGroup[] = [];
  for (const sceneId of effectiveSceneOrder) {
    const scene = sceneMap.get(sceneId);
    const act = sceneActMap.get(sceneId);
    if (!scene || !act) continue;
    const last = orderedGroups[orderedGroups.length - 1];
    if (last && last.act.id === act.id) {
      last.scenes.push(scene);
    } else {
      orderedGroups.push({ act, scenes: [scene] });
    }
  }

  const focusedSceneTitle = (() => {
    if (!focusedSceneId) return null;
    for (const act of play.acts) {
      const s = act.scenes.find((s) => s.id === focusedSceneId);
      if (s) return `${act.title} · ${s.title}`;
    }
    return null;
  })();

  // Characters that appear in at least one kept entrance SD (used for reassign warnings)
  const charsWithEntrance = new Set<string>();
  for (const act of play.acts) {
    for (const scene of act.scenes) {
      for (const unit of scene.units) {
        if (unit.type === "stage" && unit.stageType === "entrance") {
          if ((activeCut.cutMap[unit.id] ?? "kept") === "kept") {
            const effChars = getEffectiveCharacters(unit, activeCut.stageDirectionEdits);
            for (const charId of effChars) charsWithEntrance.add(charId);
          }
        }
      }
    }
  }

  const sharedActBlockProps = {
    unitsByScene,
    assignments: project.assignments,
    actors: project.actors,
    castList: play.castList,
    filteredCharacterIds,
    cutModeActive,
    focusedSceneId,
    pauses: activeCut.pauses,
    speechReassignments: activeCut.speechReassignments ?? {},
    charsWithEntrance,
    onReassign: handleReassign,
    characterAliases: activeCut.characterAliases,
    onRestoreScene: handleRestoreScene,
  };

  return (
    <div className="max-w-screen-xl mx-auto flex gap-0">
      {/* Script column */}
      <div
        ref={scriptColRef}
        className={`flex-1 min-w-0 overflow-y-auto ${cutModeActive ? "cursor-crosshair select-text" : ""}`}
        onMouseUp={handleScriptMouseUp}
      >
        {/* Focus banner + filter badge */}
        {!cutModeActive && (focusedSceneId || filterLabel) && (
          <div className="no-print sticky top-14 z-20 bg-white dark:bg-stone-950">
            {focusedSceneId && (
              <div className="bg-amber-50 dark:bg-amber-950/40 border-b border-amber-200 dark:border-amber-900 px-4 py-1.5 flex items-center gap-3">
                <span className="text-sm text-amber-700 dark:text-amber-400 font-medium">
                  {focusedSceneTitle ?? "Focused scene"}
                </span>
                <button
                  onClick={() => setFocusedSceneId(null)}
                  className="ml-auto text-xs px-2.5 py-1 rounded bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-400 hover:bg-amber-200 dark:hover:bg-amber-900 border border-amber-200 dark:border-amber-800 font-medium transition-colors shrink-0"
                >
                  ✕ Exit focus
                </button>
              </div>
            )}
            {filterLabel && (
              <div className="px-4 py-2 border-b border-stone-100 dark:border-stone-800 flex items-center gap-2">
                <div className="flex items-center gap-1.5 text-xs bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 text-amber-800 dark:text-amber-300 px-2 py-1 rounded">
                  <span>Showing: <strong>{filterLabel}</strong></span>
                  <button onClick={() => setFilter(null)} className="text-amber-500 hover:text-amber-700 font-medium ml-1">✕</button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Diff mode: true paired-row DiffView */}
        {viewMode === "diff" ? (
          <DiffView
            orderedGroups={orderedGroups}
            unitsByScene={unitsByScene}
            speechEdits={activeCut.speechEdits}
            assignments={project.assignments}
            actors={project.actors}
            castList={play.castList}
            filteredCharacterIds={filteredCharacterIds}
            focusedSceneId={focusedSceneId}
            onToggle={handleToggle}
            onClearEdits={handleClearEdits}
            cutModeActive={cutModeActive}
            characterAliases={activeCut.characterAliases}
          />
        ) : (
          <div className={`px-4 pb-6 ${
            !cutModeActive && focusedSceneId && filterLabel ? "pt-24"
            : !cutModeActive && (focusedSceneId || filterLabel) ? "pt-16"
            : "pt-6"
          }`}>
            {orderedGroups.map((group) => (
              <ActBlock
                key={`${group.act.id}-${group.scenes[0].id}`}
                act={group.act}
                scenes={group.scenes}
                onToggle={handleToggle}
                speechEdits={activeCut.speechEdits}
                onClearEdits={handleClearEdits}
                lineCounts={lineCounts}
                {...sharedActBlockProps}
              />
            ))}
          </div>
        )}
      </div>

      {/* Line count panel — hidden in diff mode */}
      {viewMode !== "diff" && (
        <div className="no-print w-72 shrink-0 border-l border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 sticky top-14 self-start h-[calc(100vh-3.5rem)] overflow-y-auto">
          <LineCountPanel
            play={play}
            lineCounts={focusedLineCounts ?? lineCounts}
            actors={project.actors}
            assignments={project.assignments}
            filter={filter}
            onFilterCharacter={handleFilterCharacter}
            onFilterActor={handleFilterActor}
            stageTime={focusedStageTime ?? stageTime}
            settings={project.settings}
            isFocused={!!focusedSceneId}
            characterAliases={activeCut.characterAliases}
          />
        </div>
      )}

      {/* Easter egg animation */}
      <ShakespeareAnimation
        variant={easterEggVariant}
        visible={easterEggVisible}
        onDismiss={() => setEasterEggVisible(false)}
      />
    </div>
  );
}
