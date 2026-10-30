import { loadEnv } from "../config/env.js";
import { createDatabase } from "./client.js";
import { assertRuntimeRole } from "./role-model.js";

async function main() {
  const env = loadEnv();
  const { pool } = createDatabase(env);
  try {
    await pool.query("select 1");
    if (env.NODE_ENV === "production") await assertRuntimeRole(pool, env.DATABASE_RUNTIME_ROLE!);
    console.info("PostgreSQL runtime connection and privileges OK");
  }
  finally { await pool.end(); }
}
main().catch(() => { console.error("PostgreSQL connection failed. Check configuration and start the development container."); process.exitCode = 1; });
