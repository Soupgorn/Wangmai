import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { eq, getTableColumns } from "drizzle-orm";
import { getAuthTables } from "better-auth/db";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createApp } from "../src/app.js";
import { createAuth } from "../src/auth/auth.js";
import { loadEnv } from "../src/config/env.js";
import { createDatabase } from "../src/db/client.js";
import * as schema from "../src/db/schema.js";
import { seedSession, signedCookie } from "./helpers.js";

test("PostgreSQL migrations and real Better Auth session lifecycle", { timeout: 60_000 }, async (t) => {
  const localEnv = loadEnv({ ...process.env, NODE_ENV: "test" });
  const admin = createDatabase(localEnv);
  const name = `wangmai_auth_test_${randomBytes(8).toString("hex")}`;
  // Only this generated database is dropped; the development database is never reset.
  assert.match(name, /^wangmai_auth_test_[a-f0-9]{16}$/);
  await admin.pool.query(`CREATE DATABASE "${name}"`);
  const url = new URL(localEnv.DATABASE_URL); url.pathname = `/${name}`;
  const env = loadEnv({ ...process.env, NODE_ENV: "test", DATABASE_URL: url.href, POSTGRES_DB: name });
  const { db, pool } = createDatabase(env);
  try {
    await t.test("connectivity and fresh migrations are repeatable", async () => {
      assert.equal((await pool.query("select 1 as ok")).rows[0].ok, 1);
      const config = { migrationsFolder: fileURLToPath(new URL("../drizzle", import.meta.url)) };
      await migrate(db, config); await migrate(db, config);
      const tables = await pool.query("select table_name from information_schema.tables where table_schema='public'");
      assert.deepEqual(tables.rows.map((row) => row.table_name).sort(), ["account", "schedule_entry", "schedule_exception", "schedule_preference", "session", "user", "verification"]);
    });
    const auth = createAuth(env, db);
    const app = createApp(auth, false);
    const request = (path: string, init?: RequestInit) => app.request(`${env.BETTER_AUTH_URL}${path}`, init);
    const seeded = await seedSession(auth, env);
    await t.test("Drizzle fields match the installed Better Auth core schema", () => {
      const tables = getAuthTables(auth.options);
      for (const model of ["user", "session", "account", "verification"] as const) {
        const columns = getTableColumns(schema[model]);
        for (const field of Object.keys(tables[model]!.fields)) assert.ok(field in columns, `${model}.${field} missing`);
      }
    });
    await t.test("health stays public and uncached; auth handler is mounted", async () => {
      const health = await request("/api/health");
      assert.equal(health.status, 200); assert.equal(health.headers.get("cache-control"), "no-store");
      assert.deepEqual(await health.json(), { status: "ok", service: "wangmai-api" });
      assert.equal((await request("/api/auth/get-session")).status, 200);
      assert.equal(await (await request("/api/auth/get-session")).json(), null);
    });
    await t.test("missing or tampered cookies and client user IDs cannot authenticate", async () => {
      for (const cookie of ["", `${seeded.cookie}tampered`, "better-auth.session_token=invalid"]) {
        assert.equal((await request(`/api/v1/me?userId=${seeded.user.id}`, { headers: { cookie, "x-user-id": seeded.user.id } })).status, 401);
      }
    });
    await t.test("server validates a persisted session and returns only basic profile", async () => {
      const response = await request("/api/v1/me?userId=someone-else", { headers: { cookie: seeded.cookie } });
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { user: { id: seeded.user.id, name: seeded.user.name, email: seeded.user.email, emailVerified: true, image: null } });
      const restarted = createApp(createAuth(env, db), false);
      assert.equal((await restarted.request(`${env.BETTER_AUTH_URL}/api/v1/me`, { headers: { cookie: seeded.cookie } })).status, 200);
      const ctx = await auth.$context;
      const existing = await ctx.internalAdapter.findAccountOwnerByKey({ providerId: "google", accountId: (await db.select().from(schema.account))[0]!.accountId });
      assert.equal(existing?.kind, "owned");
      assert.equal(existing?.kind === "owned" ? existing.user.id : null, seeded.user.id);
    });
    await t.test("expired sessions fail and database outages return a sanitized error", async () => {
      const expired = await (await auth.$context).internalAdapter.createSession(seeded.user.id, false, { expiresAt: new Date(Date.now() - 1000) });
      await db.update(schema.session).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(schema.session.id, expired.id));
      assert.equal((await request("/api/v1/me", { headers: { cookie: await signedCookie(auth, env, expired.token) } })).status, 401);
      const brokenUrl = new URL(env.DATABASE_URL); brokenUrl.port = "1";
      const broken = createDatabase({ ...env, DATABASE_URL: brokenUrl.href, POSTGRES_PORT: 1 });
      try {
        const unavailable = await createApp(createAuth(env, broken.db), false).request(`${env.BETTER_AUTH_URL}/api/v1/me`, { headers: { cookie: seeded.cookie } });
        assert.equal(unavailable.status, 503);
        assert.deepEqual(await unavailable.json(), { error: "Service temporarily unavailable. Please try again." });
      } finally { await broken.pool.end(); }
    });
    await t.test("session refresh persists expiry and forwards the renewed cookie from me", async () => {
      const refreshing = await (await auth.$context).internalAdapter.createSession(seeded.user.id);
      await db.update(schema.session).set({
        createdAt: new Date(Date.now() - 2 * 86400_000), updatedAt: new Date(Date.now() - 2 * 86400_000),
        expiresAt: new Date(Date.now() + 5 * 86400_000),
      }).where(eq(schema.session.id, refreshing.id));
      const response = await request("/api/v1/me", { headers: { cookie: await signedCookie(auth, env, refreshing.token) } });
      assert.equal(response.status, 200);
      assert.ok(response.headers.getSetCookie().some((cookie) => cookie.includes("HttpOnly") && cookie.includes("SameSite=Lax")));
      const [renewed] = await db.select().from(schema.session).where(eq(schema.session.id, refreshing.id));
      assert.ok(renewed!.expiresAt.valueOf() > Date.now() + 6 * 86400_000);
    });
    await t.test("missing Google configuration has an actionable response; invalid callbacks fail", async () => {
      const response = await request("/api/auth/sign-in/social", { method: "POST", headers: { "content-type": "application/json", origin: env.BETTER_AUTH_URL }, body: JSON.stringify({ provider: "google" }) });
      assert.equal(response.status, 503);
      assert.equal((await response.json()).code, "GOOGLE_NOT_CONFIGURED");
      const callback = await request("/api/auth/callback/google?error=access_denied");
      assert.ok(callback.status >= 300);
    });
    await t.test("extra scopes, direct tokens and alternate providers are rejected before OAuth", async () => {
      const mounted = createApp(auth, true);
      for (const body of [
        { provider: "github" },
        { provider: "google", scopes: ["https://www.googleapis.com/auth/calendar"] },
        { provider: "google", additionalParams: { scope: "calendar" } },
        { provider: "google", idToken: { token: "untrusted" } },
      ]) {
        assert.equal((await mounted.request(`${env.BETTER_AUTH_URL}/api/auth/sign-in/social`, {
          method: "POST", headers: { origin: env.BETTER_AUTH_URL, "content-type": "application/json" }, body: JSON.stringify(body),
        })).status, 400);
      }
      assert.equal((await request("/api/auth/link-social", { method: "POST", headers: { origin: env.BETTER_AUTH_URL, "content-type": "application/json" }, body: JSON.stringify({ provider: "google" }) })).status, 404);
    });
    await t.test("production cookies are Secure, HttpOnly, host scoped and SameSite=Lax", async () => {
      const secure = createAuth({ ...env, NODE_ENV: "production", BETTER_AUTH_URL: "https://wangmai.example.com" }, db);
      const cookie = (await secure.$context).authCookies.sessionToken;
      assert.equal(cookie.attributes.secure, true); assert.equal(cookie.attributes.httpOnly, true);
      assert.equal(cookie.attributes.sameSite, "lax"); assert.equal(cookie.attributes.domain, undefined);
      assert.match(cookie.name, /^__Secure-/);
    });
    await t.test("CSRF protection and logout revocation", async () => {
      const options = { method: "POST", headers: { cookie: seeded.cookie, origin: "https://evil.example", "content-type": "application/json" }, body: "{}" };
      assert.equal((await request("/api/auth/sign-out", options)).status, 403);
      const response = await request("/api/auth/sign-out", { ...options, headers: { ...options.headers, origin: env.BETTER_AUTH_URL } });
      assert.equal(response.status, 200);
      assert.ok(response.headers.getSetCookie().some((cookie) => cookie.includes("Max-Age=0")));
      assert.equal((await request("/api/v1/me", { headers: { cookie: seeded.cookie } })).status, 401);
      assert.equal((await db.select().from(schema.session).where(eq(schema.session.token, seeded.session.token))).length, 0);
    });
  } finally {
    await pool.end();
    await admin.pool.query(`DROP DATABASE "${name}" WITH (FORCE)`);
    await admin.pool.end();
  }
});
