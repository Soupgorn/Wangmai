import test from "node:test";
import assert from "node:assert/strict";
import { applyDatedBlocks, evaluateRange, inclusiveDates, selectDate } from "../date-range";
import { addMonths, monthDates } from "../time";
import type { BlockDraft, CoreSnapshot } from "../types";

const draft: BlockDraft = { title: "Free time", kind: "available", start: "13:00", end: "15:00", timing: { type: "weekly", weekday: 1 } };
const profile = { id: "a", displayName: "Alex", email: "a@example.test", timezone: "Asia/Bangkok", shareAvailability: true };
test("month navigation constrains dates and grids cross years", () => {
  assert.equal(addMonths("2026-01-31", 1), "2026-02-28");
  assert.equal(addMonths("2026-12-29", 1), "2027-01-29");
  assert.equal(monthDates("2026-12-29").length, 42);
});
test("single, individual and contiguous selections retain dates across months", () => {
  assert.deepEqual(selectDate([], "2026-12-31", "single", null), ["2026-12-31"]);
  assert.deepEqual(selectDate(["2026-12-31"], "2027-01-02", "multiple", null), ["2026-12-31", "2027-01-02"]);
  assert.deepEqual(selectDate(["2026-12-31"], "2026-12-31", "multiple", null), []);
  assert.deepEqual(selectDate([], "2026-12-31", "range", "2027-01-02"), ["2026-12-31", "2027-01-01", "2027-01-02"]);
});
test("inclusive range validates real dates, order and calendar-day maximum", () => {
  assert.equal(inclusiveDates("2026-10-29", "2026-11-28").length, 31);
  for (const pair of [["2026-10-29", "2026-11-29"], ["2026-11-02", "2026-11-01"], ["2026-02-30", "2026-03-01"], ["", "2026-03-01"]]) assert.throws(() => inclusiveDates(pair[0]!, pair[1]!));
});
test("each day evaluates its own interval; every-day intersection excludes unknown and private users", () => {
  const snapshot: CoreSnapshot = { today: "2026-12-31", profile, people: [{ ...profile, id: "b", displayName: "Beam" }, { ...profile, id: "c", shareAvailability: false }], blocks: ["a", "b", "c"].flatMap((id) => ["2026-12-31", "2027-01-01"].map((date) => ({ ...draft, id: id + date, ownerId: id, timing: { type: "date" as const, date } }))) };
  snapshot.blocks.push({ ...draft, id: "busy", ownerId: "b", kind: "busy", timing: { type: "date", date: "2027-01-01" } });
  const result = evaluateRange(snapshot, { startDate: "2026-12-31", endDate: "2027-01-01", start: "13:00", end: "15:00", timezone: profile.timezone });
  assert.deepEqual(result.days.map((day) => day.results.map((person) => person.state)), [["available", "available", "unknown"], ["available", "busy", "unknown"]]);
  assert.deepEqual(result.everyDay.map((person) => person.person.id), ["a"]);
  snapshot.blocks = []; assert.equal(evaluateRange(snapshot, { startDate: "2026-12-31", endDate: "2027-01-01", start: "13:00", end: "15:00", timezone: profile.timezone }).everyDay.length, 2);
});
test("DST gap and repeated query times fail instead of producing availability", () => {
  const snapshot: CoreSnapshot = { today: "2026-03-08", profile, people: [], blocks: [] };
  for (const [date, start, end] of [["2026-03-08", "02:00", "03:00"], ["2026-11-01", "01:00", "02:00"]]) assert.throws(() => evaluateRange(snapshot, { startDate: date!, endDate: date!, start: start!, end: end!, timezone: "America/New_York" }));
});
test("bulk writes are date-only, sequential, and stop accurately on partial failure", async () => {
  const calls: BlockDraft[] = [];
  const result = await applyDatedBlocks(["2026-10-29", "2026-10-30", "2026-10-31"], draft, profile.timezone, async (value) => { calls.push(value); if (calls.length === 2) throw new Error("Connection lost"); });
  assert.deepEqual(result.confirmed, ["2026-10-29"]); assert.deepEqual(result.remaining, ["2026-10-30", "2026-10-31"]);
  assert.equal(calls.length, 2); assert.ok(calls.every((call) => call.timing.type === "date")); assert.equal(draft.timing.type, "weekly");
  let writes = 0;
  await assert.rejects(() => applyDatedBlocks(["2026-03-07", "2026-03-08"], { ...draft, start: "02:00", end: "03:00" }, "America/New_York", async () => { writes++; }));
  assert.equal(writes, 0);
});
