"use client";

import { useEffect, useRef, useState } from "react";
import type { Play } from "@/types/play";
import { useProject } from "@/lib/project/ProjectStore";
import { computeCuts } from "@/lib/cuts/CutEngine";
import ActBlock from "./ActBlock";
import LineCountPanel from "@/components/LineCounts/LineCountPanel";
import { useSceneJump } from "@/lib/ui/SceneJumpContext";
import { useCutMode } from "@/lib/ui/CutModeContext";
import type { EditOp } from "@/types/edit";
import { resolveSelectionToOps } from "@/lib/cuts/resolveSelection";

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
  const { setScenes, setActiveSceneId } = useSceneJump();
  const { cutModeActive, setCutModeActive } = useCutMode();
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
          {play.acts.map((act) => (
            <ActBlock
              key={act.id}
              act={act}
              unitsByScene={unitsByScene}
              assignments={project.assignments}
              actors={project.actors}
              onToggle={handleToggle}
              speechEdits={activeCut.speechEdits}
              onClearEdits={handleClearEdits}
              filteredCharacterIds={filteredCharacterIds}
              cutModeActive={cutModeActive}
              lineCounts={lineCounts}
              sceneOrder={effectiveSceneOrder}
              focusedSceneId={focusedSceneId}
              onFocusScene={setFocusedSceneId}
              onSceneReorder={handleSceneReorder}
            />
          ))}
        </div>
      </div>

      {/* Line count panel */}
      <div className="no-print w-72 shrink-0 border-l border-stone-200 bg-white sticky top-14 self-start h-[calc(100vh-3.5rem)] overflow-y-auto">
        <LineCountPanel
          play={play}
          lineCounts={lineCounts}
          actors={project.actors}
          assignments={project.assignments}
          filter={filter}
          onFilterCharacter={handleFilterCharacter}
          onFilterActor={handleFilterActor}
        />
      </div>
    </div>
  );
}
