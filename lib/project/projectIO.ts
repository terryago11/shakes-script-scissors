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
  lineCutMap: z.record(z.string(), z.enum(["cut", "kept"])).optional(),
  speechEdits: z.record(z.string(), z.unknown()).optional(),
  sceneOrder: z.array(z.string()).optional(),
  stageDirectionEdits: z.record(z.string(), z.array(z.string())).optional(),
  pauses: z.record(z.string(), z.object({ name: z.string(), minutes: z.number() })).optional(),
});

const ProjectSchema = z.object({
  version: z.number(),
  id: z.string(),
  playId: z.string(),
  playTitle: z.string(),
  name: z.string().optional(),
  settings: z.object({
    wordsPerMinute: z.number(),
    quickChangeThresholdMinutes: z.number().optional(),
  }).optional(),
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
  const displayName = project.name || project.playTitle;
  const safeName = displayName.replace(/[^a-z0-9]/gi, "-").toLowerCase();
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, "0");
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const yyyy = String(now.getFullYear());
  const hh = String(now.getHours()).padStart(2, "0");
  const min = String(now.getMinutes()).padStart(2, "0");
  const sss = String(now.getMilliseconds()).padStart(3, "0");
  const timestamp = `${dd}${mm}${yyyy}-${hh}${min}-${sss}`;
  a.href = url;
  a.download = `${safeName}+${timestamp}.sss.json`;
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

// --- URL-based sharing (compress → base64url) ---

/** Encode a project to a compact base64url string for use in a share URL */
export async function encodeProjectForUrl(project: Project): Promise<string> {
  const json = JSON.stringify(project);
  const bytes = new TextEncoder().encode(json);
  const cs = new CompressionStream("gzip");
  const writer = cs.writable.getWriter();
  writer.write(bytes);
  writer.close();
  const compressed = await new Response(cs.readable).arrayBuffer();
  // Convert to base64url (URL-safe, no padding issues)
  const b64 = btoa(String.fromCharCode(...new Uint8Array(compressed)));
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

/** Decode a share URL payload back into a Project (throws on bad data) */
export async function decodeProjectFromUrl(encoded: string): Promise<Project> {
  // Restore base64 from base64url
  const b64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  const ds = new DecompressionStream("gzip");
  const writer = ds.writable.getWriter();
  writer.write(bytes);
  writer.close();
  const decompressed = await new Response(ds.readable).arrayBuffer();
  const json = new TextDecoder().decode(decompressed);
  return importProjectFromJson(json);
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
