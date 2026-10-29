import type { RangeResults } from "./date-range";
import type { AvailabilityState, PublicPerson } from "./types";

export type PersonAvailability = {
  person: PublicPerson;
  days: { date: string; state: AvailabilityState }[];
  availableDates: string[];
  totalDays: number;
};

/** Aggregate eligible people from status-only responses across the range.
 * Missing results remain Unknown; a missing day can never qualify for Every day.
 */
export function summarizePeople(range: RangeResults, excludeId?: string): PersonAvailability[] {
  const people = new Map(range.days.flatMap((day) => day.results).filter((result) => result.person.id !== excludeId).map((result) => [result.person.id, result.person]));
  return [...people.values()].map((person) => {
    const days = range.days.map((day) => ({ date: day.date, state: day.results.find((result) => result.person.id === person.id)?.state ?? "unknown" as const }));
    return { person, days, availableDates: days.filter((day) => day.state === "available").map((day) => day.date), totalDays: days.length };
  }).sort((a, b) => b.availableDates.length - a.availableDates.length || a.person.displayName.localeCompare(b.person.displayName));
}

export function matchingPeople(people: PersonAvailability[], mode: "any" | "every") {
  return people.filter((person) => person.availableDates.length > 0 && (mode === "any" || person.availableDates.length === person.totalDays));
}
