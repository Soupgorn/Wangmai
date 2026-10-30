import { classifyScheduleAvailability } from "@wangmai/shared";
import type { AvailabilityQuery, AvailabilityResult, CoreSnapshot, Person, ScheduleBlock } from "./types";
import { queryWindow } from "./time";

/** Preview and server share the same Busy-only recurrence, exception and DST evaluator. */
export function classifyAvailability(person: Person, blocks: readonly ScheduleBlock[], query: AvailabilityQuery): AvailabilityResult {
  return { person, ...classifyScheduleAvailability(person, blocks, query) };
}
export function findAvailability(snapshot: CoreSnapshot, query: AvailabilityQuery) {
  queryWindow(query);
  return [snapshot.profile, ...snapshot.people].map((person) => classifyAvailability(person, snapshot.blocks, query));
}
