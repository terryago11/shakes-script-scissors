"use client";

import { use, useEffect, useState } from "react";
import { useProject } from "@/lib/project/ProjectStore";
import ExportMenu from "@/components/CueScript/ExportMenu";
import type { Play } from "@/types/play";

export default function ExportPage({
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
  }, [project]);

  if (!project || project.id !== projectId || !activeCut) return null;

  if (!play) {
    return <div className="text-stone-400 text-sm p-6">Loading play…</div>;
  }

  return (
    <ExportMenu
      play={play}
      cut={activeCut}
      actors={project.actors}
      assignments={project.assignments}
      projectName={project.name}
    />
  );
}
