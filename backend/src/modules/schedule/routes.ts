import { randomUUID } from "node:crypto";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import {
  blockDraftSchema, createBlockSchema, dateSchema, exceptionSchema, scheduleDate,
  scheduleMinutes, timezoneSchema, validateScheduleBlock, weeklyScheduleSchema,
  updateBlockSchema,
  type BlockDraft, type ScheduleResponse,
} from "@wangmai/shared";
import type { Auth } from "../../auth/auth.js";
import type { Database } from "../../db/client.js";
import { reportRequestFailure, type ApiVariables } from "../../operations.js";
import { scheduleEntry as entry, scheduleException as exception, schedulePreference as preference } from "../../db/schema.js";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
type Executor = Pick<Database, "select">;
class ScheduleError extends Error {
  constructor(public status: 400 | 401 | 403 | 404 | 409 | 428, public code: string, message: string) { super(message); }
}
const notFound = () => new ScheduleError(404, "NOT_FOUND", "Schedule entry not found.");
const clock = (value: number) => `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
function draftOf(row: typeof entry.$inferSelect): BlockDraft {
  return { title: row.title, kind: row.kind, start: clock(row.startMinute), end: clock(row.endMinute), timing: row.timing === "weekly" ? { type: "weekly", weekday: row.weekday! } : { type: "date", date: row.date! } };
}
function dataOf(draft: BlockDraft) {
  return { title: draft.title, kind: draft.kind, startMinute: scheduleMinutes(draft.start), endMinute: scheduleMinutes(draft.end), timing: draft.timing.type, weekday: draft.timing.type === "weekly" ? draft.timing.weekday : null, date: draft.timing.type === "date" ? draft.timing.date : null };
}
async function snapshot(db: Executor, userId: string): Promise<ScheduleResponse> {
  const [prefs] = await db.select().from(preference).where(eq(preference.userId, userId));
  const entries = await db.select().from(entry).where(eq(entry.userId, userId)).orderBy(entry.createdAt, entry.id);
  const exceptions = await db.select().from(exception).where(eq(exception.userId, userId)).orderBy(exception.date);
  const blocks: ScheduleResponse["blocks"] = entries.map((row) => ({ ...draftOf(row), id: row.id, ownerId: userId, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(), ...(row.timing === "weekly" ? { excludedDates: exceptions.filter((value) => value.recurringId === row.id).map((value) => value.date) } : {}) }));
  for (const row of exceptions) {
    if (row.title === null) continue;
    blocks.push({ id: row.id, ownerId: userId, title: row.title, kind: row.kind!, start: clock(row.startMinute!), end: clock(row.endMinute!), timing: { type: "date", date: row.date }, exceptionFor: { id: row.recurringId, date: row.date }, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() });
  }
  return { timezone: prefs?.timezone ?? "Asia/Bangkok", revision: prefs?.revision ?? 0, shareAvailability: prefs?.shareAvailability ?? false, blocks };
}
function validate(draft: BlockDraft, timezone: string) {
  try { validateScheduleBlock(draft, timezone); }
  catch (error) { throw new ScheduleError(400, "INVALID_INTERVAL", error instanceof Error ? error.message : "Invalid interval."); }
}
async function owned(tx: Tx, userId: string, id: string) {
  const [row] = await tx.select().from(entry).where(and(eq(entry.id, id), eq(entry.userId, userId)));
  if (!row) throw notFound();
  return row;
}

export function scheduleRoutes(auth: Auth, db: Database) {
  const routes = new Hono<{ Variables: ApiVariables }>();
  routes.onError((error, c) => {
    if (error instanceof ScheduleError) return c.json({ error: { code: error.code, message: error.message } }, error.status);
    if (error instanceof z.ZodError) return c.json({ error: { code: "INVALID_INPUT", message: error.issues[0]?.message ?? "Invalid schedule input." } }, 400);
    reportRequestFailure(c.get("requestId"));
    return c.json({ error: { code: "DATABASE_UNAVAILABLE", message: "Your schedule is temporarily unavailable. Please try again." } }, 503);
  });
  routes.use("*", async (c, next) => {
    const result = await auth.api.getSession({ headers: c.req.raw.headers, returnHeaders: true });
    for (const cookie of result.headers.getSetCookie()) c.header("Set-Cookie", cookie, { append: true });
    if (!result.response) throw new ScheduleError(401, "UNAUTHORIZED", "Sign in to manage your schedule.");
    c.set("userId", result.response.user.id);
    if (c.req.method !== "GET") {
      const origin = typeof auth.options.baseURL === "string" ? new URL(auth.options.baseURL).origin : "";
      if (!origin || c.req.header("Origin") !== origin || c.req.header("Sec-Fetch-Site") === "cross-site") throw new ScheduleError(403, "INVALID_ORIGIN", "Schedule changes must come from Wangmai.");
      if (["POST", "PATCH", "PUT"].includes(c.req.method) && !c.req.header("Content-Type")?.startsWith("application/json")) throw new ScheduleError(400, "INVALID_CONTENT_TYPE", "Send JSON schedule data.");
    }
    await next();
  });
  routes.use("*", bodyLimit({ maxSize: 128 * 1024, onError: (c) => c.json({ error: { code: "PAYLOAD_TOO_LARGE", message: "Schedule request is too large." } }, 413) }));
  const json = async (request: { json: () => Promise<unknown> }) => {
    try { return await request.json(); } catch { throw new ScheduleError(400, "INVALID_JSON", "Send valid JSON schedule data."); }
  };
  async function mutate(userId: string, ifMatch: string | undefined, action: (tx: Tx, timezone: string) => Promise<void>, replay?: (tx: Tx) => Promise<boolean>) {
    if (!ifMatch || !/^"\d+"$/.test(ifMatch)) throw new ScheduleError(428, "REVISION_REQUIRED", "Load your schedule before saving changes.");
    const expected = Number(ifMatch.slice(1, -1));
    return db.transaction(async (tx) => {
      await tx.insert(preference).values({ userId }).onConflictDoNothing();
      const [prefs] = await tx.select().from(preference).where(eq(preference.userId, userId)).for("update");
      if (replay && await replay(tx)) return snapshot(tx, userId);
      if (prefs!.revision !== expected) throw new ScheduleError(409, "SCHEDULE_CHANGED", "Your schedule changed in another tab. Reload the schedule before saving again.");
      await action(tx, prefs!.timezone);
      await tx.update(preference).set({ revision: sql`${preference.revision} + 1`, updatedAt: new Date() }).where(eq(preference.userId, userId));
      return snapshot(tx, userId);
    });
  }
  routes.get("/schedule", async (c) => {
    const result = await db.transaction((tx) => snapshot(tx, c.get("userId")), { isolationLevel: "repeatable read", accessMode: "read only" });
    c.header("ETag", `"${result.revision}"`); return c.json(result);
  });
  routes.post("/schedule/entries", async (c) => {
    const input = createBlockSchema.parse(await json(c.req)); const userId = c.get("userId");
    const result = await mutate(userId, c.req.header("If-Match"), async (tx, timezone) => {
      validate(input.entry, timezone);
      const [total] = await tx.select({ count: sql<number>`count(*)::int` }).from(entry).where(eq(entry.userId, userId));
      if (total!.count >= 2000) throw new ScheduleError(400, "SCHEDULE_LIMIT", "Remove an old block before adding more time.");
      await tx.insert(entry).values({ ...dataOf(input.entry), userId, mutationId: input.mutationId });
    }, async (tx) => {
      const [existing] = await tx.select().from(entry).where(and(eq(entry.userId, userId), eq(entry.mutationId, input.mutationId)));
      if (!existing) return false;
      const data = dataOf(input.entry);
      if (Object.entries(data).some(([key, value]) => existing[key as keyof typeof data] !== value)) throw new ScheduleError(409, "MUTATION_CONFLICT", "This save request was already used for another block.");
      return true;
    });
    c.header("ETag", `"${result.revision}"`); return c.json(result, 201);
  });
  routes.patch("/schedule/entries/:id", async (c) => {
    const id = z.uuid().parse(c.req.param("id")); const patch = updateBlockSchema.parse(await json(c.req)); const userId = c.get("userId");
    return c.json(await mutate(userId, c.req.header("If-Match"), async (tx, timezone) => {
      const previous = await owned(tx, userId, id);
      const input = blockDraftSchema.parse({ ...draftOf(previous), ...patch }); validate(input, timezone);
      if (previous.timing === "weekly" && (input.timing.type !== "weekly" || input.timing.weekday !== previous.weekday)) {
        const overrides = await tx.select({ id: exception.id }).from(exception).where(and(eq(exception.recurringId, id), eq(exception.userId, userId))).limit(1);
        if (overrides.length) throw new ScheduleError(409, "HAS_EXCEPTIONS", "Restore dated exceptions before changing this block’s recurrence or weekday.");
      }
      await tx.update(entry).set({ ...dataOf(input), updatedAt: new Date() }).where(and(eq(entry.id, id), eq(entry.userId, userId)));
    }));
  });
  routes.delete("/schedule/entries/:id", async (c) => {
    const id = z.uuid().parse(c.req.param("id")); const userId = c.get("userId");
    return c.json(await mutate(userId, c.req.header("If-Match"), async (tx) => {
      await owned(tx, userId, id);
      await tx.delete(entry).where(and(eq(entry.id, id), eq(entry.userId, userId)));
    }));
  });
  routes.put("/schedule/entries/:id/exceptions/:date", async (c) => {
    const id = z.uuid().parse(c.req.param("id")); const date = dateSchema.parse(c.req.param("date"));
    const { replacement } = exceptionSchema.parse(await json(c.req)); const userId = c.get("userId");
    return c.json(await mutate(userId, c.req.header("If-Match"), async (tx, timezone) => {
      const parent = await owned(tx, userId, id);
      if (parent.timing !== "weekly" || parent.weekday !== scheduleDate(date).dayOfWeek) throw new ScheduleError(400, "INVALID_OCCURRENCE", "Choose a date on this recurring block’s weekday.");
      if (replacement) {
        if (replacement.timing.type !== "date" || replacement.timing.date !== date) throw new ScheduleError(400, "INVALID_OCCURRENCE", "A replacement must use this occurrence’s date.");
        validate(replacement, timezone);
      }
      const values = { title: replacement?.title ?? null, kind: replacement?.kind ?? null, startMinute: replacement ? scheduleMinutes(replacement.start) : null, endMinute: replacement ? scheduleMinutes(replacement.end) : null, updatedAt: new Date() };
      await tx.insert(exception).values({ ...values, userId, recurringId: id, date }).onConflictDoUpdate({ target: [exception.recurringId, exception.date], set: values });
    }));
  });
  routes.delete("/schedule/entries/:id/exceptions/:date", async (c) => {
    const id = z.uuid().parse(c.req.param("id")); const date = dateSchema.parse(c.req.param("date")); const userId = c.get("userId");
    return c.json(await mutate(userId, c.req.header("If-Match"), async (tx) => {
      await owned(tx, userId, id);
      const deleted = await tx.delete(exception).where(and(eq(exception.userId, userId), eq(exception.recurringId, id), eq(exception.date, date))).returning({ id: exception.id });
      if (!deleted.length) throw notFound();
    }));
  });
  routes.get("/availability/weekly", async (c) => {
    const result = await db.transaction((tx) => snapshot(tx, c.get("userId")), { isolationLevel: "repeatable read", accessMode: "read only" });
    c.header("ETag", `"${result.revision}"`);
    return c.json({ ...result, blocks: result.blocks.filter((block) => block.timing.type === "weekly" && block.kind === "available") });
  });
  routes.put("/availability/weekly", async (c) => {
    const input = weeklyScheduleSchema.parse(await json(c.req)); const userId = c.get("userId");
    return c.json(await mutate(userId, c.req.header("If-Match"), async (tx, timezone) => {
      for (const draft of input.entries) validate(draft, timezone);
      await tx.delete(entry).where(and(eq(entry.userId, userId), eq(entry.timing, "weekly"), eq(entry.kind, "available")));
      if (input.entries.length) await tx.insert(entry).values(input.entries.map((draft) => ({ ...dataOf(draft), userId, mutationId: randomUUID() })));
    }));
  });
  routes.patch("/schedule/preferences", async (c) => {
    const patch = z.object({ timezone: timezoneSchema.optional(), shareAvailability: z.boolean().optional() }).strict().refine((value) => Object.keys(value).length > 0, "Supply a preference change.").parse(await json(c.req)); const userId = c.get("userId");
    return c.json(await mutate(userId, c.req.header("If-Match"), async (tx) => {
      const existing = await snapshot(tx, userId);
      if (patch.timezone) for (const block of existing.blocks) validate({ title: block.title, kind: block.kind, start: block.start, end: block.end, timing: block.timing }, patch.timezone);
      await tx.update(preference).set(patch).where(eq(preference.userId, userId));
    }));
  });
  return routes;
}
