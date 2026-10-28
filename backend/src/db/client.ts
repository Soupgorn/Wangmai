import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { validateDatabaseTarget, type DatabaseTarget } from "../config/env.js";
import * as schema from "./schema.js";

export function createDatabase(env: DatabaseTarget, options?: { options: string }) {
  validateDatabaseTarget(env);
  const pool = new pg.Pool({
    connectionString: env.DATABASE_URL,
    max: 10, connectionTimeoutMillis: 5_000, idleTimeoutMillis: 30_000,
    statement_timeout: 10_000, ...options,
  });
  pool.on("error", () => console.error("PostgreSQL pool connection failed"));
  return { db: drizzle(pool, { schema }), pool };
}
export type Database = ReturnType<typeof createDatabase>["db"];
