import { NextRequest, NextResponse } from "next/server";
import { exportCastingGridPdf, buildCastingGridFileName } from "@/lib/export/castingGridPdf";
import type { Play } from "@/types/play";
import type { Actor, ActorAssignment, Cut } from "@/types/project";
import type { LineCounts } from "@/types/cut";
import type { StageTimeResult } from "@/lib/cuts/StageTimeEngine";

interface RequestBody {
  play: Play;
  cut: Cut;
  actors: Actor[];
  assignments: ActorAssignment[];
  lineCounts: LineCounts;
  stageTime: StageTimeResult | null;
  characterLinks: Array<[string, string]>;
  projectName?: string;
  optionName?: string;
}

export async function POST(req: NextRequest) {
  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { play, cut, actors, assignments, lineCounts, stageTime, characterLinks, projectName, optionName } = body;
  if (!play || !cut || !actors || !assignments || !lineCounts) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const buf = await exportCastingGridPdf({
    play,
    cut,
    actors,
    assignments,
    lineCounts,
    stageTime,
    characterLinks: characterLinks ?? [],
    projectName,
    optionName,
  });

  const filename = buildCastingGridFileName(projectName ?? play.title);

  return new NextResponse(new Uint8Array(buf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  });
}
