import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { createAuth } from "./auth/auth.js";
import { loadEnv } from "./config/env.js";
import { createDatabase } from "./db/client.js";

let env;
try { env = loadEnv(); }
catch (error) { console.error(error instanceof Error ? error.message : "Invalid backend configuration"); process.exit(1); }
const { db, pool } = createDatabase(env);
try { await pool.query("select 1"); }
catch {
  console.error("PostgreSQL unavailable. Check configuration and start the development container.");
  await pool.end();
  process.exit(1);
}
const app = createApp(createAuth(env, db), Boolean(env.GOOGLE_CLIENT_ID), db);

const server = serve(
  { fetch: app.fetch, hostname: env.HOST, port: env.PORT },
  (info) => console.info(`Wangmai API listening on http://${env.HOST}:${info.port}`),
);

let shuttingDown = false;
function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  const timeout = setTimeout(() => process.exit(1), 10_000);
  timeout.unref();
  server.close(async (error) => {
    await pool.end();
    clearTimeout(timeout);
    process.exit(error ? 1 : 0);
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
