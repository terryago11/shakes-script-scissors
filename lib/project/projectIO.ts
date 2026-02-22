import { z } from "zod";
import type { Project } from "@/types/project";

// --- Zod schema for validation on import ---

const ActorSchema = z.object({
  id: z.string(),
  name: z.string(),
  color: z.string(),
});

const AssignmentSchema = z.object({
  characterId: z.string(),
  actorId: z.string(),
});

const CutSchema = z.object({
  id: z.string(),
  name: z.string(),
  createdAt: z.string(),
  cutMap: z.record(z.string(), z.enum(["cut", "kept"])),
});

const ProjectSchema = z.object({
  version: z.number(),
  id: z.string(),
  playId: z.string(),
  playTitle: z.string(),
  actors: z.array(ActorSchema),
  assignments: z.array(AssignmentSchema),
  cuts: z.array(CutSchema).min(1),
  activeCutId: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

/** Download the project as a JSON file */
export function exportProject(project: Project): void {
  const json = JSON.stringify(project, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const safeName = project.playTitle.replace(/[^a-z0-9]/gi, "-").toLowerCase();
  a.href = url;
  a.download = `${safeName}-${project.id.slice(0, 6)}.sss.json`;
  a.click();
  URL.revokeObjectURL(url);
}

/** Parse and validate a project from a JSON string (e.g. from file import) */
export function importProjectFromJson(json: string): Project {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error("Invalid JSON file");
  }
  const result = ProjectSchema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues.map((i) => i.message).join(", ");
    throw new Error(`Invalid project file: ${issues}`);
  }
  return result.data as Project;
}

/** Open a file picker and return the imported Project */
export function importProjectFromFile(): Promise<Project> {
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,.sss.json";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return reject(new Error("No file selected"));
      const text = await file.text();
      try {
        const project = importProjectFromJson(text);
        resolve(project);
      } catch (e) {
        reject(e);
      }
    };
    input.oncancel = () => reject(new Error("Cancelled"));
    input.click();
  });
}
