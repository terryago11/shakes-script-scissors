"use client";

import { use, useEffect, useState } from "react";
import { useProject } from "@/lib/project/ProjectStore";
import SceneDashboard from "@/components/Dashboard/SceneDashboard";
import type { Play } from "@/types/play";

export default function DashboardPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = use(params);
  const { project, activeCut } = useProject();
  const [play, setPlay] = useState<Play | null>(null);

  useEffect(() => {
    if (!project) return;
    fetch(`/api/play/${project.playId}`)
      .then((r) => r.json())
      .then(setPlay);
  }, [project?.playId]);

  if (!project || project.id !== projectId || !activeCut) {
    return <div className="text-stone-400 text-sm p-6">Loading project…</div>;
  }

  if (!play) {
    return <div className="text-stone-400 text-sm p-6">Loading play…</div>;
  }

  return (
    <SceneDashboard
      play={play}
      project={project}
      activeCut={activeCut}
    />
  );
}
