import assert from "node:assert/strict";
import test from "node:test";
import { validateScheduleBlock } from "@wangmai/shared";
import { classifyAvailability } from "../availability";
import { layoutBlocks } from "../calendar-layout";
import { clock, instant, matchesDate } from "../time";
import type { Person, ScheduleBlock } from "../types";

const person: Person = { id: "private", displayName: "Private", timezone: "Asia/Bangkok", shareAvailability: true };
const recurring: ScheduleBlock = { id: "rule", ownerId: person.id, title: "Weekly", kind: "busy", start: "09:00", end: "12:00", timing: { type: "weekly", weekday: 1 } };
test("weekly rules continue across weeks; a dated replacement/cancellation only suppresses its own date", () => {
  const rule = { ...recurring, excludedDates: ["2026-11-02"] };
  assert.equal(matchesDate(rule, "2026-11-02"), false);
  assert.equal(matchesDate(rule, "2026-11-09"), true);
  const replacement: ScheduleBlock = { ...recurring, id: "exception", timing: { type: "date", date: "2026-11-02" }, start: "15:00", end: "16:00" };
  assert.equal(classifyAvailability(person, [rule, replacement], { date: "2026-11-02", start: "09:00", end: "10:00", timezone: person.timezone }).state, "available");
  assert.equal(classifyAvailability(person, [rule, replacement], { date: "2026-11-02", start: "15:00", end: "16:00", timezone: person.timezone }).state, "busy");
  assert.equal(classifyAvailability(person, [rule, replacement], { date: "2026-11-09", start: "09:00", end: "10:00", timezone: person.timezone }).state, "busy");
});
test("partial busy overlaps override availability, adjacent boundaries remain half-open", () => {
  const busy: ScheduleBlock = { ...recurring, id: "busy", kind: "busy", start: "10:00", end: "11:00", timing: { type: "date", date: "2026-11-02" } };
  const query = { date: "2026-11-02", start: "09:00", end: "10:00", timezone: person.timezone };
  const legacy = { ...recurring, kind: "available" as const };
  assert.equal(classifyAvailability(person, [legacy, busy], query).state, "available");
  assert.equal(classifyAvailability(person, [legacy, busy], { ...query, end: "10:01" }).state, "busy");
  assert.equal(classifyAvailability(person, [legacy, busy], { ...query, start: "11:00", end: "12:00" }).state, "available");
  assert.equal(layoutBlocks([recurring, busy])[0]!.lanes, 2);
});
test("midnight belongs to the following local date; overnight ranges require two blocks", () => {
  assert.equal(clock(1440), "24:00");
  assert.equal(instant("2026-11-02", "24:00", person.timezone), instant("2026-11-03", "00:00", person.timezone));
  validateScheduleBlock({ title: "Midnight", kind: "available", timing: { type: "date", date: "2026-11-02" }, start: "23:00", end: "24:00" }, person.timezone);
  assert.throws(() => validateScheduleBlock({ title: "Overnight", kind: "busy", timing: { type: "date", date: "2026-11-02" }, start: "23:00", end: "01:00" }, person.timezone));
});
test("DST gaps/repeats are rejected for dated entries; weekly occurrences are hidden on that date", () => {
  const gap = { ...recurring, start: "02:30", end: "04:00", timing: { type: "weekly" as const, weekday: 7 } };
  assert.equal(matchesDate(gap, "2026-03-08", "America/New_York"), false);
  assert.equal(matchesDate(gap, "2026-03-15", "America/New_York"), true);
  assert.throws(() => validateScheduleBlock({ title: "Repeated", kind: "busy", start: "01:30", end: "03:00", timing: { type: "date", date: "2026-11-01" } }, "America/New_York"), /daylight saving/);
  assert.equal(instant("2026-03-08", "24:00", "America/New_York") - instant("2026-03-08", "00:00", "America/New_York"), 23 * 3600_000);
});
