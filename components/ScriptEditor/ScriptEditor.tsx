"use client";

import { useEffect, useState } from "react";
import type { Play } from "@/types/play";
import { useProject } from "@/lib/project/ProjectStore";
import { computeCuts } from "@/lib/cuts/CutEngine";
import ActBlock from "./ActBlock";
import LineCountPanel from "@/components/LineCounts/LineCountPanel";
import { useSceneJump } from "@/lib/ui/SceneJumpContext";

interface Props {
  playId: string;
}

export default function ScriptEditor({ playId }: Props) {
  const { project, activeCut, dispatch } = useProject();
  const [play, setPlay] = useState<Play | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Filter state: null = no filter, {type:"character",id} or {type:"actor",id}
  type FilterState = { type: "character"; id: string } | { type: "actor"; id: string } | null;
  const [filter, setFilter] = useState<FilterState>(null);
  const { setScenes, setActiveSceneId } = useSceneJump();

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
        // Register scenes with the nav-bar jump context
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

  // IntersectionObserver: track which scene is currently at the top of the viewport
  useEffect(() => {
    if (!play) return;

    // Map from element id → scene id
    const sceneIds = play.acts.flatMap((act) => act.scenes.map((s) => s.id));

    // How much of each scene is visible — track the topmost intersecting scene
    const ratios = new Map<string, number>();

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const sceneId = entry.target.id.replace(/^scene-/, "");
          ratios.set(sceneId, entry.intersectionRatio);
        }
        // Pick the topmost scene that has any intersection
        // "topmost" = earliest in document order among those with ratio > 0
        const visible = sceneIds.filter((id) => (ratios.get(id) ?? 0) > 0);
        if (visible.length > 0) {
          setActiveSceneId(visible[0]);
        }
      },
      {
        // rootMargin: shrink the top of the viewport by the nav bar height (56px)
        // so a scene registers as "active" as soon as it scrolls under the nav
        rootMargin: "-56px 0px -40% 0px",
        threshold: [0, 0.1, 0.5, 1.0],
      }
    );

    // Observe all scene anchor elements (rendered after play loads)
    // Use a small delay to let React render the DOM first
    const timeout = setTimeout(() => {
      for (const id of sceneIds) {
        const el = document.getElementById(`scene-${id}`);
        if (el) observer.observe(el);
      }
    }, 100);

    return () => {
      clearTimeout(timeout);
      observer.disconnect();
    };
  }, [play, setActiveSceneId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-stone-400">
        Loading {playId}…
      </div>
    );
  }

  if (error || !play) {
    return (
      <div className="flex items-center justify-center py-24 text-red-500">
        Failed to load play: {error}
      </div>
    );
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

  function handleToggleLine(lineId: string) {
    dispatch({ type: "TOGGLE_LINE", lineId });
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

  // Derive the set of characterIds that are currently filtered
  const filteredCharacterIds: Set<string> = (() => {
    if (!filter || !project) return new Set();
    if (filter.type === "character") return new Set([filter.id]);
    // actor filter: all characters assigned to this actor
    return new Set(project.assignments.filter((a) => a.actorId === filter.id).map((a) => a.characterId));
  })();

  // For the badge display
  const filterLabel = (() => {
    if (!filter || !play) return null;
    if (filter.type === "character") return play.castList.find((c) => c.id === filter.id)?.name ?? filter.id;
    const actor = project?.actors.find((a) => a.id === filter.id);
    return actor ? actor.name : filter.id;
  })();

  return (
    <div className="max-w-screen-xl mx-auto flex gap-0">
      {/* Script column */}
      <div className="flex-1 min-w-0 overflow-y-auto">
        {/* Active filter badge — shown when a character/actor filter is active */}
        {filterLabel && (
          <div className="no-print sticky top-14 z-10 bg-white border-b border-stone-100 px-4 py-2 flex items-center gap-2">
            <div className="flex items-center gap-1.5 text-xs bg-amber-50 border border-amber-200 text-amber-800 px-2 py-1 rounded">
              <span>Showing: <strong>{filterLabel}</strong></span>
              <button
                onClick={() => setFilter(null)}
                className="text-amber-500 hover:text-amber-700 font-medium ml-1"
                title="Clear filter"
              >
                ✕
              </button>
            </div>
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
              onToggleLine={handleToggleLine}
              filteredCharacterIds={filteredCharacterIds}
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
