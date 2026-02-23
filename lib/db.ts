import mysql from "mysql2/promise";
import { drizzle } from "drizzle-orm/mysql2";
import * as schema from "@/drizzle/schema";

function decodeEnv(val: string | undefined): string | undefined {
  if (!val) return val;
  // Support base64-encoded values to avoid $ sign mangling in hosting env vars
  if (/^[A-Za-z0-9+/]+=*$/.test(val) && !val.includes(" ") && val.length > 20) {
    try {
      const decoded = Buffer.from(val, "base64").toString("utf-8");
      // Only use decoded value if it looks plausible (printable ASCII)
      if (/^[\x20-\x7E]+$/.test(decoded)) return decoded;
    } catch { /* fall through */ }
  }
  return val;
}

function createDb() {
  const pool = mysql.createPool({
    host:               process.env.DB_HOST!,
    port:               Number(process.env.DB_PORT ?? 3306),
    user:               process.env.DB_USER!,
    password:           decodeEnv(process.env.DB_PASSWORD)!,
    database:           process.env.DB_NAME!,
    connectionLimit:    5,
    waitForConnections: true,
    queueLimit:         10,
    enableKeepAlive:    true,
    keepAliveInitialDelay: 0,
  });
  return drizzle(pool, { schema, mode: "default" });
}

type DbInstance = ReturnType<typeof createDb>;

declare global {
  // eslint-disable-next-line no-var
  var __db: DbInstance | undefined;
}

// Singleton: reuse across hot-reloads in dev, create once in prod
const db: DbInstance = globalThis.__db ?? createDb();
if (process.env.NODE_ENV !== "production") globalThis.__db = db;

export { db };
