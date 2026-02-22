import { NextResponse } from "next/server";
import { listProjects, upsertProject } from "@/lib/db/projectQueries";
import type { Project } from "@/types/project";

export async function GET() {
  try {
    const projects = await listProjects();
    return NextResponse.json(projects);
  } catch (e) {
    console.error("[GET /api/projects]", e);
    return NextResponse.json({ error: "Failed to list projects" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const project = (await request.json()) as Project;
    await upsertProject(project);
    return NextResponse.json({ id: project.id }, { status: 201 });
  } catch (e) {
    console.error("[POST /api/projects]", e);
    return NextResponse.json({ error: "Failed to create project" }, { status: 500 });
  }
}
