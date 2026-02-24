"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { decodeProjectFromUrl } from "@/lib/project/projectIO";
import type { Project, Cut } from "@/types/project";
import type { Play } from "@/types/play";
import { computeCuts } from "@/lib/cuts/CutEngine";
import ActBlock from "@/components/ScriptEditor/ActBlock";
import LineCountPanel from "@/components/LineCounts/LineCountPanel";

function ViewPageInner() {
  const searchParams = useSearchParams();
  const encoded = searchParams.get("share");

  const [project, setProject] = useState<Project | null>(null);
  const [activeCut, setActiveCut] = useState<Cut | null>(null);
  const [play, setPlay] = useState<Play | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingProject, setLoadingProject] = useState(true);
  const [loadingPlay, setLoadingPlay] = useState(false);

  // Decode the project from the URL param
  useEffect(() => {
    if (!encoded) {
      setError("No share data found in URL.");
      setLoadingProject(false);
      return;
    }
    decodeProjectFromUrl(encoded)
      .then((p) => {
        setProject(p);
        const cut = p.cuts.find((c) => c.id === p.activeCutId) ?? p.cuts[0] ?? null;
        setActiveCut(cut);
        setLoadingProject(false);
      })
      .catch((e) => {
        setError(`Could not decode share link: ${e instanceof Error ? e.message : String(e)}`);
        setLoadingProject(false);
      });
  }, [encoded]);

  // Fetch the play data once we know the playId
  useEffect(() => {
    if (!project) return;
    setLoadingPlay(true);
    fetch(`/api/play/${project.playId}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data: Play) => {
        setPlay(data);
        setLoadingPlay(false);
      })
      .catch((e) => {
        setError(`Could not load play data: ${e instanceof Error ? e.message : String(e)}`);
        setLoadingPlay(false);
      });
  }, [project]);

  if (loadingProject) {
    return (
      <div className="flex items-center justify-center min-h-screen text-stone-400">
        Decoding share link…
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <p className="text-red-500 text-lg mb-2">⚠ {error}</p>
          <p className="text-stone-400 text-sm">The share link may be invalid or expired.</p>
        </div>
      </div>
    );
  }

  if (loadingPlay || !play || !project || !activeCut) {
    return (
      <div className="flex items-center justify-center min-h-screen text-stone-400">
        Loading {project?.playTitle ?? "play"}…
      </div>
    );
  }

  const { unitsByScene, lineCounts } = computeCuts(
    play,
    activeCut,
    project.assignments,
    project.actors
  );

  return (
    <div className="min-h-screen flex flex-col">
      {/* Read-only banner */}
      <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 text-center text-sm text-amber-800">
        👁 View only — <strong>{project.playTitle}</strong>{" "}
        <span className="text-amber-600">· Cut: {activeCut.name}</span>
        {project.cuts.length > 1 && (
          <span className="text-amber-500 ml-2">
            ({project.cuts.length} cuts in this share)
          </span>
        )}
      </div>

      {/* Cut picker (read-only — just for switching which cut to view) */}
      {project.cuts.length > 1 && (
        <div className="bg-white border-b border-stone-200 px-4 py-2 flex gap-2 flex-wrap">
          {project.cuts.map((c) => (
            <button
              key={c.id}
              onClick={() => setActiveCut(c)}
              className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                c.id === activeCut.id
                  ? "bg-amber-100 text-amber-800"
                  : "text-stone-500 hover:text-stone-800 hover:bg-stone-100"
              }`}
            >
              {c.name}
            </button>
          ))}
        </div>
      )}

      <div className="max-w-screen-xl mx-auto w-full flex gap-0">
        {/* Script column — read-only (no onToggle handler) */}
        <div className="flex-1 min-w-0 px-4 py-6">
          {play.acts.map((act) => (
            <ActBlock
              key={act.id}
              act={act}
              unitsByScene={unitsByScene}
              assignments={project.assignments}
              actors={project.actors}
              onToggle={null}
              sceneOrder={play.acts.flatMap((a) => a.scenes.map((s) => s.id))}
              focusedSceneId={null}
              onFocusScene={() => {}}
              onSceneReorder={() => {}}
            />
          ))}
        </div>

        {/* Line count panel */}
        <div className="w-72 shrink-0 border-l border-stone-200 bg-white sticky top-0 self-start h-screen overflow-y-auto">
          <LineCountPanel
            play={play}
            lineCounts={lineCounts}
            actors={project.actors}
            assignments={project.assignments}
          />
        </div>
      </div>
    </div>
  );
}

export default function ViewPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-screen text-stone-400">
          Loading…
        </div>
      }
    >
      <ViewPageInner />
    </Suspense>
  );
}
