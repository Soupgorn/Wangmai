import { Temporal } from "@js-temporal/polyfill";
import type { AvailabilityQuery, BlockDraft, ScheduleBlock } from "./types";

export const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;
export const TIMEZONES = ["Asia/Bangkok", "Asia/Tokyo", "Asia/Singapore", "Europe/London", "America/New_York", "America/Los_Angeles", "UTC"] as const;

export function dateValue(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("Choose a valid date.");
  try { return Temporal.PlainDate.from(value); } catch { throw new Error("Choose a valid date."); }
}

export function minutes(value: string) {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) throw new Error("Choose a valid time.");
  return Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
}

export function clock(value: number) {
  const bounded = Math.max(0, Math.min(1439, value));
  return `${String(Math.floor(bounded / 60)).padStart(2, "0")}:${String(bounded % 60).padStart(2, "0")}`;
}

export function validateTimezone(timezone: string) {
  try { Temporal.Instant.fromEpochMilliseconds(0).toZonedDateTimeISO(timezone); }
  catch { throw new Error("Choose a supported timezone."); }
}

export function instant(date: string, time: string, timezone: string) {
  minutes(time);
  validateTimezone(timezone);
  try {
    return dateValue(date).toPlainDateTime(time).toZonedDateTime(timezone, { disambiguation: "reject" }).epochMilliseconds;
  } catch {
    throw new Error("This time is skipped or repeated by daylight saving. Choose another time.");
  }
}

export function queryWindow(query: AvailabilityQuery) {
  dateValue(query.date);
  if (minutes(query.end) <= minutes(query.start)) throw new Error("End time must be after start time on the same day.");
  const start = instant(query.date, query.start, query.timezone);
  const end = instant(query.date, query.end, query.timezone);
  return { start, end };
}

export function validateBlock(draft: BlockDraft, timezone: string) {
  if (!draft.title.trim() || draft.title.trim().length > 80) throw new Error("Enter a title between 1 and 80 characters.");
  if (draft.kind !== "available" && draft.kind !== "busy") throw new Error("Choose available or busy.");
  validateTimezone(timezone);
  if (minutes(draft.end) <= minutes(draft.start)) throw new Error("End time must be after start time on the same day.");
  if (draft.timing.type === "weekly") {
    if (!Number.isInteger(draft.timing.weekday) || draft.timing.weekday < 1 || draft.timing.weekday > 7) throw new Error("Choose a day of the week.");
  } else {
    queryWindow({ date: draft.timing.date, start: draft.start, end: draft.end, timezone });
  }
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
export function matchesDate(block: ScheduleBlock, date: string) {
  return block.timing.type === "date" ? block.timing.date === date : block.timing.weekday === dateValue(date).dayOfWeek;
}
export function localDateAt(epoch: number, timezone: string) {
  return Temporal.Instant.fromEpochMilliseconds(epoch).toZonedDateTimeISO(timezone).toPlainDate().toString();
}
