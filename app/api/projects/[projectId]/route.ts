import { NextResponse } from "next/server";
import { getProjectById, upsertProject, deleteProjectById } from "@/lib/db/projectQueries";
import { db } from "@/lib/db";
import { projects } from "@/drizzle/schema";
import { eq } from "drizzle-orm";
import type { Project } from "@/types/project";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  try {
    const project = await getProjectById(projectId);
    if (!project) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(project);
  } catch (e) {
    console.error(`[GET /api/projects/${projectId}]`, e);
    return NextResponse.json({ error: "Failed to fetch project" }, { status: 500 });
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  try {
    const body = (await request.json()) as Project;

    if (body.id !== projectId) {
      return NextResponse.json({ error: "ID mismatch" }, { status: 400 });
    }

    // Optimistic locking: check X-Expected-Updated-At header
    const expectedUpdatedAt = request.headers.get("X-Expected-Updated-At");
    if (expectedUpdatedAt) {
      const [current] = await db
        .select({ updatedAt: projects.updatedAt })
        .from(projects)
        .where(eq(projects.id, projectId))
        .limit(1);

      if (current && current.updatedAt.toISOString() !== expectedUpdatedAt) {
        return NextResponse.json(
          { error: "conflict", message: "Project was modified by another user" },
          { status: 409 }
        );
      }
    }

    await upsertProject(body);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(`[PUT /api/projects/${projectId}]`, e);
    return NextResponse.json({ error: "Failed to update project" }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  try {
    await deleteProjectById(projectId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(`[DELETE /api/projects/${projectId}]`, e);
    return NextResponse.json({ error: "Failed to delete project" }, { status: 500 });
  }
}
