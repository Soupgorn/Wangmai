import { randomBytes } from "node:crypto";
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { loadEnv } from "../src/config/env.js";
import { createDatabase } from "../src/db/client.js";

/** Browser fixtures must never become discoverable in the developer's real-account app. */
async function main() {
  process.loadEnvFile(fileURLToPath(new URL("../../.env", import.meta.url)));
  const env = loadEnv({ ...process.env, NODE_ENV: "test" });
  const admin = createDatabase(env);
  const name = `wangmai_browser_test_${randomBytes(8).toString("hex")}`;
  if (!/^wangmai_browser_test_[a-f0-9]{16}$/.test(name)) throw new Error("Invalid temporary browser database name.");
  let created = false;
  try {
    await admin.pool.query(`CREATE DATABASE "${name}"`); created = true;
    const url = new URL(env.DATABASE_URL); url.pathname = `/${name}`;
    const target = { ...env, DATABASE_URL: url.href, POSTGRES_DB: name };
    const database = createDatabase(target);
    try { await migrate(database.db, { migrationsFolder: fileURLToPath(new URL("../drizzle", import.meta.url)) }); }
    finally { await database.pool.end(); }
    console.info("Browser tests use an isolated temporary PostgreSQL database.");
    const cli = createRequire(import.meta.url).resolve("@playwright/test/cli");
    const code = await new Promise<number>((resolve, reject) => {
      const child = spawn(process.execPath, [cli, "test", ...process.argv.slice(2)], { stdio: "inherit", env: { ...process.env, DATABASE_URL: url.href, POSTGRES_DB: name } });
      child.once("error", reject); child.once("exit", (status) => resolve(status ?? 1));
    });
    process.exitCode = code;
  } finally {
    // The generated, validated database is owned solely by this invocation.
    if (created) await admin.pool.query(`DROP DATABASE "${name}" WITH (FORCE)`);
    await admin.pool.end();
  }
}
main().catch(() => { console.error("Isolated browser verification failed. Check local PostgreSQL and test logs."); process.exitCode = 1; });
