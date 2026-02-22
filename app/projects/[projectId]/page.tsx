"use client";

import { use } from "react";
import { useProject } from "@/lib/project/ProjectStore";
import ScriptEditor from "@/components/ScriptEditor/ScriptEditor";

export default function ProjectPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = use(params);
  const { project } = useProject();

  if (!project || project.id !== projectId) {
    return null; // layout handles loading state
  }

  return <ScriptEditor playId={project.playId} />;
}
