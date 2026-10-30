import { availabilityResponseSchema, type AvailabilitySearchQuery, type AvailabilitySearchResponse } from "@wangmai/shared";
import type { RangeResults } from "./date-range";
import { ScheduleRequestError } from "./database-repository";

export async function fetchAvailability(query: AvailabilitySearchQuery, signal: AbortSignal): Promise<AvailabilitySearchResponse> {
  const parameters = new URLSearchParams(query);
  let response: Response;
  try { response = await fetch(`/api/v1/availability?${parameters}`, { credentials: "same-origin", cache: "no-store", signal: AbortSignal.any([signal, AbortSignal.timeout(15_000)]) }); }
  catch (error) { if (signal.aborted) throw error; throw new Error("Shared availability could not load. Check your connection and try again."); }
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new ScheduleRequestError(typeof body?.error?.message === "string" ? body.error.message : response.status === 401 ? "Your session ended. Sign in again." : "Shared availability could not load. Please try again.", response.status);
  }
  const parsed = availabilityResponseSchema.safeParse(await response.json().catch(() => null));
  if (!parsed.success || !Object.entries(query).every(([key, value]) => parsed.data.query[key as keyof AvailabilitySearchQuery] === value)) throw new Error("Shared availability returned an unexpected response. Please try again.");
  return parsed.data;
}

/** Adapt status-only wire data; no schedule, owner timezone, or email reaches the view. */
export function rangeFromResponse(response: AvailabilitySearchResponse): RangeResults {
  const people = new Map(response.people.map(({ id, displayName, image }) => [id, { id, displayName, image }]));
  const explanation = { available: "No unavailable block overlaps this time.", busy: "Unavailable during this time.", unknown: "This time could not be determined safely." };
  const days = response.days.map((day) => ({ date: day.date, results: day.results.map((row) => ({ person: people.get(row.personId)!, state: row.state, explanation: explanation[row.state] })) }));
  const every = new Set(response.people.filter((person) => person.availableDates.length === days.length).map((person) => person.id));
  return { days, everyDay: (days[0]?.results ?? []).filter((result) => every.has(result.person.id)) };
}
