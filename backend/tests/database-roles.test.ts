import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import pg from "pg";
import { createApp } from "../src/app.js";
import { createAuth } from "../src/auth/auth.js";
import { loadEnv } from "../src/config/env.js";
import { createDatabase } from "../src/db/client.js";
import { applicationTables, assertMigrationRole, assertRuntimeRole } from "../src/db/role-model.js";
import { seedSession } from "./helpers.js";
import type { BlockDraft, ScheduleResponse } from "@wangmai/shared";

test("isolated production database role contract and application lifecycle", { timeout: 60000 }, async (t) => {
  assert.equal(process.env.WANGMAI_ROLE_TEST, "isolated-disposable");
  const target = new URL(process.env.DATABASE_URL!);
  assert.ok(["localhost", "127.0.0.1"].includes(target.hostname));
  assert.match(target.pathname, /^\/wangmai_roles_[a-f0-9]+$/);
  const env = loadEnv(process.env);
  const { db, pool } = createDatabase(env);
  const migration = new pg.Pool({ connectionString: process.env.ROLE_TEST_MIGRATION_URL, max: 1 });
  try {
    await t.test("runtime and migrator authenticate as distinct nonadministrative identities", async () => {
      await assertRuntimeRole(pool, env.DATABASE_RUNTIME_ROLE!);
      await assertMigrationRole(migration, process.env.ROLE_TEST_MIGRATION_ROLE!);
      assert.equal((await pool.query("SELECT current_user")).rows[0].current_user, env.DATABASE_RUNTIME_ROLE);
      assert.equal((await migration.query("SELECT count(*)::int AS count FROM drizzle.__drizzle_migrations")).rows[0].count, 3);
    });
    await t.test("all seven tables have CRUD only; journal and every sequence are denied", async () => {
      for (const table of applicationTables) {
        const { rows: [row] } = await pool.query("SELECT has_table_privilege(current_user,$1,'SELECT') AS r, has_table_privilege(current_user,$1,'INSERT') AS c, has_table_privilege(current_user,$1,'UPDATE') AS u, has_table_privilege(current_user,$1,'DELETE') AS d", [`public."${table}"`]);
        assert.ok(Object.values(row).every(Boolean));
      }
      for (const query of [
        'CREATE TABLE public.forbidden (id int)', 'CREATE SCHEMA forbidden', 'CREATE TEMP TABLE forbidden (id int)',
        'ALTER TABLE public."user" ADD COLUMN forbidden text', 'DROP TABLE public.verification',
        'TRUNCATE public.session', 'CREATE DATABASE forbidden', 'CREATE ROLE forbidden',
        `ALTER ROLE ${env.DATABASE_RUNTIME_ROLE} SUPERUSER`, `GRANT ${process.env.ROLE_TEST_MIGRATION_ROLE} TO ${env.DATABASE_RUNTIME_ROLE}`,
        `SET ROLE ${process.env.ROLE_TEST_MIGRATION_ROLE}`, `SET ROLE ${process.env.ROLE_TEST_ADMIN_ROLE}`,
        'SELECT * FROM drizzle.__drizzle_migrations', "SELECT nextval('drizzle.__drizzle_migrations_id_seq')",
        'CREATE FUNCTION public.forbidden() RETURNS int LANGUAGE sql AS \'SELECT 1\'',
        'COPY public.session TO PROGRAM \'true\'',
      ]) await assert.rejects(pool.query(query), (error: { code?: string }) => error.code === "42501", query);
      // PostgreSQL may reject this or issue a no-grant-option warning; neither
      // outcome may add the privilege.
      await pool.query(`GRANT TRUNCATE ON public.session TO ${env.DATABASE_RUNTIME_ROLE}`).catch((error: { code?: string }) => { assert.equal(error.code, "42501"); });
      assert.equal((await pool.query("SELECT has_table_privilege(current_user,'public.session','TRUNCATE') AS allowed")).rows[0].allowed, false);
    });
    await t.test("future tables/functions do not silently become runtime accessible", async () => {
      await migration.query("CREATE TABLE public.private_probe (id int)");
      await migration.query("CREATE FUNCTION public.private_probe_fn() RETURNS int LANGUAGE sql AS 'SELECT 1'");
      try {
        await assert.rejects(pool.query("SELECT * FROM public.private_probe"), { code: "42501" });
        await assert.rejects(pool.query("SELECT public.private_probe_fn()"), { code: "42501" });
        await assertRuntimeRole(pool, env.DATABASE_RUNTIME_ROLE!);
      } finally {
        await migration.query("DROP FUNCTION public.private_probe_fn()");
        await migration.query("DROP TABLE public.private_probe");
      }
      // 'pgx_' is an ordinary user schema, not PostgreSQL's reserved 'pg_' prefix.
      await migration.query("CREATE SCHEMA pgx_probe");
      try {
        await migration.query("CREATE TABLE pgx_probe.extra (id int)");
        await migration.query(`GRANT USAGE ON SCHEMA pgx_probe TO ${env.DATABASE_RUNTIME_ROLE}`);
        await migration.query(`GRANT SELECT ON pgx_probe.extra TO ${env.DATABASE_RUNTIME_ROLE}`);
        await assert.rejects(assertRuntimeRole(pool, env.DATABASE_RUNTIME_ROLE!), /privilege contract/);
      } finally { await migration.query("DROP SCHEMA pgx_probe CASCADE"); }
    });
    const auth = createAuth(env, db);
    const app = createApp(auth, true, db);
    const a = await seedSession(auth, env);
    const b = await seedSession(auth, env);
    const request = (actor: typeof a, path: string, method = "GET", body?: unknown, revision?: number) => app.request(`${env.BETTER_AUTH_URL}/api/v1${path}`, {
      method, headers: { cookie: actor.cookie, origin: env.BETTER_AUTH_URL,
        ...(revision !== undefined ? { "If-Match": `"${revision}"` } : {}), ...(body ? { "content-type": "application/json" } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const read = async (): Promise<ScheduleResponse> => (await request(a, "/me/schedule")).json();
    const write = async (path: string, method: string, body?: unknown) => request(a, `/me${path}`, method, body, (await read()).revision);
    await t.test("real Better Auth Google account/session/verification CRUD works using runtime", async () => {
      assert.equal((await request(a, "/me")).status, 200);
      const context = await auth.$context;
      const verification = await context.internalAdapter.createVerificationValue({ identifier: "role-fixture", value: "synthetic-state", expiresAt: new Date(Date.now() + 60000) });
      assert.ok(verification.id);
      assert.ok(await context.internalAdapter.findVerificationValue("role-fixture"));
      await context.internalAdapter.deleteVerificationByIdentifier("role-fixture");
      assert.equal(await context.internalAdapter.findVerificationValue("role-fixture"), null);
      const account = await pool.query("SELECT provider_id FROM public.account WHERE user_id=$1", [a.user.id]);
      assert.equal(account.rows[0].provider_id, "google");
      await pool.query("UPDATE public.account SET access_token=$1 WHERE user_id=$2", ["synthetic-encrypted-fixture", a.user.id]);
      await pool.query("UPDATE public.session SET updated_at=now() WHERE user_id=$1", [a.user.id]);
    });
    await t.test("schedule CRUD, recurring exception, sharing and Who's Free queries work", async () => {
      assert.equal((await read()).shareAvailability, false);
      const draft: BlockDraft = { title: "Role fixture", kind: "available", start: "13:00", end: "17:00", timing: { type: "weekly", weekday: 4 } };
      const created = await write("/schedule/entries", "POST", { mutationId: randomUUID(), entry: draft });
      assert.equal(created.status, 201);
      const weekly = (await read()).blocks[0]!;
      const updated = await write(`/schedule/entries/${weekly.id}`, "PATCH", { title: "Updated role fixture" });
      assert.equal(updated.status, 200);
      const exception = await write(`/schedule/entries/${weekly.id}/exceptions/2026-12-31`, "PUT", { replacement: { title: "Busy fixture", kind: "busy", start: "14:00", end: "15:00", timing: { type: "date", date: "2026-12-31" } } });
      assert.equal(exception.status, 200);
      const share = await write("/schedule/preferences", "PATCH", { shareAvailability: true });
      assert.equal(share.status, 200);
      const query = "/availability?startDate=2026-12-31&endDate=2026-12-31&startTime=13%3A00&endTime=15%3A00&timezone=Asia%2FBangkok";
      const available = await request(b, query);
      assert.equal(available.status, 200);
      const body = await available.json();
      assert.ok(JSON.stringify(body).includes(a.user.id));
      assert.ok(!JSON.stringify(body).includes("Busy fixture"));
      assert.equal((await write("/schedule/preferences", "PATCH", { shareAvailability: false })).status, 200);
      assert.ok(!JSON.stringify(await (await request(b, query)).json()).includes(a.user.id));
      assert.equal((await write(`/schedule/entries/${weekly.id}`, "DELETE")).status, 200);
      assert.equal((await pool.query("SELECT count(*)::int AS count FROM public.schedule_exception WHERE user_id=$1", [a.user.id])).rows[0].count, 0);
      // Retain synthetic rows in every application table for the backup comparison.
      assert.equal((await write("/schedule/entries", "POST", { mutationId: randomUUID(), entry: draft })).status, 201);
      const retained = (await read()).blocks[0]!;
      assert.equal((await write(`/schedule/entries/${retained.id}/exceptions/2026-12-31`, "PUT", { replacement: null })).status, 200);
      await pool.query("INSERT INTO public.verification(id,identifier,value,expires_at) VALUES($1,$2,$3,now()+interval '1 hour')", [randomUUID(), "backup-fixture", "synthetic-only"]);
    });
    await t.test("logout revokes a database-backed session under runtime privileges", async () => {
      const rejected = await app.request(`${env.BETTER_AUTH_URL}/api/auth/sign-out`, { method: "POST", headers: { cookie: b.cookie, origin: "https://evil.invalid", "content-type": "application/json" }, body: "{}" });
      assert.equal(rejected.status, 403);
      const response = await app.request(`${env.BETTER_AUTH_URL}/api/auth/sign-out`, { method: "POST", headers: { cookie: b.cookie, origin: env.BETTER_AUTH_URL, "content-type": "application/json" }, body: "{}" });
      assert.equal(response.status, 200);
      assert.equal((await request(b, "/me")).status, 401);
    });
    await assertRuntimeRole(pool, env.DATABASE_RUNTIME_ROLE!);
  } finally { await pool.end(); await migration.end(); }
});
