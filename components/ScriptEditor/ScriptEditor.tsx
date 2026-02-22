"use client";

import { useEffect, useState } from "react";
import type { Play } from "@/types/play";
import { useProject } from "@/lib/project/ProjectStore";
import { computeCuts } from "@/lib/cuts/CutEngine";
import ActBlock from "./ActBlock";
import LineCountPanel from "@/components/LineCounts/LineCountPanel";

interface Props {
  playId: string;
}

export default function ScriptEditor({ playId }: Props) {
  const { project, activeCut, dispatch } = useProject();
  const [play, setPlay] = useState<Play | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
      })
      .catch((e) => {
        setError(String(e.message));
        setLoading(false);
      });
  }, [playId]);

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

  return (
    <div className="max-w-screen-xl mx-auto flex gap-0">
      {/* Script column */}
      <div className="flex-1 min-w-0 px-4 py-6 overflow-y-auto">
        {play.acts.map((act) => (
          <ActBlock
            key={act.id}
            act={act}
            unitsByScene={unitsByScene}
            assignments={project.assignments}
            actors={project.actors}
            onToggle={handleToggle}
          />
        ))}
      </div>

      {/* Line count panel */}
      <div className="no-print w-72 shrink-0 border-l border-stone-200 bg-white sticky top-14 self-start h-[calc(100vh-3.5rem)] overflow-y-auto">
        <LineCountPanel
          play={play}
          lineCounts={lineCounts}
          actors={project.actors}
          assignments={project.assignments}
        />
      </div>
    </div>
  );
}
