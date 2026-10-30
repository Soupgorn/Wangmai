import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { createAuth } from "./auth/auth.js";
import { loadEnv } from "./config/env.js";
import { createDatabase } from "./db/client.js";
import { assertRuntimeRole } from "./db/role-model.js";
import { databaseReadiness, drainServer, waitForDatabase } from "./operations.js";

let env;
try { env = loadEnv(); }
catch (error) { console.error(error instanceof Error ? error.message : "Invalid backend configuration"); process.exit(1); }
const { db, pool } = createDatabase(env);
const stop = new AbortController();
const listener: { server?: ReturnType<typeof serve> } = {};
let shuttingDown = false;
let poolClose: Promise<void> | undefined;
const endPool = () => poolClose ??= pool.end();
async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  stop.abort();
  console.info(JSON.stringify({ event: "shutdown_started" }));
  if (listener.server) {
    const clean = await drainServer(listener.server, endPool);
    console.info(JSON.stringify({ event: clean ? "shutdown_complete" : "shutdown_forced" }));
    process.exit(clean ? 0 : 1);
  }
  const deadline = setTimeout(() => process.exit(1), 25000);
  try { await endPool(); clearTimeout(deadline); process.exit(0); }
  catch { process.exit(1); }
}
process.once("SIGINT", () => { void shutdown(); });
process.once("SIGTERM", () => { void shutdown(); });
try {
  await waitForDatabase(() => pool.query("select 1"), stop.signal);
  if (env.NODE_ENV === "production") await assertRuntimeRole(pool, env.DATABASE_RUNTIME_ROLE!);
}
catch {
  if (!shuttingDown) console.error("Startup blocked: database unavailable or runtime privilege contract failed.");
  await endPool();
  process.exit(shuttingDown ? 0 : 1);
}
const checkDatabase = databaseReadiness(pool);
const app = createApp(createAuth(env, db), Boolean(env.GOOGLE_CLIENT_ID), db, () => shuttingDown ? Promise.resolve(false) : checkDatabase());

const server = listener.server = serve(
  { fetch: app.fetch, hostname: env.HOST, port: env.PORT },
  () => console.info(JSON.stringify({ event: "api_listening" })),
);
// Bound slow/incomplete HTTP uploads independently of SQL statement timeouts.
if ("requestTimeout" in server) server.requestTimeout = 30000;
if ("headersTimeout" in server) server.headersTimeout = 15000;
