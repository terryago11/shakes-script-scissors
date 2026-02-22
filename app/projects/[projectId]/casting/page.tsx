"use client";

import { use } from "react";
import { useProject } from "@/lib/project/ProjectStore";
import CastingManager from "@/components/CastingManager/CastingManager";

export default function CastingPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = use(params);
  const { project } = useProject();

  if (!project || project.id !== projectId) return null;

  return <CastingManager playId={project.playId} />;
}
