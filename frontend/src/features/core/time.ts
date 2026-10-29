import { Temporal } from "@js-temporal/polyfill";
import { availabilityWindow, scheduleDate, scheduleInstant, scheduleMinutes, scheduleTimezone, validateScheduleBlock } from "@wangmai/shared";
import type { AvailabilityQuery, BlockDraft, ScheduleBlock } from "./types";

export const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;
export const TIMEZONES = ["Asia/Bangkok", "Asia/Tokyo", "Asia/Singapore", "Europe/London", "America/New_York", "America/Los_Angeles", "UTC"] as const;

export function dateValue(value: string) {
  return scheduleDate(value);
}

export function minutes(value: string) {
  return scheduleMinutes(value);
}

export function clock(value: number) {
  const bounded = Math.max(0, Math.min(1440, value));
  return `${String(Math.floor(bounded / 60)).padStart(2, "0")}:${String(bounded % 60).padStart(2, "0")}`;
}

export function validateTimezone(timezone: string) {
  scheduleTimezone(timezone);
}

export function instant(date: string, time: string, timezone: string) {
  return scheduleInstant(date, time, timezone);
}

export function queryWindow(query: AvailabilityQuery) {
  return availabilityWindow(query);
}

export function validateBlock(draft: BlockDraft, timezone: string) {
  if (!draft.title.trim() || draft.title.trim().length > 80) throw new Error("Enter a title between 1 and 80 characters.");
  if (draft.kind !== "available" && draft.kind !== "busy") throw new Error("Choose available or busy.");
  validateScheduleBlock({ title: draft.title, kind: draft.kind, start: draft.start, end: draft.end, timing: draft.timing }, timezone);
}

export function addDays(date: string, days: number) { return dateValue(date).add({ days }).toString(); }
export function weekStart(date: string) { const day = dateValue(date); return day.subtract({ days: day.dayOfWeek - 1 }).toString(); }
export function weekDates(date: string) { const start = weekStart(date); return Array.from({ length: 7 }, (_, index) => addDays(start, index)); }
export function todayIn(timezone: string) { return Temporal.Now.plainDateISO(timezone).toString(); }
export function formatDate(date: string, options: Intl.DateTimeFormatOptions = { day: "numeric", month: "long" }) {
  return dateValue(date).toLocaleString("en-GB", options);
}
export function monthDates(date: string) {
  const month = dateValue(date).with({ day: 1 });
  const start = month.subtract({ days: month.dayOfWeek - 1 });
  return Array.from({ length: 42 }, (_, index) => start.add({ days: index }).toString());
}
export function addMonths(date: string, months: number) { return dateValue(date).add({ months }).toString(); }
export function matchesDate(block: ScheduleBlock, date: string, timezone?: string) {
  const matches = !block.excludedDates?.includes(date) && (block.timing.type === "date" ? block.timing.date === date : block.timing.weekday === dateValue(date).dayOfWeek);
  if (!matches || !timezone) return matches;
  try { instant(date, block.start, timezone); instant(date, block.end, timezone); return true; }
  catch { return false; }
}
export function localDateAt(epoch: number, timezone: string) {
  return Temporal.Instant.fromEpochMilliseconds(epoch).toZonedDateTimeISO(timezone).toPlainDate().toString();
}
