import { db } from "@/lib/db";
import {
  projects,
  actors,
  assignments,
  cuts,
  cutMapEntries,
} from "@/drizzle/schema";
import { eq } from "drizzle-orm";
import type { Project } from "@/types/project";

export interface ProjectSummary {
  id: string;
  playId: string;
  playTitle: string;
  updatedAt: string;
}

/** Fetch a fully assembled Project object from the DB */
export async function getProjectById(id: string): Promise<Project | null> {
  const [row] = await db
    .select()
    .from(projects)
    .where(eq(projects.id, id))
    .limit(1);

  if (!row) return null;

  const [actorRows, assignmentRows, cutRows] = await Promise.all([
    db.select().from(actors).where(eq(actors.projectId, id)),
    db.select().from(assignments).where(eq(assignments.projectId, id)),
    db.select().from(cuts).where(eq(cuts.projectId, id)),
  ]);

  // Load cutMap entries for all cuts in parallel
  const cutMapResults = await Promise.all(
    cutRows.map((cut) =>
      db
        .select()
        .from(cutMapEntries)
        .where(eq(cutMapEntries.cutId, cut.id))
        .then((entries) => ({
          cutId: cut.id,
          map: Object.fromEntries(
            entries.map((e) => [e.unitId, e.status as "cut" | "kept"])
          ),
        }))
    )
  );
  const cutMapById = Object.fromEntries(
    cutMapResults.map((r) => [r.cutId, r.map])
  );

  return {
    version:     1,
    id:          row.id,
    playId:      row.playId,
    playTitle:   row.playTitle,
    activeCutId: row.activeCutId ?? null,
    createdAt:   row.createdAt.toISOString(),
    updatedAt:   row.updatedAt.toISOString(),
    actors: actorRows.map((a) => ({
      id:    a.id,
      name:  a.name,
      color: a.color,
    })),
    assignments: assignmentRows.map((a) => ({
      characterId: a.characterId,
      actorId:     a.actorId,
    })),
    cuts: cutRows.map((c) => ({
      id:        c.id,
      name:      c.name,
      createdAt: c.createdAt.toISOString(),
      cutMap:    cutMapById[c.id] ?? {},
    })),
  };
}

/** List all projects ordered by most recently updated */
export async function listProjects(): Promise<ProjectSummary[]> {
  const rows = await db
    .select({
      id:        projects.id,
      playId:    projects.playId,
      playTitle: projects.playTitle,
      updatedAt: projects.updatedAt,
    })
    .from(projects)
    .orderBy(projects.updatedAt);

  return rows.map((r) => ({
    id:        r.id,
    playId:    r.playId,
    playTitle: r.playTitle,
    updatedAt: r.updatedAt.toISOString(),
  }));
}

/**
 * Upsert a full project to the DB — used by both POST (create) and PUT (update).
 * Uses a transaction: upsert the project row, then delete-and-reinsert all
 * child rows (actors, assignments, cuts, cutMapEntries).
 */
export async function upsertProject(project: Project): Promise<void> {
  await db.transaction(async (tx) => {
    // Upsert project row
    await tx
      .insert(projects)
      .values({
        id:          project.id,
        playId:      project.playId,
        playTitle:   project.playTitle,
        activeCutId: project.activeCutId ?? undefined,
        createdAt:   new Date(project.createdAt),
        updatedAt:   new Date(project.updatedAt),
      })
      .onDuplicateKeyUpdate({
        set: {
          playTitle:   project.playTitle,
          activeCutId: project.activeCutId ?? undefined,
          updatedAt:   new Date(project.updatedAt),
        },
      });

    // Replace actors
    await tx.delete(actors).where(eq(actors.projectId, project.id));
    if (project.actors.length > 0) {
      await tx.insert(actors).values(
        project.actors.map((a) => ({
          id:        a.id,
          projectId: project.id,
          name:      a.name,
          color:     a.color,
        }))
      );
    }

    // Replace assignments
    await tx.delete(assignments).where(eq(assignments.projectId, project.id));
    if (project.assignments.length > 0) {
      await tx.insert(assignments).values(
        project.assignments.map((a) => ({
          projectId:   project.id,
          characterId: a.characterId,
          actorId:     a.actorId,
        }))
      );
    }

    // Delete existing cutMapEntries for this project's cuts, then delete cuts
    const existingCuts = await tx
      .select({ id: cuts.id })
      .from(cuts)
      .where(eq(cuts.projectId, project.id));

    for (const { id } of existingCuts) {
      await tx.delete(cutMapEntries).where(eq(cutMapEntries.cutId, id));
    }
    await tx.delete(cuts).where(eq(cuts.projectId, project.id));

    // Insert cuts
    if (project.cuts.length > 0) {
      await tx.insert(cuts).values(
        project.cuts.map((c) => ({
          id:        c.id,
          projectId: project.id,
          name:      c.name,
          createdAt: new Date(c.createdAt),
        }))
      );

      // Insert cutMap entries
      const allEntries = project.cuts.flatMap((c) =>
        Object.entries(c.cutMap).map(([unitId, status]) => ({
          cutId:  c.id,
          unitId,
          status: status as "cut" | "kept",
        }))
      );
      if (allEntries.length > 0) {
        await tx.insert(cutMapEntries).values(allEntries);
      }
    }
  });
}

/** Delete a project by ID (cascade handles child rows) */
export async function deleteProjectById(id: string): Promise<void> {
  await db.delete(projects).where(eq(projects.id, id));
}
