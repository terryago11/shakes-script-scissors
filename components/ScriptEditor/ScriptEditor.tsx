"use client";

import { useEffect, useRef, useState } from "react";
import type { Play, Act, Scene } from "@/types/play";
import type { LineCounts, ScriptUnitWithStatus } from "@/types/cut";
import type { Actor, ActorAssignment } from "@/types/project";
import type { SpeechEdit } from "@/types/edit";
import { useProject } from "@/lib/project/ProjectStore";
import { computeCuts } from "@/lib/cuts/CutEngine";
import { computeStageTime } from "@/lib/cuts/StageTimeEngine";
import { applyEditsToLine } from "@/lib/cuts/applyEdits";
import ActBlock from "./ActBlock";
import LineCountPanel from "@/components/LineCounts/LineCountPanel";
import { useSceneJump } from "@/lib/ui/SceneJumpContext";
import { useCutMode } from "@/lib/ui/CutModeContext";
import { useViewMode, type ViewMode } from "@/lib/ui/ViewModeContext";
import type { EditOp } from "@/types/edit";
import { resolveSelectionToOps } from "@/lib/cuts/resolveSelection";

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

  const charToActor: Record<string, string> = {};
  for (const a of assignments) charToActor[a.characterId] = a.actorId;
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
  const [focusedSceneId, setFocusedSceneId] = useState<string | null>(null);
  const [dragOverSceneId, setDragOverSceneId] = useState<string | null>(null);
  const { setScenes, setActiveSceneId } = useSceneJump();
  const { cutModeActive, setCutModeActive } = useCutMode();
  const { viewMode, setViewMode } = useViewMode();
  const scriptColRef = useRef<HTMLDivElement>(null);

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
        setScenes(
          data.acts.flatMap((act) =>
            act.scenes.map((scene) => ({
              id: scene.id,
              label: `${act.title} · ${scene.title}`,
            }))
          )
        );
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
        if (visible.length > 0) setActiveSceneId(visible[0]);
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

  function handleToggle(unitId: string) {
    dispatch({ type: "TOGGLE_UNIT", unitId });
  }

  function handleClearEdits(unitId: string) {
    dispatch({ type: "CLEAR_SPEECH_EDITS", unitId });
  }

  function handleScriptMouseUp() {
    if (!cutModeActive || !scriptColRef.current) return;
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    const targets = resolveSelectionToOps(range, scriptColRef.current);
    if (targets.length === 0) return;

    // Build speechId → lines for full-speech detection
    const speechLines = new Map<string, Array<{ id: string; text: string }>>();
    for (const act of play!.acts) {
      for (const scene of act.scenes) {
        for (const unit of scene.units) {
          if (unit.type === "speech") speechLines.set(unit.id, unit.lines);
        }
      }
    }

    // Group by unitId
    const byUnit = new Map<string, typeof targets>();
    for (const t of targets) {
      const arr = byUnit.get(t.unitId) ?? [];
      arr.push(t);
      byUnit.set(t.unitId, arr);
    }

    // Fully-covered speeches → speech-level cut; partial → word-level edits
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

  // Compute effective scene order (custom or TEI default)
  const defaultSceneOrder = play.acts.flatMap((act) => act.scenes.map((s) => s.id));
  const effectiveSceneOrder = activeCut.sceneOrder ?? defaultSceneOrder;

  function handleSceneReorder(newOrder: string[]) {
    dispatch({ type: "SET_SCENE_ORDER", sceneOrder: newOrder });
  }

  // Drag handlers (lifted here so cross-act drops work)
  function handleDragStartScene(e: React.DragEvent, sceneId: string) {
    e.dataTransfer.setData("text/plain", sceneId);
    e.dataTransfer.effectAllowed = "move";
  }

  function handleDragOverScene(e: React.DragEvent, sceneId: string) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverSceneId(sceneId);
  }

  function handleDragLeaveScene() {
    setDragOverSceneId(null);
  }

  function handleDropScene(e: React.DragEvent, targetSceneId: string) {
    e.preventDefault();
    setDragOverSceneId(null);
    const draggedId = e.dataTransfer.getData("text/plain");
    if (!draggedId || draggedId === targetSceneId) return;
    const newOrder = effectiveSceneOrder.filter((id) => id !== draggedId);
    const targetIndex = newOrder.indexOf(targetSceneId);
    if (targetIndex === -1) return;
    newOrder.splice(targetIndex, 0, draggedId);
    handleSceneReorder(newOrder);
  }

  function handleDragEndScene() {
    setDragOverSceneId(null);
  }

  // Build scene lookup maps for cross-act reordering
  const sceneMap = new Map<string, Scene>();
  const sceneActMap = new Map<string, Act>();
  for (const act of play.acts) {
    for (const scene of act.scenes) {
      sceneMap.set(scene.id, scene);
      sceneActMap.set(scene.id, act);
    }
  }

  // Group consecutive same-act scenes in global display order
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

  // Find the focused scene's title for the banner
  const focusedSceneTitle = (() => {
    if (!focusedSceneId) return null;
    for (const act of play.acts) {
      const s = act.scenes.find((s) => s.id === focusedSceneId);
      if (s) return `${act.title} · ${s.title}`;
    }
    return null;
  })();

  return (
    <div className="max-w-screen-xl mx-auto flex gap-0">
      {/* Script column */}
      <div
        ref={scriptColRef}
        className={`flex-1 min-w-0 overflow-y-auto ${cutModeActive ? "cursor-crosshair select-text" : ""}`}
        onMouseUp={handleScriptMouseUp}
      >
        {/* View mode toolbar */}
        {!cutModeActive && (
          <div className="no-print sticky top-14 z-20 bg-white border-b border-stone-100 px-4 py-1.5 flex items-center gap-1">
            {(
              [
                { value: "standard" as ViewMode, label: "≡ Standard", title: "Show all cuts with strikethrough" },
                { value: "clean"    as ViewMode, label: "✓ Clean",    title: "Hide cuts — show final script only" },
                { value: "diff"     as ViewMode, label: "± Diff",     title: "Highlight cuts and insertions in color" },
              ] as const
            ).map(({ value, label, title }) => (
              <button
                key={value}
                onClick={() => setViewMode(value)}
                title={title}
                className={`text-xs px-2.5 py-1 rounded transition-colors ${
                  viewMode === value
                    ? "bg-amber-100 text-amber-800 font-semibold"
                    : "text-stone-400 hover:text-stone-700 hover:bg-stone-50"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        {/* Active filter badge */}
        {filterLabel && !cutModeActive && (
          <div className="no-print sticky top-14 z-10 bg-white border-b border-stone-100 px-4 py-2 flex items-center gap-2">
            <div className="flex items-center gap-1.5 text-xs bg-amber-50 border border-amber-200 text-amber-800 px-2 py-1 rounded">
              <span>Showing: <strong>{filterLabel}</strong></span>
              <button onClick={() => setFilter(null)} className="text-amber-500 hover:text-amber-700 font-medium ml-1" title="Clear filter">
                ✕
              </button>
            </div>
          </div>
        )}

        {/* Scene focus banner */}
        {focusedSceneId && (
          <div className="no-print sticky top-14 z-10 bg-amber-50 border-b border-amber-200 px-4 py-2 flex items-center gap-3 text-sm">
            <span className="text-amber-700 font-medium">
              {focusedSceneTitle ?? "Focused scene"}
            </span>
            <button
              onClick={() => setFocusedSceneId(null)}
              className="ml-auto text-amber-600 hover:text-amber-800 text-xs underline"
            >
              Show full play
            </button>
          </div>
        )}

        <div className="px-4 py-6">
          {orderedGroups.map((group) => (
            <ActBlock
              key={`${group.act.id}-${group.scenes[0].id}`}
              act={group.act}
              scenes={group.scenes}
              unitsByScene={unitsByScene}
              assignments={project.assignments}
              actors={project.actors}
              castList={play.castList}
              onToggle={handleToggle}
              speechEdits={activeCut.speechEdits}
              onClearEdits={handleClearEdits}
              filteredCharacterIds={filteredCharacterIds}
              cutModeActive={cutModeActive}
              lineCounts={lineCounts}
              focusedSceneId={focusedSceneId}
              onFocusScene={setFocusedSceneId}
              dragOverSceneId={dragOverSceneId}
              onDragStartScene={handleDragStartScene}
              onDragOverScene={handleDragOverScene}
              onDragLeaveScene={handleDragLeaveScene}
              onDropScene={handleDropScene}
              onDragEndScene={handleDragEndScene}
            />
          ))}
        </div>
      </div>

      {/* Line count panel */}
      <div className="no-print w-72 shrink-0 border-l border-stone-200 bg-white sticky top-14 self-start h-[calc(100vh-3.5rem)] overflow-y-auto">
        <LineCountPanel
          play={play}
          lineCounts={focusedLineCounts ?? lineCounts}
          actors={project.actors}
          assignments={project.assignments}
          filter={filter}
          onFilterCharacter={handleFilterCharacter}
          onFilterActor={handleFilterActor}
          stageTime={focusedLineCounts ? undefined : stageTime}
          settings={project.settings}
          isFocused={!!focusedSceneId}
        />
      </div>
    </div>
  );
}
