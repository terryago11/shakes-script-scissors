import { NextRequest, NextResponse } from "next/server";
import { renderScriptDocx, type ScriptDocxViewMode } from "@/lib/export/renderScriptDocx";
import { sanitizeName } from "@/lib/export/cueScriptPdf";
import type { Play } from "@/types/play";
import type { Cut } from "@/types/project";

interface RequestBody {
  play: Play;
  cut: Cut;
  viewMode: ScriptDocxViewMode;
  projectName?: string;
}

export async function POST(req: NextRequest) {
  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { play, cut, viewMode, projectName } = body;
  if (!play || !cut || !viewMode) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }
  if (viewMode !== "clean" && viewMode !== "standard") {
    return NextResponse.json({ error: "Invalid viewMode" }, { status: 400 });
  }

  const docxBuffer = await renderScriptDocx(play, cut, viewMode, projectName);
  const _now = new Date();
  const _dd = String(_now.getDate()).padStart(2, "0");
  const _mm = String(_now.getMonth() + 1).padStart(2, "0");
  const _hh = String(_now.getHours()).padStart(2, "0");
  const _min = String(_now.getMinutes()).padStart(2, "0");
  const _suffix = `${_dd}-${_mm}-${_now.getFullYear()}--${_hh}-${_min}`;
  const filename = `${sanitizeName(play.title)}_${sanitizeName(cut.name)}_${viewMode}_${_suffix}.docx`;

  return new NextResponse(new Uint8Array(docxBuffer), {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  });
}
