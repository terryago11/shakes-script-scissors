import { NextResponse } from "next/server";

export async function GET() {
  const config = {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    passwordLength: process.env.DB_PASSWORD?.length,
    database: process.env.DB_NAME,
    nodeEnv: process.env.NODE_ENV,
  };

  try {
    const { db } = await import("@/lib/db");
    const result = await db.execute("SELECT 1 as ok");
    return NextResponse.json({ config, dbResult: "connected", result });
  } catch (e: unknown) {
    const err = e as Error & { code?: string };
    return NextResponse.json(
      { config, error: err.message, code: err.code },
      { status: 500 }
    );
  }
}
