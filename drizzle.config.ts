import type { Config } from "drizzle-kit";

export default {
  schema:   "./drizzle/schema.ts",
  out:      "./drizzle/migrations",
  dialect:  "mysql",
  dbCredentials: {
    host:     process.env.DB_HOST!,
    port:     Number(process.env.DB_PORT ?? 3306),
    user:     process.env.DB_USER!,
    password: process.env.DB_PASSWORD!,
    database: process.env.DB_NAME!,
  },
} satisfies Config;
