import { loadEnv } from "../config/env.js";
import { createDatabase } from "./client.js";

async function main() {
  const { pool } = createDatabase(loadEnv());
  try { await pool.query("select 1"); console.info("PostgreSQL connection OK"); }
  finally { await pool.end(); }
}
main().catch(() => { console.error("PostgreSQL connection failed. Check configuration and start the development container."); process.exitCode = 1; });
