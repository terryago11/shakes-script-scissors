import { NextRequest, NextResponse } from "next/server";
import JSZip from "jszip";
import { buildCueScript } from "@/lib/cuts/CueScriptBuilder";
import { exportLineBuddy, lineBuddyFileName, lineBuddyZipFileName } from "@/lib/cuts/LineBuddyExporter";
import type { Play } from "@/types/play";
import type { Actor, ActorAssignment, Cut } from "@/types/project";

interface RequestBody {
  play: Play;
  cut: Cut;
  actors: Actor[];
  assignments: ActorAssignment[];
}

export async function POST(req: NextRequest) {
  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { play, cut, actors, assignments } = body;
  if (!play || !cut || !actors || !assignments) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const zip = new JSZip();

  for (const actor of actors) {
    const cueScript = buildCueScript(play, cut, actor, assignments, cut.characterAliases);
    const html = exportLineBuddy(cueScript, actor);
    zip.file(lineBuddyFileName(actor.name), html);
  }

  const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });
  const zipName = lineBuddyZipFileName(play.title, cut.name);

  return new NextResponse(new Uint8Array(zipBuffer), {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(zipName)}`,
    },
  });
}
