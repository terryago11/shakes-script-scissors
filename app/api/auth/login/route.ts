import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getIronSession } from "iron-session";
import { sessionOptions, type SessionData } from "@/lib/session";
import { cookies } from "next/headers";

export async function POST(req: NextRequest) {
  if (process.env.AUTH_DISABLED === "true") {
    return NextResponse.json({ ok: true });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body.password !== "string") {
    return NextResponse.json({ error: "Missing password" }, { status: 400 });
  }

  const rawHash = process.env.AUTH_PASSWORD_HASH;
  if (!rawHash) {
    console.error("[login] AUTH_PASSWORD_HASH env var is not set");
    return NextResponse.json({ error: "Auth not configured" }, { status: 500 });
  }
  // Support base64-encoded hashes (avoids $ sign escaping issues in hosting env vars)
  const hash = rawHash.startsWith("$")
    ? rawHash
    : Buffer.from(rawHash, "base64").toString("utf-8");

  const valid = await bcrypt.compare(body.password, hash);
  if (!valid) {
    return NextResponse.json({ error: "Invalid password" }, { status: 401 });
  }

  const session = await getIronSession<SessionData>(
    await cookies(),
    sessionOptions()
  );
  session.isLoggedIn = true;
  await session.save();

  return NextResponse.json({ ok: true });
}
