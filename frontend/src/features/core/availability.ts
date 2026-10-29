import type { AvailabilityQuery, AvailabilityResult, CoreSnapshot, Person, ScheduleBlock } from "./types";
import { addDays, instant, localDateAt, matchesDate, queryWindow } from "./time";

type Interval = { start: number; end: number; kind: "available" | "busy" };

export function classifyAvailability(person: Person, blocks: readonly ScheduleBlock[], query: AvailabilityQuery): AvailabilityResult {
  const window = queryWindow(query);
  if (!person.shareAvailability) return { person, state: "unknown", explanation: "Availability isn’t shared." };
  const firstDate = localDateAt(window.start, person.timezone);
  const lastDate = localDateAt(window.end - 1, person.timezone);
  const intervals: Interval[] = [];
  let uncertain = false;

  for (let date = firstDate; date <= lastDate; date = addDays(date, 1)) {
    for (const block of blocks) {
      if (block.ownerId !== person.id || !matchesDate(block, date)) continue;
      try {
        intervals.push({ start: instant(date, block.start, person.timezone), end: instant(date, block.end, person.timezone), kind: block.kind });
      } catch {
        // A weekly wall time that is ambiguous/nonexistent on a DST transition is unknown.
        uncertain = true;
      }
    }
  }

  if (intervals.some((block) => block.kind === "busy" && block.start < window.end && block.end > window.start)) {
    return { person, state: "busy", explanation: "Unavailable during this time." };
  }
  if (uncertain) return { person, state: "unknown", explanation: "A daylight-saving transition makes this availability uncertain." };

  let coveredUntil = window.start;
  for (const block of intervals.filter((value) => value.kind === "available").sort((a, b) => a.start - b.start)) {
    if (block.end <= coveredUntil) continue;
    if (block.start > coveredUntil) break;
    coveredUntil = block.end;
    if (coveredUntil >= window.end) return { person, state: "available", explanation: "Free for the whole selected time." };
  }
  return { person, state: "unknown", explanation: "No shared availability for the full time range." };
}

export function findAvailability(snapshot: CoreSnapshot, query: AvailabilityQuery) {
  queryWindow(query);
  return [snapshot.profile, ...snapshot.people].map((person) => classifyAvailability(person, snapshot.blocks, query));
}
