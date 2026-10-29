import test from "node:test";
import assert from "node:assert/strict";
import { matchingPeople, summarizePeople } from "../availability-summary";
import { evaluateRange, type RangeResults } from "../date-range";
import type { AvailabilityResult, AvailabilityState, CoreSnapshot } from "../types";

const person = { id: "alex", displayName: "Alex", timezone: "Asia/Bangkok", shareAvailability: true };
const result = (id: string, state: AvailabilityState): AvailabilityResult => ({ person: { ...person, id }, state, explanation: "Status only" });
const range: RangeResults = { days: [
  { date: "2026-12-31", results: [result("alex", "available"), result("beam", "available"), result("chris", "unknown")] },
  { date: "2027-01-01", results: [result("alex", "available"), result("beam", "busy"), result("chris", "unknown")] },
  { date: "2027-01-02", results: [result("alex", "available"), result("beam", "unknown"), result("chris", "unknown")] },
], everyDay: [] };

test("person summaries count exact confirmed dates across years without counting Busy or Unknown", () => {
  const people = summarizePeople(range);
  assert.deepEqual(people.find((row) => row.person.id === "beam")?.availableDates, ["2026-12-31"]);
  assert.deepEqual(people.find((row) => row.person.id === "chris")?.availableDates, []);
  assert.equal(people[0]?.totalDays, 3);
  assert.deepEqual(matchingPeople(people, "any").map((row) => row.person.id), ["alex", "beam"]);
  assert.deepEqual(matchingPeople(people, "every").map((row) => row.person.id), ["alex"]);
  assert.equal(summarizePeople(range, "alex").some((row) => row.person.id === "alex"), false);
});

test("a missing later response is Unknown, never an every-day match", () => {
  const sparse: RangeResults = { days: [range.days[0]!, { date: "2027-01-01", results: [] }], everyDay: [] };
  const people = summarizePeople(sparse);
  assert.equal(people[0]?.days[1]?.state, "unknown");
  assert.equal(matchingPeople(people, "every").length, 0);
  assert.deepEqual(summarizePeople({ days: [], everyDay: [] }), []);
  const later: RangeResults = { days: [{ date: "2026-12-31", results: [] }, range.days[0]!], everyDay: [] };
  assert.equal(matchingPeople(summarizePeople(later), "any").length, 2);
  assert.equal(matchingPeople(summarizePeople(later), "every").length, 0);
});

test("a one-day Any and Every match has identical semantics", () => {
  const people = summarizePeople({ days: [range.days[0]!], everyDay: [] });
  assert.deepEqual(matchingPeople(people, "any"), matchingPeople(people, "every"));
});

test("same wall time per day ignores overnight busy time and keeps private schedules Unknown", () => {
  const snapshot: CoreSnapshot = { today: "2026-12-31", profile: { ...person, email: "preview@example.test" }, people: [{ ...person, id: "private", shareAvailability: false }], blocks: [] };
  for (const id of ["alex", "private"]) for (const date of ["2026-12-31", "2027-01-01"]) {
    snapshot.blocks.push({ id: id + date, ownerId: id, title: "Secret title", kind: "available", start: "13:00", end: "17:00", timing: { type: "date", date } });
    snapshot.blocks.push({ id: `night-${id}-${date}`, ownerId: id, title: "Secret appointment", kind: "busy", start: "18:00", end: "19:00", timing: { type: "date", date } });
  }
  const evaluated = evaluateRange(snapshot, { startDate: "2026-12-31", endDate: "2027-01-01", start: "13:00", end: "17:00", timezone: person.timezone });
  const people = summarizePeople(evaluated);
  assert.deepEqual(matchingPeople(people, "every").map((row) => row.person.id), ["alex"]);
  assert.ok(!JSON.stringify(people).includes("Secret"));
  assert.equal(people.find((row) => row.person.id === "private")?.days[0]?.state, "unknown");
});
