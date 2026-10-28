import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { loadEnv } from "../config/env.js";
import { createDatabase } from "./client.js";

async function main() {
  const { db, pool } = createDatabase(loadEnv());
  try {
    await migrate(db, { migrationsFolder: fileURLToPath(new URL("../../drizzle", import.meta.url)) });
    console.info("Database migrations applied");
  } finally { await pool.end(); }
}
main().catch(() => { console.error("Migration failed. Check backend environment and development PostgreSQL availability."); process.exitCode = 1; });
