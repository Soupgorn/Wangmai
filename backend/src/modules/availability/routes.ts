import { Hono } from "hono";
import { and, between, eq, exists, ne, or, sql } from "drizzle-orm";
import { availabilityQuerySchema, availabilityResponseSchema, classifyScheduleAvailability, googleProfileImage, inclusiveCalendarDates, scheduleDate, type AvailabilityBlock, type AvailabilitySearchResponse, type BlockDraft } from "@wangmai/shared";
import type { Auth } from "../../auth/auth.js";
import type { Database } from "../../db/client.js";
import { reportRequestFailure, type ApiVariables } from "../../operations.js";
import { account, scheduleEntry as entry, scheduleException as exception, schedulePreference as preference, user } from "../../db/schema.js";

const clock = (minute: number) => `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;

export function availabilityRoutes(auth: Auth, db: Database) {
  const routes = new Hono<{ Variables: ApiVariables }>();
  routes.onError((_error, c) => {
    reportRequestFailure(c.get("requestId"));
    return c.json({ error: { code: "AVAILABILITY_UNAVAILABLE", message: "Shared availability could not load. Please try again." } }, 503);
  });
  routes.get("/", async (c) => {
    const session = await auth.api.getSession({ headers: c.req.raw.headers, returnHeaders: true });
    for (const cookie of session.headers.getSetCookie()) c.header("Set-Cookie", cookie, { append: true });
    if (!session.response) return c.json({ error: { code: "UNAUTHORIZED", message: "Sign in to see shared availability." } }, 401);
    // Reject unknown and repeated parameters, including attempted authorization overrides.
    const search = new URL(c.req.url).searchParams;
    if ([...search.keys()].some((key) => search.getAll(key).length !== 1)) return c.json({ error: { code: "INVALID_QUERY", message: "Supply each availability filter once." } }, 400);
    const parsed = availabilityQuerySchema.safeParse(Object.fromEntries(search));
    if (!parsed.success) return c.json({ error: { code: "INVALID_QUERY", message: parsed.error.issues[0]?.message ?? "Choose valid dates and times." } }, 400);
    const query = parsed.data; const dates = inclusiveCalendarDates(query.startDate, query.endDate);
    // A query can cross local dates in a person's zone. Padding covers all IANA offsets.
    const first = scheduleDate(query.startDate).subtract({ days: 2 });
    const last = scheduleDate(query.endDate).add({ days: 2 });
    const from = first.year < 1 ? "0001-01-01" : first.toString();
    const until = last.year > 9999 ? "9999-12-31" : last.toString();
    const viewerId = session.response.user.id;
    const eligible = and(eq(preference.shareAvailability, true), ne(preference.userId, viewerId), exists(db.select({ value: sql`1` }).from(account).where(and(eq(account.userId, preference.userId), eq(account.providerId, "google")))));
    const result = await db.transaction(async (tx): Promise<AvailabilitySearchResponse> => {
      await tx.execute(sql`set local statement_timeout = '5000'`);
      // Three set-based reads, independent of user count. Private profiles/blocks are never selected.
      const profiles = await tx.select({ id: user.id, displayName: user.name, image: user.image, timezone: preference.timezone }).from(preference).innerJoin(user, eq(user.id, preference.userId)).where(eligible).orderBy(user.id);
      if (!profiles.length) return { query, people: [], days: dates.map((date) => ({ date, results: [] })), counts: { anyDay: 0, everyDay: 0 } };
      const entries = await tx.select({ id: entry.id, ownerId: entry.userId, kind: entry.kind, timing: entry.timing, weekday: entry.weekday, date: entry.date, start: entry.startMinute, end: entry.endMinute }).from(entry).innerJoin(preference, eq(preference.userId, entry.userId)).where(and(eligible, or(eq(entry.timing, "weekly"), between(entry.date, from, until))));
      const exceptions = await tx.select({ recurringId: exception.recurringId, ownerId: exception.userId, date: exception.date, kind: exception.kind, start: exception.startMinute, end: exception.endMinute }).from(exception).innerJoin(preference, eq(preference.userId, exception.userId)).where(and(eligible, between(exception.date, from, until)));
      const excluded = new Map<string, string[]>();
      for (const row of exceptions) excluded.set(row.recurringId, [...(excluded.get(row.recurringId) ?? []), row.date]);
      const byOwner = new Map<string, AvailabilityBlock[]>();
      const add = (block: AvailabilityBlock) => { const owned = byOwner.get(block.ownerId) ?? []; owned.push(block); byOwner.set(block.ownerId, owned); };
      for (const row of entries) {
        const timing: BlockDraft["timing"] = row.timing === "weekly" ? { type: "weekly", weekday: row.weekday! } : { type: "date", date: row.date! };
        add({ ownerId: row.ownerId, kind: row.kind, start: clock(row.start), end: clock(row.end), timing, excludedDates: excluded.get(row.id) });
      }
      for (const row of exceptions) if (row.kind !== null && row.start !== null && row.end !== null) add({ ownerId: row.ownerId, kind: row.kind, start: clock(row.start), end: clock(row.end), timing: { type: "date", date: row.date } });
      const days = dates.map((date) => ({ date, results: profiles.map((profile) => ({ personId: profile.id, state: classifyScheduleAvailability({ ...profile, shareAvailability: true }, byOwner.get(profile.id) ?? [], { date, start: query.startTime, end: query.endTime, timezone: query.timezone }).state })) }));
      const availableDates = new Map<string, string[]>();
      for (const day of days) for (const row of day.results) if (row.state === "available") availableDates.set(row.personId, [...(availableDates.get(row.personId) ?? []), day.date]);
      const people = profiles.map((profile) => ({ id: profile.id, displayName: profile.displayName, image: googleProfileImage(profile.image), availableDates: availableDates.get(profile.id) ?? [] }));
      return { query, people, days, counts: { anyDay: people.filter((person) => person.availableDates.length > 0).length, everyDay: people.filter((person) => person.availableDates.length === dates.length).length } };
    }, { isolationLevel: "repeatable read", accessMode: "read only" });
    return c.json(availabilityResponseSchema.parse(result));
  });
  return routes;
}
