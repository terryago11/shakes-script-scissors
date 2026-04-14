import { NextRequest, NextResponse } from "next/server";
import { buildCueScript } from "@/lib/cuts/CueScriptBuilder";
import { renderCueScriptsDocx } from "@/lib/export/cueScriptDocx";
import { buildDocxFileName } from "@/lib/export/cueScriptPdf";
import { resolveCharacterName } from "@/lib/project/projectUtils";
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

  const scripts = actors.map((actor) => ({
    cueScript: buildCueScript(play, cut, actor, assignments, cut.characterAliases),
    characterNames: assignments
      .filter((a) => a.actorId === actor.id)
      .map((a) => resolveCharacterName(a.characterId, cut.characterAliases, play.castList)),
  }));

  const docxBuffer = await renderCueScriptsDocx(scripts);
  const docxName = buildDocxFileName(play.title, cut.name);

  return new NextResponse(new Uint8Array(docxBuffer), {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(docxName)}`,
    },
  });
}
