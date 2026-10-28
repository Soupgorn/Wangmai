import { serve } from "@hono/node-server";
import { app } from "./app.js";
import { env } from "./config/env.js";

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
  server.close((error) => {
    clearTimeout(timeout);
    process.exit(error ? 1 : 0);
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
