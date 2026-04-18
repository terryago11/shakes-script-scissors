import { NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { sessionOptions, type SessionData } from "@/lib/session";
import { cookies } from "next/headers";

export async function GET() {
  if (process.env.AUTH_DISABLED === "true") {
    return NextResponse.json({ isLoggedIn: true });
  }
  const session = await getIronSession<SessionData>(
    await cookies(),
    sessionOptions()
  );
  return NextResponse.json({ isLoggedIn: session.isLoggedIn === true });
}
