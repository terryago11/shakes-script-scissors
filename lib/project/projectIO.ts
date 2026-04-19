import { z } from "zod";
import type { Project, Cut, Actor, ActorAssignment } from "@/types/project";
import type { Play } from "@/types/play";
import { generateScriptHtml } from "@/lib/cuts/HtmlExporter";

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
  // Previously missing — were silently stripped on import:
  // Accept both legacy string (v1) and new string[] (v2); coerce string → [string].
  speechReassignments: z.record(
    z.string(),
    z.union([z.string(), z.array(z.string())])
      .transform((v) => (typeof v === "string" ? [v] : v))
  ).optional(),
  characterAliases: z.record(z.string(), z.string()).optional(),
  characterLinks: z.array(z.tuple([z.string(), z.string()])).optional(),
  // Group 15 additions:
  speechSplits: z.record(z.string(), z.object({
    splitAtLineIndex: z.number().int().nonnegative(),
    newCharacterId: z.string().optional(),
  })).optional(),
  insertions: z.record(z.string(), z.object({
    id: z.string(),
    afterUnitId: z.string(),
    characterId: z.string(),
    lines: z.array(z.object({ id: z.string(), text: z.string() })),
  })).optional(),
  stageDurations: z.record(z.string(), z.number()).optional(),
  sdTextEdits: z.record(z.string(), z.string()).optional(),
  deliveryNoteEdits: z.record(z.string(), z.string()).optional(),
  // Group 22B: scene subdivisions
  sceneSubdivisions: z.record(z.string(), z.array(z.object({
    id: z.string(),
    afterUnitId: z.string(),
  }))).optional(),
  // Director-created song/dance SDs inserted after a unit
  insertedSDs: z.record(z.string(), z.object({
    id: z.string(),
    afterUnitId: z.string(),
    text: z.string(),
    characters: z.array(z.string()),
    stageType: z.enum(["entrance", "exit", "business", "delivery"]).optional(),
    isSong: z.boolean().optional(),
    isDance: z.boolean().optional(),
  })).optional(),
  // Per-SD song/dance flag overrides (overrides TEI isSong/isDance per production)
  sdFlagOverrides: z.record(z.string(), z.object({
    isSong: z.boolean().optional(),
    isDance: z.boolean().optional(),
  })).optional(),
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
  actDescriptions: z.record(z.string(), z.string()).optional(),
  sceneDescriptions: z.record(z.string(), z.string()).optional(),
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

/** Download the cut script as a self-contained HTML file */
export function exportScriptHtml(
  play: Play,
  cut: Cut,
  projectName?: string,
  actors?: Actor[],
  assignments?: ActorAssignment[]
): void {
  const html = generateScriptHtml(play, cut, projectName, actors, assignments);
  const blob = new Blob([html], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const displayName = projectName || play.title;
  const safeName = displayName.replace(/[^a-z0-9]/gi, "-").toLowerCase();
  const safeCut = cut.name.replace(/[^a-z0-9]/gi, "-").toLowerCase();
  a.href = url;
  a.download = `${safeName}-${safeCut}.html`;
  a.click();
  URL.revokeObjectURL(url);
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
