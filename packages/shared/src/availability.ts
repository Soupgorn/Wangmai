import { Temporal } from "@js-temporal/polyfill";
import { z } from "zod";
import { dateSchema, scheduleDate, scheduleInstant, scheduleMinutes, timezoneSchema, type BlockDraft } from "./schedule.js";

export type AvailabilityState = "available" | "busy" | "unknown";
export type AvailabilityWindowQuery = { date: string; start: string; end: string; timezone: string };
export type AvailabilityBlock = Pick<BlockDraft, "kind" | "start" | "end" | "timing"> & { ownerId: string; excludedDates?: string[] | undefined };

export function inclusiveCalendarDates(start: string, end: string, maximum = 31): string[] {
  const first = scheduleDate(start); const last = scheduleDate(end);
  const length = first.until(last).days + 1;
  if (length < 1) throw new Error("End date must be on or after start date.");
  if (length > maximum) throw new Error(`Choose at most ${maximum} calendar days.`);
  return Array.from({ length }, (_, index) => first.add({ days: index }).toString());
}
export function availabilityWindow(query: AvailabilityWindowQuery) {
  scheduleDate(query.date);
  if (scheduleMinutes(query.start) >= 1440 || scheduleMinutes(query.end) <= scheduleMinutes(query.start)) throw new Error("End time must be after start time on the same day.");
  return { start: scheduleInstant(query.date, query.start, query.timezone), end: scheduleInstant(query.date, query.end, query.timezone) };
}

/** Opted-in profiles are available unless a Busy block overlaps the query.
 * Legacy Available markers have no effect; unsafe Busy occurrences stay Unknown.
 */
export function classifyScheduleAvailability(person: { id: string; timezone: string; shareAvailability: boolean }, blocks: readonly AvailabilityBlock[], query: AvailabilityWindowQuery): { state: AvailabilityState; explanation: string } {
  const window = availabilityWindow(query);
  if (!person.shareAvailability) return { state: "unknown", explanation: "Availability isn’t shared." };
  const localDate = (epoch: number) => Temporal.Instant.fromEpochMilliseconds(epoch).toZonedDateTimeISO(person.timezone).toPlainDate();
  const firstDate = localDate(window.start); const lastDate = localDate(window.end - 1);
  const intervals: { start: number; end: number; kind: "available" | "busy" }[] = [];
  let uncertain = false;
  for (let day = firstDate; Temporal.PlainDate.compare(day, lastDate) <= 0; day = day.add({ days: 1 })) {
    const date = day.toString();
    for (const block of blocks) {
      if (block.kind !== "busy" || block.ownerId !== person.id || block.excludedDates?.includes(date) || (block.timing.type === "date" ? block.timing.date !== date : block.timing.weekday !== day.dayOfWeek)) continue;
      try { intervals.push({ start: scheduleInstant(date, block.start, person.timezone), end: scheduleInstant(date, block.end, person.timezone), kind: block.kind }); }
      catch { uncertain = true; }
    }
  }
  if (intervals.some((block) => block.kind === "busy" && block.start < window.end && block.end > window.start)) return { state: "busy", explanation: "Unavailable during this time." };
  if (uncertain) return { state: "unknown", explanation: "A daylight-saving transition makes this availability uncertain." };
  return { state: "available", explanation: "No unavailable block overlaps this time." };
}

export function googleProfileImage(value: string | null | undefined): string | null {
  if (!value || value.length > 2048) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && /^lh\d+\.googleusercontent\.com$/.test(url.hostname) && !url.username && !url.password && !url.port ? url.href : null;
  } catch { return null; }
}

export const availabilityQuerySchema = z.object({
  startDate: dateSchema, endDate: dateSchema, startTime: z.string().max(5), endTime: z.string().max(5), timezone: timezoneSchema,
}).strict().superRefine((query, ctx) => {
  try { inclusiveCalendarDates(query.startDate, query.endDate).forEach((date) => availabilityWindow({ date, start: query.startTime, end: query.endTime, timezone: query.timezone })); }
  catch (error) { ctx.addIssue({ code: "custom", message: error instanceof Error ? error.message : "Choose valid dates and times." }); }
});
export type AvailabilitySearchQuery = z.infer<typeof availabilityQuerySchema>;
export const publicPersonSchema = z.object({ id: z.string().min(1), displayName: z.string().min(1), image: z.string().refine((value) => googleProfileImage(value) !== null).nullable() }).strict();
export type PublicPerson = z.infer<typeof publicPersonSchema>;
const stateSchema = z.enum(["available", "busy", "unknown"]);
export const availabilityResponseSchema = z.object({
  query: availabilityQuerySchema,
  people: z.array(publicPersonSchema.extend({ availableDates: z.array(dateSchema).max(31) }).strict()),
  days: z.array(z.object({ date: dateSchema, results: z.array(z.object({ personId: z.string(), state: stateSchema }).strict()) }).strict()).min(1).max(31),
  counts: z.object({ anyDay: z.number().int().nonnegative(), everyDay: z.number().int().nonnegative() }).strict(),
}).strict().superRefine((response, ctx) => {
  let dates: string[];
  try { dates = inclusiveCalendarDates(response.query.startDate, response.query.endDate); }
  catch { ctx.addIssue({ code: "custom", message: "Availability response is inconsistent." }); return; }
  const ids = new Set(response.people.map((person) => person.id));
  const availableById = new Map<string, string[]>();
  let valid = ids.size === response.people.length && response.days.length === dates.length;
  response.days.forEach((day, index) => {
    const seen = new Set(day.results.map((row) => row.personId));
    valid &&= day.date === dates[index] && day.results.length === ids.size && seen.size === ids.size && [...seen].every((id) => ids.has(id));
    for (const row of day.results) if (row.state === "available") {
      const available = availableById.get(row.personId) ?? [];
      available.push(day.date); availableById.set(row.personId, available);
    }
  });
  response.people.forEach((person) => {
    const actual = availableById.get(person.id) ?? [];
    valid &&= JSON.stringify(person.availableDates) === JSON.stringify(actual);
  });
  valid &&= response.counts.anyDay === response.people.filter((person) => person.availableDates.length > 0).length && response.counts.everyDay === response.people.filter((person) => person.availableDates.length === dates.length).length;
  if (!valid) ctx.addIssue({ code: "custom", message: "Availability response is inconsistent." });
});
export type AvailabilitySearchResponse = z.infer<typeof availabilityResponseSchema>;
