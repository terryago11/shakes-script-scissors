import { NextResponse } from "next/server";
import { PLAYS } from "@/lib/folger/FolgerClient";

export async function GET() {
  return NextResponse.json(PLAYS);
}
