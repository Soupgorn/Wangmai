import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { availabilityResponseSchema, type AvailabilitySearchResponse, type BlockDraft, type ScheduleResponse } from "@wangmai/shared";
import { createApp } from "../src/app.js";
import { createAuth } from "../src/auth/auth.js";
import { loadEnv } from "../src/config/env.js";
import { createDatabase, type Database } from "../src/db/client.js";
import { account, user } from "../src/db/schema.js";
import { seedSession } from "./helpers.js";

test("private-by-default multi-user availability", { timeout: 60_000 }, async (t) => {
  const env = loadEnv({ ...process.env, NODE_ENV: "test" });
  const admin = createDatabase(env); const name = `wangmai_availability_test_${randomBytes(8).toString("hex")}`;
  assert.match(name, /^wangmai_availability_test_[a-f0-9]{16}$/);
  await admin.pool.query(`CREATE DATABASE "${name}"`);
  const url = new URL(env.DATABASE_URL); url.pathname = `/${name}`;
  const { db, pool } = createDatabase({ ...env, DATABASE_URL: url.href, POSTGRES_DB: name });
  try {
    await migrate(db, { migrationsFolder: fileURLToPath(new URL("../drizzle", import.meta.url)) });
    await migrate(db, { migrationsFolder: fileURLToPath(new URL("../drizzle", import.meta.url)) });
    const auth = createAuth(env, db); const app = createApp(auth, true, db);
    const a = await seedSession(auth, env); const viewer = await seedSession(auth, env); const beam = await seedSession(auth, env);
    const hidden = await seedSession(auth, env); const unknown = await seedSession(auth, env); const tokyo = await seedSession(auth, env); const notGoogle = await seedSession(auth, env);
    type Actor = { cookie: string; user: { id: string } };
    const request = (actor: Actor | null, path: string, method = "GET", body?: unknown, revision?: number, origin = env.BETTER_AUTH_URL) => app.request(`${env.BETTER_AUTH_URL}/api/v1${path}`, { method, headers: { ...(actor ? { cookie: actor.cookie } : {}), ...(method !== "GET" ? { origin } : {}), ...(revision !== undefined ? { "If-Match": `"${revision}"` } : {}), ...(body !== undefined ? { "content-type": "application/json" } : {}) }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
    const read = async (actor: Actor): Promise<ScheduleResponse> => (await request(actor, "/me/schedule")).json();
    const write = async (actor: Actor, path: string, method: string, body?: unknown) => request(actor, `/me${path}`, method, body, (await read(actor)).revision);
    const share = async (actor: Actor, enabled: boolean, timezone?: string) => { const response = await write(actor, "/schedule/preferences", "PATCH", { shareAvailability: enabled, ...(timezone ? { timezone } : {}) }); assert.equal(response.status, 200); return response.json() as Promise<ScheduleResponse>; };
    const draft = (timing: BlockDraft["timing"], kind: BlockDraft["kind"] = "available", start = "13:00", end = "17:00"): BlockDraft => ({ title: kind === "busy" ? "Personal Time" : "Never expose private event notes", kind, start, end, timing });
    const create = async (actor: Actor, value: BlockDraft) => { const response = await write(actor, "/schedule/entries", "POST", { mutationId: randomUUID(), entry: value }); assert.equal(response.status, 201); const result: ScheduleResponse = await response.json(); return result.blocks.at(-1)!; };
    const query = { startDate: "2026-12-31", endDate: "2027-01-02", startTime: "13:00", endTime: "15:00", timezone: "Asia/Bangkok" };
    const search = (actor: Actor | null = viewer, patch: Partial<typeof query> = {}) => request(actor, `/availability?${new URLSearchParams({ ...query, ...patch })}`);
    const result = async (patch: Partial<typeof query> = {}) => { const response = await search(viewer, patch); assert.equal(response.status, 200); assert.equal(response.headers.get("cache-control"), "no-store"); return availabilityResponseSchema.parse(await response.json()); };
    const state = (response: AvailabilitySearchResponse, date: string, id: string) => response.days.find((day) => day.date === date)?.results.find((row) => row.personId === id)?.state;
    await t.test("defaults are OFF, migrations repeat safely, existing schedule writes remain private", async () => {
      assert.equal((await read(a)).shareAvailability, false);
      await create(hidden, draft({ type: "weekly", weekday: 4 }));
      assert.deepEqual((await result()).people, []);
      assert.equal((await read(hidden)).blocks.length, 1);
    });
    await t.test("session is required before inputs are evaluated; client IDs and duplicated filters are rejected", async () => {
      assert.equal((await search(null)).status, 401);
      assert.equal((await request({ ...viewer, cookie: "better-auth.session_token=invalid" }, "/availability")).status, 401);
      assert.equal((await request(viewer, `/availability?${new URLSearchParams(query)}&userId=${a.user.id}`)).status, 400);
      assert.equal((await request(viewer, `/availability?${new URLSearchParams(query)}&startDate=2026-12-30`)).status, 400);
    });
    await t.test("sharing is owner-only, persistent, revision protected, and origin protected", async () => {
      const initial = await read(a);
      assert.equal((await share(a, true)).shareAvailability, true);
      assert.equal((await read(a)).shareAvailability, true);
      assert.equal((await request(a, "/me/schedule/preferences", "PATCH", { shareAvailability: false }, initial.revision)).status, 409);
      assert.equal((await write(viewer, "/schedule/preferences", "PATCH", { shareAvailability: true, userId: a.user.id })).status, 400);
      assert.equal((await request(a, "/me/schedule/preferences", "PATCH", { shareAvailability: false }, (await read(a)).revision, "https://other.invalid")).status, 403);
      assert.equal((await read(viewer)).shareAvailability, false);
    });
    const friday = new Map<string, string>();
    await t.test("multiple Google-linked users use real weekly and dated entries in their own zones", async () => {
      for (const actor of [a, beam, tokyo]) {
        await share(actor, true, actor === tokyo ? "Asia/Tokyo" : "Asia/Bangkok");
        for (let weekday = 1; weekday <= 7; weekday++) {
          const saved = await create(actor, draft({ type: "weekly", weekday }, "available", actor === tokyo ? "15:00" : "13:00", actor === tokyo ? "19:00" : "17:00"));
          assert.equal(saved.kind, "available"); // Retained legacy markers are ignored.
        }
      }
      friday.set(a.user.id, (await create(a, draft({ type: "weekly", weekday: 5 }, "busy"))).id);
      await share(unknown, true); await share(viewer, true); await share(notGoogle, true);
      await db.update(account).set({ providerId: "credential" }).where(eq(account.userId, notGoogle.user.id));
      await db.update(user).set({ name: "Alex Shared", image: "https://lh3.googleusercontent.com/a/test-photo" }).where(eq(user.id, a.user.id));
      await db.update(user).set({ image: "https://untrusted.invalid/private-photo" }).where(eq(user.id, beam.user.id));
      await create(beam, draft({ type: "date", date: "2027-01-01" }, "busy", "14:00", "14:30"));
      const found = await result();
      assert.deepEqual(found.days.map((day) => day.date), ["2026-12-31", "2027-01-01", "2027-01-02"]);
      assert.equal(found.people.length, 4);
      assert.equal(state(found, "2027-01-01", beam.user.id), "busy");
      assert.equal(state(found, "2026-12-31", tokyo.user.id), "available");
      assert.equal(state(found, "2027-01-02", unknown.user.id), "available");
      assert.deepEqual(found.people.find((person) => person.id === beam.user.id)?.availableDates, ["2026-12-31", "2027-01-02"]);
      assert.deepEqual(found.counts, { anyDay: 4, everyDay: 2 });
      assert.equal(found.people.find((person) => person.id === beam.user.id)?.image, null);
      assert.equal(found.people.find((person) => person.id === a.user.id)?.image, "https://lh3.googleusercontent.com/a/test-photo");
    });
    await t.test("private and non-Google users are absent from every view, count, and payload field", async () => {
      const found = await result(); const serialized = JSON.stringify(found);
      for (const secret of [hidden.user.id, notGoogle.user.id, viewer.user.id, hidden.user.email, a.user.email, "Never expose private event notes", "Personal Time", "ownerId", "excludedDates", "email", "timezone\":\"Asia/Tokyo"]) assert.equal(serialized.includes(secret), false, secret);
      assert.ok(found.days.every((day) => day.results.length === found.people.length));
      assert.deepEqual(Object.keys(found.people[0]!).sort(), ["availableDates", "displayName", "id", "image"]);
    });
    await t.test("shared empty schedules and gaps are available without Available markers", async () => {
      const found = await result({ endDate: query.startDate });
      assert.equal(found.days.length, 1); assert.equal(found.counts.anyDay, found.counts.everyDay);
      assert.equal(state(await result({ startTime: "17:00", endTime: "18:00" }), query.startDate, a.user.id), "available");
      assert.equal((await read(unknown)).blocks.length, 0);
      assert.equal(state(found, query.startDate, unknown.user.id), "available");
    });
    await t.test("cancelled, replaced and restored occurrences affect only one date", async () => {
      const id = friday.get(a.user.id)!; const path = `/schedule/entries/${id}/exceptions/2027-01-01`;
      assert.equal((await write(a, path, "PUT", { replacement: null })).status, 200);
      assert.equal(state(await result(), "2027-01-01", a.user.id), "available");
      assert.equal(state(await result(), "2026-12-31", a.user.id), "available");
      assert.equal((await write(a, path, "PUT", { replacement: draft({ type: "date", date: "2027-01-01" }, "busy") })).status, 200);
      assert.equal(state(await result(), "2027-01-01", a.user.id), "busy");
      assert.equal((await write(a, path, "DELETE")).status, 200);
      assert.equal(state(await result(), "2027-01-01", a.user.id), "busy");
    });
    await t.test("half-open overlaps, additive dated availability and independent daily intervals are preserved", async () => {
      await create(a, draft({ type: "date", date: "2026-12-31" }, "busy", "12:00", "13:00"));
      await create(a, draft({ type: "date", date: "2026-12-31" }, "busy", "15:00", "16:00"));
      await create(a, draft({ type: "date", date: "2027-01-01" }, "busy", "18:00", "19:00"));
      assert.equal((await result()).people.find((person) => person.id === a.user.id)?.availableDates.length, 2);
      await create(unknown, draft({ type: "date", date: "2027-01-02" }));
      assert.deepEqual((await result()).people.find((person) => person.id === unknown.user.id)?.availableDates, ["2026-12-31", "2027-01-01", "2027-01-02"]);
      assert.equal(state(await result({ startTime: "14:30", endTime: "15:30" }), "2026-12-31", a.user.id), "busy");
    });
    await t.test("cross-month, timezone date boundaries and DST ambiguities never produce invented availability", async () => {
      await create(tokyo, draft({ type: "date", date: "2027-01-03" }, "busy", "01:00", "02:00"));
      assert.equal(state(await result({ startDate: "2027-01-02", endDate: "2027-01-02", startTime: "16:00", endTime: "17:00", timezone: "UTC" }), "2027-01-02", tokyo.user.id), "busy");
      await share(unknown, true, "America/New_York");
      await create(unknown, draft({ type: "weekly", weekday: 7 }, "available", "00:00", "04:00"));
      await create(unknown, draft({ type: "weekly", weekday: 7 }, "busy", "01:15", "01:45"));
      assert.equal(state(await result({ startDate: "2026-11-01", endDate: "2026-11-01", startTime: "05:00", endTime: "07:00", timezone: "UTC" }), "2026-11-01", unknown.user.id), "unknown");
      assert.equal((await result({ startDate: "2026-10-31", endDate: "2026-11-02" })).days.length, 3);
    });
    await t.test("invalid filters and DST inputs return useful bounded errors", async () => {
      for (const patch of [{ startDate: "2026-02-30" }, { endDate: "2026-12-30" }, { endDate: "2027-02-01" }, { startTime: "25:00" }, { startTime: "15:00", endTime: "13:00" }, { timezone: "Invalid/Zone" }, { startDate: "2026-11-01", endDate: "2026-11-01", startTime: "01:15", endTime: "02:30", timezone: "America/New_York" }]) {
        const response = await search(viewer, patch); assert.equal(response.status, 400); assert.ok((await response.json()).error.message);
      }
      assert.equal((await result({ startDate: "2026-12-01", endDate: "2026-12-31" })).days.length, 31);
    });
    await t.test("disabling sharing removes the profile and all aggregates on the next search", async () => {
      const before = await result(); await share(a, false); const after = await result();
      assert.equal(JSON.stringify(after).includes(a.user.id), false);
      assert.equal(after.counts.anyDay, before.counts.anyDay - 1);
      assert.equal((await read(a)).blocks.length > 0, true);
    });
    await t.test("database errors are sanitized, never valid empty results", async () => {
      const unavailable = createApp(auth, true, { transaction: async () => { throw new Error("secret-database-password"); } } as unknown as Database);
      const response = await unavailable.request(`${env.BETTER_AUTH_URL}/api/v1/availability?${new URLSearchParams(query)}`, { headers: { cookie: viewer.cookie } });
      assert.equal(response.status, 503); assert.equal((await response.text()).includes("secret-database-password"), false);
    });
  } finally {
    await pool.end(); await admin.pool.query(`DROP DATABASE "${name}" WITH (FORCE)`); await admin.pool.end();
  }
});
