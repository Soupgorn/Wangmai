import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrationEnvironment } from "./operator-env.js";
import { assertMigrationRole, grantRuntimeTables } from "./role-model.js";

async function main() {
  const env = migrationEnvironment();
  if (process.argv.slice(2).some((arg) => arg !== "--grant-only")) throw new Error("Unsupported migration option");
  const pool = new pg.Pool({ connectionString: env.connectionString, max: 1, connectionTimeoutMillis: 5000, statement_timeout: 60000 });
  pool.on("error", () => console.error("Migration database connection failed"));
  try {
    if (env.production) await assertMigrationRole(pool, env.migrationRole!);
    // Session advisory lock covers Drizzle's transaction and the following grants.
    await pool.query("SELECT pg_advisory_lock(628621002)");
    try {
      if (!process.argv.includes("--grant-only")) await migrate(drizzle(pool), { migrationsFolder: fileURLToPath(new URL("../../drizzle", import.meta.url)) });
      if (env.production) {
        await pool.query("BEGIN");
        try { await grantRuntimeTables(pool, env.runtimeRole!); await pool.query("COMMIT"); }
        catch (error) { await pool.query("ROLLBACK"); throw error; }
      }
    } finally { await pool.query("SELECT pg_advisory_unlock(628621002)"); }
    console.info("Database migration/permission operation completed");
  } finally { await pool.end(); }
}
main().catch((error: unknown) => {
  const candidate = error as { code?: unknown; cause?: { code?: unknown } };
  const code = candidate.cause?.code ?? candidate.code;
  const state = typeof code === "string" && /^[A-Z0-9]{5}$/.test(code) ? ` (SQLSTATE ${code})` : "";
  console.error(`Migration failed${state}. Check the separate migration configuration, role contract and database availability.`);
  process.exitCode = 1;
});
