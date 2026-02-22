import { NextRequest, NextResponse } from "next/server";
import { fetchPlayXml, PLAYS } from "@/lib/folger/FolgerClient";
import { parseTei } from "@/lib/folger/TeiParser";
import { getCachedPlay, setCachedPlay } from "@/lib/folger/PlayCache";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ playId: string }> }
) {
  const { playId } = await params;

  if (!PLAYS.find((p) => p.id === playId)) {
    return NextResponse.json({ error: `Unknown play ID: "${playId}"` }, { status: 404 });
  }

  const cached = getCachedPlay(playId);
  if (cached) {
    return NextResponse.json(cached);
  }

  try {
    const xml = await fetchPlayXml(playId);
    const play = parseTei(xml, playId);
    setCachedPlay(playId, play);
    return NextResponse.json(play);
  } catch (e) {
    console.error(`[/api/play/${playId}] Error:`, e);
    return NextResponse.json(
      { error: String(e instanceof Error ? e.message : e) },
      { status: 500 }
    );
  }
}
