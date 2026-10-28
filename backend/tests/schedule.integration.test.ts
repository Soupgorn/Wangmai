import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import type { BlockDraft, ScheduleResponse } from "@wangmai/shared";
import { createApp } from "../src/app.js";
import { createAuth } from "../src/auth/auth.js";
import { loadEnv } from "../src/config/env.js";
import { createDatabase } from "../src/db/client.js";
import { scheduleEntry, scheduleException } from "../src/db/schema.js";
import { seedSession, signedCookie } from "./helpers.js";

test("private PostgreSQL schedule lifecycle", { timeout: 60_000 }, async (t) => {
  const env = loadEnv({ ...process.env, NODE_ENV: "test" });
  const admin = createDatabase(env);
  const name = `wangmai_schedule_test_${randomBytes(8).toString("hex")}`;
  assert.match(name, /^wangmai_schedule_test_[a-f0-9]{16}$/);
  await admin.pool.query(`CREATE DATABASE "${name}"`);
  const url = new URL(env.DATABASE_URL); url.pathname = `/${name}`;
  const database = createDatabase({ ...env, DATABASE_URL: url.href, POSTGRES_DB: name });
  const { db, pool } = database;
  try {
    await migrate(db, { migrationsFolder: fileURLToPath(new URL("../drizzle", import.meta.url)) });
    await migrate(db, { migrationsFolder: fileURLToPath(new URL("../drizzle", import.meta.url)) });
    const auth = createAuth(env, db); const app = createApp(auth, true, db);
    const a = await seedSession(auth, env); const b = await seedSession(auth, env);
    type Actor = { cookie: string };
    const request = (actor: Actor | null, path: string, method = "GET", body?: unknown, revision?: number, origin = env.BETTER_AUTH_URL) => app.request(`${env.BETTER_AUTH_URL}/api/v1/me${path}`, {
      method, headers: { ...(actor ? { cookie: actor.cookie } : {}), origin, ...(revision !== undefined ? { "If-Match": `"${revision}"` } : {}), ...(body !== undefined ? { "content-type": "application/json" } : {}) }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    const read = async (actor = a): Promise<ScheduleResponse> => {
      const response = await request(actor, "/schedule"); assert.equal(response.status, 200);
      assert.equal(response.headers.get("cache-control"), "no-store");
      return response.json();
    };
    const write = async (actor: Actor, path: string, method: string, body?: unknown) => request(actor, path, method, body, (await read(actor as typeof a)).revision);
    const draft = (title: string, timing: BlockDraft["timing"] = { type: "weekly", weekday: 1 }, kind: BlockDraft["kind"] = "available"): BlockDraft => ({ title, kind, start: "09:00", end: "12:00", timing });
    const create = async (value: BlockDraft, actor = a) => {
      const response = await write(actor, "/schedule/entries", "POST", { entry: value, mutationId: randomUUID() });
      assert.equal(response.status, 201); const valueAfter: ScheduleResponse = await response.json();
      return valueAfter.blocks.find((block) => block.title === value.title)!;
    };
    let weekly: ScheduleResponse["blocks"][number];
    let dated: ScheduleResponse["blocks"][number];
    await t.test("fresh migration, empty private schedule, required revision and unauthenticated requests", async () => {
      assert.deepEqual(await read(), { timezone: "Asia/Bangkok", revision: 0, blocks: [] });
      for (const [path, method] of [["/schedule", "GET"], ["/schedule/entries", "POST"], [`/schedule/entries/${randomUUID()}`, "PATCH"], [`/schedule/entries/${randomUUID()}`, "DELETE"], ["/availability/weekly", "GET"], ["/availability/weekly", "PUT"], ["/schedule/preferences", "PATCH"]]) {
        assert.equal((await request(null, path!, method, method === "GET" ? undefined : {})).status, 401);
      }
      assert.equal((await request(a, "/schedule/entries", "POST", { entry: draft("No revision"), mutationId: randomUUID() })).status, 428);
    });
    await t.test("create and read weekly availability and a date-specific overlapping busy block", async () => {
      weekly = await create(draft("Weekly time"));
      dated = await create({ ...draft("Private appointment", { type: "date", date: "2026-11-02" }, "busy"), start: "10:00", end: "11:00" });
      const current = await read(); assert.equal(current.blocks.length, 2);
      assert.equal(weekly.ownerId, a.user.id); assert.ok(weekly.createdAt); assert.ok(weekly.updatedAt);
      assert.deepEqual(weekly.timing, { type: "weekly", weekday: 1 });
      assert.deepEqual(dated.timing, { type: "date", date: "2026-11-02" });
      const weeklyResponse = await request(a, "/availability/weekly");
      assert.deepEqual((await weeklyResponse.json()).blocks.map((row: { id: string }) => row.id), [weekly.id]);
    });
    await t.test("ownership protects reads, updates, deletes and dated overrides", async () => {
      const otherRead = await request(b, `/schedule?userId=${a.user.id}`);
      assert.deepEqual((await otherRead.json()).blocks, []);
      for (const [path, method, body] of [
        [`/schedule/entries/${weekly.id}`, "PATCH", { title: "Stolen" }],
        [`/schedule/entries/${weekly.id}`, "DELETE", undefined],
        [`/schedule/entries/${weekly.id}/exceptions/2026-11-02`, "PUT", { replacement: null }],
        [`/schedule/entries/${weekly.id}/exceptions/2026-11-02`, "DELETE", undefined],
      ] as const) assert.equal((await write(b, path, method, body)).status, 404);
      assert.equal((await read()).blocks[0]!.title, "Weekly time");
      assert.equal((await write(a, "/schedule/entries", "POST", { entry: { ...draft("Injected"), ownerId: b.user.id }, mutationId: randomUUID() })).status, 400);
    });
    await t.test("partial edits and stale-revision protection", async () => {
      const old = await read();
      const response = await write(a, `/schedule/entries/${weekly.id}`, "PATCH", { title: "Weekly quiet time", end: "13:00" });
      assert.equal(response.status, 200);
      assert.equal((await read()).blocks.find((row) => row.id === weekly.id)!.end, "13:00");
      assert.equal((await request(a, `/schedule/entries/${weekly.id}`, "PATCH", { title: "Stale" }, old.revision)).status, 409);
      assert.equal((await read()).blocks[0]!.title, "Weekly quiet time");
    });
    await t.test("date-specific replacements, cancellation and restoring one occurrence", async () => {
      const path = `/schedule/entries/${weekly.id}/exceptions/2026-11-02`;
      const replacement = { ...draft("One Monday", { type: "date", date: "2026-11-02" }), start: "15:00", end: "16:00" };
      assert.equal((await write(a, path, "PUT", { replacement })).status, 200);
      let current = await read();
      assert.deepEqual(current.blocks.find((row) => row.id === weekly.id)!.excludedDates, ["2026-11-02"]);
      assert.equal(current.blocks.find((row) => row.title === "One Monday")!.exceptionFor!.id, weekly.id);
      assert.equal(current.blocks.filter((row) => row.id === dated.id).length, 1);
      assert.equal((await write(a, `/schedule/entries/${weekly.id}`, "PATCH", { timing: { type: "weekly", weekday: 2 } })).status, 409);
      assert.equal((await write(a, path, "PUT", { replacement: null })).status, 200);
      current = await read(); assert.ok(!current.blocks.some((row) => row.title === "One Monday"));
      assert.deepEqual(current.blocks.find((row) => row.id === weekly.id)!.excludedDates, ["2026-11-02"]);
      assert.equal((await write(a, path, "DELETE")).status, 200);
      assert.deepEqual((await read()).blocks.find((row) => row.id === weekly.id)!.excludedDates, []);
      assert.equal((await write(a, `/schedule/entries/${weekly.id}/exceptions/2026-11-03`, "PUT", { replacement: null })).status, 400);
      assert.equal((await write(a, path, "PUT", { replacement: draft("Wrong date", { type: "date", date: "2026-11-09" }) })).status, 400);
    });
    await t.test("reject invalid intervals, dates, client ownership and malformed input atomically", async () => {
      const initial = await read();
      for (const invalid of [
        { start: "12:00", end: "12:00" }, { start: "13:00", end: "12:00" }, { start: "24:00", end: "24:00" },
        { start: "23:00", end: "01:00" }, { title: " " }, { title: "x".repeat(81) }, { kind: "admin" },
        { timing: { type: "weekly", weekday: 0 } }, { timing: { type: "date", date: "2026-02-30" } }, { userId: b.user.id },
      ]) assert.equal((await write(a, "/schedule/entries", "POST", { entry: { ...draft("Invalid"), ...invalid }, mutationId: randomUUID() })).status, 400);
      assert.deepEqual(await read(), initial);
      assert.equal((await write(a, `/schedule/entries/${randomUUID()}`, "DELETE")).status, 404);
      assert.equal((await write(a, "/schedule/entries/not-a-uuid", "PATCH", { title: "Bad" })).status, 400);
      assert.equal((await write(a, `/schedule/entries/${weekly.id}`, "PATCH", {})).status, 400);
    });
    await t.test("idempotent creation and competing writes cannot create duplicate blocks or lose updates", async () => {
      const revision = (await read()).revision;
      const body = { entry: draft("Idempotent"), mutationId: randomUUID() };
      const responses = await Promise.all([request(a, "/schedule/entries", "POST", body, revision), request(a, "/schedule/entries", "POST", body, revision)]);
      assert.ok(responses.every((response) => response.status === 201));
      assert.equal((await read()).blocks.filter((row) => row.title === "Idempotent").length, 1);
      assert.equal((await request(a, "/schedule/entries", "POST", { ...body, entry: draft("Different") }, revision)).status, 409);
      const latest = (await read()).revision;
      const competing = await Promise.all(["One", "Two"].map((title) => request(a, "/schedule/entries", "POST", { entry: draft(title), mutationId: randomUUID() }, latest)));
      assert.deepEqual(competing.map((response) => response.status).sort(), [201, 409]);
    });
    await t.test("timezone persistence, midnight, adjacent ranges and DST ambiguity validation", async () => {
      const midnight = await create({ ...draft("Midnight", { type: "date", date: "2026-03-08" }), start: "23:00", end: "24:00" }, b);
      assert.equal(midnight.end, "24:00");
      await create({ ...draft("Before midnight", { type: "date", date: "2026-03-08" }), start: "22:00", end: "23:00" }, b);
      assert.equal((await write(b, "/schedule/preferences", "PATCH", { timezone: "America/New_York" })).status, 200);
      assert.equal((await read(b)).timezone, "America/New_York");
      for (const date of ["2026-03-08", "2026-11-01"]) {
        const start = date.includes("03-") ? "02:30" : "01:30";
        assert.equal((await write(b, "/schedule/entries", "POST", { entry: { ...draft("DST", { type: "date", date }), start, end: "04:00" }, mutationId: randomUUID() })).status, 400);
      }
      assert.equal((await write(b, "/schedule/preferences", "PATCH", { timezone: "not/a/zone" })).status, 400);
      const invalidInNY = await create({ ...draft("Civil time", { type: "date", date: "2026-03-08" }), start: "02:30", end: "04:00" });
      assert.equal((await write(a, "/schedule/preferences", "PATCH", { timezone: "America/New_York" })).status, 400);
      assert.equal((await read()).timezone, "Asia/Bangkok");
      assert.equal((await write(a, `/schedule/entries/${invalidInNY.id}`, "DELETE")).status, 200);
    });
    await t.test("weekly replacement is atomic, private and preserves busy/date entries", async () => {
      const busy = await create(draft("Weekly busy", { type: "weekly", weekday: 2 }, "busy"));
      const initial = await read();
      const invalid = await write(a, "/availability/weekly", "PUT", { entries: [draft("New"), { ...draft("Invalid"), end: "08:00" }] });
      assert.equal(invalid.status, 400); assert.deepEqual(await read(), initial);
      assert.equal((await write(a, "/availability/weekly", "PUT", { entries: [draft("Replacement", { type: "weekly", weekday: 3 })] })).status, 200);
      const current = await read(); assert.ok(current.blocks.some((row) => row.id === busy.id)); assert.ok(current.blocks.some((row) => row.id === dated.id));
      assert.equal(current.blocks.filter((row) => row.timing.type === "weekly" && row.kind === "available").length, 1);
      assert.equal((await read(b)).blocks.length, 2);
    });
    await t.test("real database constraints enforce ranges and exception ownership", async () => {
      await assert.rejects(db.insert(scheduleEntry).values({ userId: a.user.id, mutationId: randomUUID(), title: "Invalid", kind: "busy", timing: "date", date: "2026-11-02", startMinute: 600, endMinute: 500 }));
      const parent = (await read()).blocks.find((row) => row.timing.type === "weekly")!;
      await assert.rejects(db.insert(scheduleException).values({ userId: b.user.id, recurringId: parent.id, date: "2026-11-04" }));
    });
    await t.test("schedule database failures are sanitized and no multi-user finder API is introduced", async () => {
      const unavailableUrl = new URL(env.DATABASE_URL); unavailableUrl.port = "1";
      const unavailable = createDatabase({ ...env, DATABASE_URL: unavailableUrl.href, POSTGRES_PORT: 1 });
      try {
        const response = await createApp(auth, true, unavailable.db).request(`${env.BETTER_AUTH_URL}/api/v1/me/schedule`, { headers: { cookie: a.cookie } });
        assert.equal(response.status, 503);
        assert.deepEqual(await response.json(), { error: { code: "DATABASE_UNAVAILABLE", message: "Your schedule is temporarily unavailable. Please try again." } });
      } finally { await unavailable.pool.end(); }
      assert.equal((await app.request(`${env.BETTER_AUTH_URL}/api/v1/availability`, { headers: { cookie: a.cookie } })).status, 404);
    });
    await t.test("same-origin protection and persistence after logout/new session/auth instance", async () => {
      const revision = (await read()).revision;
      assert.equal((await request(a, "/schedule/entries", "POST", { entry: draft("CSRF"), mutationId: randomUUID() }, revision, "https://evil.example")).status, 403);
      const before = await read();
      const restarted = createApp(createAuth(env, db), true, db);
      const reloaded = await restarted.request(`${env.BETTER_AUTH_URL}/api/v1/me/schedule`, { headers: { cookie: a.cookie } });
      assert.deepEqual(await reloaded.json(), before);
      const signedOut = await app.request(`${env.BETTER_AUTH_URL}/api/auth/sign-out`, { method: "POST", headers: { cookie: a.cookie, origin: env.BETTER_AUTH_URL, "content-type": "application/json" }, body: "{}" });
      assert.equal(signedOut.status, 200); assert.equal((await request(a, "/schedule")).status, 401);
      const renewed = await (await auth.$context).internalAdapter.createSession(a.user.id);
      const relogged = { ...a, cookie: await signedCookie(auth, env, renewed.token) };
      assert.deepEqual(await read(relogged), before);
      const removable = before.blocks.find((row) => row.timing.type === "weekly" && row.kind === "available")!;
      assert.equal((await write(relogged, `/schedule/entries/${removable.id}/exceptions/2026-11-04`, "PUT", { replacement: draft("Override", { type: "date", date: "2026-11-04" }) })).status, 200);
      assert.equal((await write(relogged, `/schedule/entries/${removable.id}`, "DELETE")).status, 200);
      assert.equal((await db.select().from(scheduleException).where(eq(scheduleException.recurringId, removable.id))).length, 0);
      assert.ok(!(await read(relogged)).blocks.some((row) => row.id === removable.id || row.exceptionFor?.id === removable.id));
    });
  } finally {
    await pool.end();
    await admin.pool.query(`DROP DATABASE "${name}" WITH (FORCE)`);
    await admin.pool.end();
  }
});
