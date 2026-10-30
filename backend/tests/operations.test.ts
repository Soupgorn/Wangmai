import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import type pg from "pg";
import type { Auth } from "../src/auth/auth.js";
import { createApp } from "../src/app.js";
import { databaseReadiness, drainServer, waitForDatabase } from "../src/operations.js";

test("liveness survives dependency failure while readiness is generic, uncached and recoverable", async () => {
  let available = false;
  const app = createApp({} as Auth, false, undefined, async () => available);
  assert.equal((await app.request("/api/health")).status, 200);
  const failed = await app.request("/api/ready");
  assert.equal(failed.status, 503);
  assert.equal(failed.headers.get("cache-control"), "no-store");
  assert.deepEqual(await failed.json(), { status: "unavailable" });
  available = true;
  assert.equal((await app.request("/api/ready")).status, 200);
  const broken = createApp({} as Auth, false, undefined, async () => { throw new Error("sensitive-database-uri"); });
  assert.equal(await (await broken.request("/api/ready")).text(), '{"status":"unavailable"}');
});

test("authentication bodies are limited before cloning/parsing, with or without content length", async () => {
  let called = 0;
  const app = createApp({ handler: async () => { called++; return Response.json({ ok: true }); } } as unknown as Auth, true);
  for (const headers of [{}, { "content-length": "70000" }]) {
    const response = await app.request("/api/auth/sign-in/social", { method: "POST", headers, body: "x".repeat(70000) });
    assert.equal(response.status, 413);
    assert.equal(called, 0);
  }
  const response = await app.request("/api/auth/sign-in/social", { method: "POST", body: JSON.stringify({ provider: "google" }) });
  assert.equal(response.status, 200);
  assert.equal(called, 1);
});

test("unexpected errors correlate with a server-generated id without logging private inputs", async (t) => {
  const logged: string[] = [];
  t.mock.method(console, "error", (value: string) => { logged.push(value); });
  const auth = { api: { getSession: async () => { throw new Error("postgresql://secret:password@private/schedule"); } } } as unknown as Auth;
  const response = await createApp(auth, true).request("/api/v1/me?code=private-oauth-code", { headers: { cookie: "session=private-token", "x-request-id": "attacker" } });
  assert.equal(response.status, 503);
  const id = response.headers.get("x-request-id");
  assert.match(id!, /^[0-9a-f-]{36}$/);
  assert.equal(JSON.parse(logged[0]!).requestId, id);
  assert.ok(!JSON.stringify(logged).match(/password|private|attacker|postgresql|cookie|code=/));
  assert.ok(!(await response.text()).includes("secret"));
});

test("readiness queries are bounded and coalesced instead of building a probe backlog", async () => {
  let finish!: () => void;
  let calls = 0;
  const pool = { query: (options: { query_timeout: number }) => { calls++; assert.equal(options.query_timeout, 1500); return new Promise<void>((resolve) => { finish = resolve; }); } } as unknown as pg.Pool;
  const probe = databaseReadiness(pool);
  const a = probe(); const b = probe();
  assert.equal(calls, 1);
  finish();
  assert.deepEqual(await Promise.all([a, b]), [true, true]);
});

test("startup retries transient connectivity only and respects cancellation", async () => {
  let calls = 0;
  await waitForDatabase(async () => { if (++calls < 3) throw Object.assign(new Error(), { code: "ECONNREFUSED" }); }, new AbortController().signal, 0);
  assert.equal(calls, 3);
  calls = 0;
  await assert.rejects(waitForDatabase(async () => { calls++; throw Object.assign(new Error(), { code: "28P01" }); }, new AbortController().signal, 0));
  assert.equal(calls, 1);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(waitForDatabase(async () => { throw new Error(); }, controller.signal, 0), { name: "AbortError" });
});

test("graceful shutdown completes an in-flight response before closing the database pool", async () => {
  let received!: () => void;
  const active = new Promise<void>((resolve) => { received = resolve; });
  let ended = false;
  const server = createServer((_req, res) => { received(); setTimeout(() => { ended = true; res.end("complete"); }, 80); });
  server.keepAliveTimeout = 50;
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;
  const response = fetch(`http://127.0.0.1:${port}`);
  await active;
  assert.equal(await drainServer(server, async () => { assert.equal(ended, true); }, 1000), true);
  assert.equal(await (await response).text(), "complete");
});

test("a stuck connection has a finite shutdown deadline", async () => {
  let forced = false;
  const result = await drainServer({ close: () => {}, closeAllConnections: () => { forced = true; } }, async () => {}, 20);
  assert.equal(result, false);
  assert.equal(forced, true);
});
