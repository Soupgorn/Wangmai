import assert from "node:assert/strict";
import test from "node:test";
import { frontendReadiness, internalApiOrigin } from "../api-origin";

test("production internal API origin is explicit and rejects credentials, paths and URL overrides", () => {
  assert.equal(internalApiOrigin({ NODE_ENV: "development" }), "http://127.0.0.1:4000");
  assert.equal(internalApiOrigin({ NODE_ENV: "production", API_INTERNAL_ORIGIN: "http://backend:4000" }), "http://backend:4000");
  for (const value of [undefined, "file:///etc/passwd", "http://user:secret@backend", "http://backend/api", "http://backend/", "http://backend?host=evil"]) {
    assert.throws(() => internalApiOrigin({ NODE_ENV: "production", ...(value ? { API_INTERNAL_ORIGIN: value } : {}) }),
      (error: Error) => error.message === "Internal API origin is missing or invalid");
  }
});
test("frontend readiness reflects dependencies without forwarding credentials or exposing errors", async () => {
  const source: NodeJS.ProcessEnv = { NODE_ENV: "production", API_INTERNAL_ORIGIN: "http://backend:4000" };
  const healthy = (async (url, options) => {
    assert.equal(url, "http://backend:4000/api/ready");
    assert.equal(options?.cache, "no-store");
    assert.equal(options?.headers, undefined);
    return Response.json({ status: "ok" });
  }) as typeof fetch;
  assert.equal((await frontendReadiness(healthy, source)).status, 200);
  const unavailable = await frontendReadiness(async () => { throw new Error("http://secret@private/database"); }, source);
  assert.equal(unavailable.status, 503);
  assert.deepEqual(await unavailable.json(), { status: "unavailable" });
  assert.equal(unavailable.headers.get("cache-control"), "no-store");
});
