import { inclusiveCalendarDates } from "@wangmai/shared";
import { queryWindow, validateBlock } from "./time";
import { findAvailability } from "./availability";
import type { AvailabilityQuery, AvailabilityResult, BlockDraft, CoreSnapshot } from "./types";

export const inclusiveDates = inclusiveCalendarDates;

export type RangeQuery = Omit<AvailabilityQuery, "date"> & { startDate: string; endDate: string };
/** Phase 5 contract: status-only results for each local calendar date, never private blocks. */
export type RangeResults = { days: { date: string; results: AvailabilityResult[] }[]; everyDay: AvailabilityResult[] };
export function evaluateRange(snapshot: CoreSnapshot, query: RangeQuery): RangeResults {
  const dates = inclusiveDates(query.startDate, query.endDate);
  // Validate every wall-time, including DST transitions, before evaluating any results.
  dates.forEach((date) => queryWindow({ ...query, date }));
  const days = dates.map((date) => ({ date, results: findAvailability(snapshot, { ...query, date }) }));
  const everyDay = (days[0]?.results ?? []).filter((result) => days.every((day) => day.results.some((other) => other.person.id === result.person.id && other.state === "available")));
  return { days, everyDay };
}

export type SelectionMode = "single" | "range" | "multiple";
export function selectDate(selected: string[], date: string, mode: SelectionMode, anchor: string | null): string[] {
  if (mode === "single") return [date];
  if (mode === "range") return anchor ? inclusiveDates(anchor < date ? anchor : date, anchor < date ? date : anchor, 366) : [date];
  return (selected.includes(date) ? selected.filter((value) => value !== date) : [...selected, date]).sort();
}

/** Sequential writes preserve revision checks. Stop at the first unconfirmed write. */
export async function applyDatedBlocks(dates: string[], draft: BlockDraft, timezone: string, save: (draft: BlockDraft) => Promise<void>) {
  const drafts = [...new Set(dates)].sort().map((date) => ({ ...draft, timing: { type: "date" as const, date } }));
  drafts.forEach((value) => validateBlock(value, timezone));
  const confirmed: string[] = [];
  for (const value of drafts) {
    try { await save(value); confirmed.push(value.timing.date); }
    catch (reason) { return { confirmed, remaining: drafts.slice(confirmed.length).map((item) => item.timing.date), error: reason instanceof Error ? reason.message : "Save could not be confirmed." }; }
  }
  return { confirmed, remaining: [] as string[], error: "" };
}
