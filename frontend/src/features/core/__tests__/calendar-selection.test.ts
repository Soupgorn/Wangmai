import test from "node:test";
import assert from "node:assert/strict";
import { chooseCalendarDate, editCalendarDate, emptySelection, selectionSummary } from "../calendar-selection";

test("first calendar activation immediately produces a complete one-day query and summary", () => {
  const first = chooseCalendarDate(emptySelection, "2026-10-29");
  assert.deepEqual(first, { start: "2026-10-29", end: "2026-10-29", anchor: "2026-10-29" });
  assert.deepEqual(selectionSummary(first), { label: "October 29, 2026", count: "1 day selected", days: 1 });
});
test("second activation completes an inclusive range and the next activation starts fresh", () => {
  const range = chooseCalendarDate(chooseCalendarDate(emptySelection, "2026-10-29"), "2026-10-31");
  assert.deepEqual(range, { start: "2026-10-29", end: "2026-10-31", anchor: null });
  assert.equal(selectionSummary(range).count, "3 days selected");
  assert.equal(selectionSummary(range).label, "October 29, 2026 – October 31, 2026");
  assert.deepEqual(chooseCalendarDate(range, "2026-11-02"), { start: "2026-11-02", end: "2026-11-02", anchor: "2026-11-02" });
});
test("reverse selections normalize across the year; repeat activation keeps one day", () => {
  const first = chooseCalendarDate(emptySelection, "2027-01-02");
  assert.deepEqual(chooseCalendarDate(first, "2026-12-31"), { start: "2026-12-31", end: "2027-01-02", anchor: null });
  assert.equal(selectionSummary(chooseCalendarDate(first, "2026-12-31")).days, 3);
  assert.deepEqual(chooseCalendarDate(first, "2027-01-02"), first);
});
test("clear has no implicit today selection and starts a new range anchor", () => {
  assert.equal(selectionSummary(emptySelection).days, 0);
  assert.equal(selectionSummary(emptySelection).label, "Choose a day or a date range.");
  assert.equal(chooseCalendarDate(emptySelection, "2026-11-01").anchor, "2026-11-01");
});
test("native single-date editing updates both boundaries while invalid typed dates stay safely editable", () => {
  const first = chooseCalendarDate(emptySelection, "2026-10-29");
  const typed = editCalendarDate(first, "2026-11-02", "start");
  assert.equal(typed.end, "2026-11-02");
  assert.equal(selectionSummary(editCalendarDate(typed, "2026-11-04", "end")).days, 3);
  assert.equal(selectionSummary(editCalendarDate(typed, "", "start")).days, 0);
  assert.equal(selectionSummary(editCalendarDate(typed, "2026-10-01", "end")).days, 0);
  assert.throws(() => chooseCalendarDate(emptySelection, "2026-02-30"));
});
