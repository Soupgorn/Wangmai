import test from "node:test";
import assert from "node:assert/strict";
import { classifyAvailability, findAvailability } from "../availability";
import { MockCoreRepository } from "../mock-repository";
import { createMockSnapshot } from "../mock-data";
import { addDays, queryWindow, validateBlock, weekDates } from "../time";
import { layoutBlocks } from "../calendar-layout";
import type { AvailabilityQuery, BlockDraft, Person, ScheduleBlock } from "../types";

const person: Person = { id: "me", displayName: "Test", timezone: "Asia/Bangkok", shareAvailability: true };
const query: AvailabilityQuery = { date: "2026-11-02", start: "10:00", end: "11:00", timezone: "Asia/Bangkok" };
function block(id: string, start: string, end: string, kind: "available" | "busy" = "available"): ScheduleBlock {
  return { id, ownerId: "me", title: id, kind, start, end, timing: { type: "weekly", weekday: 1 } };
}

test("shared gaps are available and legacy Available markers do not constrain the query", () => {
  assert.equal(classifyAvailability(person, [], query).state, "available");
  assert.equal(classifyAvailability(person, [block("partial", "10:00", "10:30")], query).state, "available");
  assert.equal(classifyAvailability(person, [block("one", "09:00", "10:30"), block("two", "10:30", "12:00")], query).state, "available");
  assert.equal(classifyAvailability(person, [block("one", "09:00", "10:29"), block("two", "10:30", "12:00")], query).state, "available");
});

test("busy takes precedence and intervals are half-open at their boundaries", () => {
  const free = block("free", "09:00", "17:00");
  assert.equal(classifyAvailability(person, [free, block("busy", "10:30", "10:45", "busy")], query).state, "busy");
  assert.equal(classifyAvailability(person, [free, block("before", "09:00", "10:00", "busy"), block("after", "11:00", "12:00", "busy")], query).state, "available");
});

test("private profiles remain unknown while shared empty schedules are available", () => {
  assert.equal(classifyAvailability({ ...person, shareAvailability: false }, [block("private", "09:00", "17:00", "busy")], query).state, "unknown");
  assert.equal(classifyAvailability(person, [], query).state, "available");
  assert.equal(classifyAvailability(person, [{ ...block("other", "09:00", "17:00", "busy"), ownerId: "another-person" }], query).state, "available");
});

test("a date-specific busy exception affects only that date", () => {
  const exception: ScheduleBlock = { ...block("appointment", "10:00", "11:00", "busy"), timing: { type: "date", date: query.date } };
  const blocks = [block("free", "09:00", "17:00"), exception];
  assert.equal(classifyAvailability(person, blocks, query).state, "busy");
  assert.equal(classifyAvailability(person, blocks, { ...query, date: addDays(query.date, 7) }).state, "available");
});

test("queries are converted across timezones and date boundaries", () => {
  const tokyo: Person = { ...person, timezone: "Asia/Tokyo" };
  assert.equal(classifyAvailability(tokyo, [block("Tokyo lunch", "12:00", "13:00", "busy")], query).state, "busy");
  const mondayTokyo = block("Early Monday", "01:00", "02:00", "busy");
  assert.equal(classifyAvailability(tokyo, [mondayTokyo], { date: "2026-11-01", start: "16:00", end: "17:00", timezone: "UTC" }).state, "busy");
});

test("invalid ranges, nonexistent dates and ambiguous DST inputs are rejected", () => {
  assert.throws(() => queryWindow({ ...query, end: "09:00" }), /after start/);
  assert.throws(() => queryWindow({ ...query, date: "2026-02-30" }), /valid date/);
  assert.throws(() => queryWindow({ date: "2026-03-08", start: "02:15", end: "03:30", timezone: "America/New_York" }), /daylight saving/);
  assert.throws(() => queryWindow({ date: "2026-11-01", start: "01:15", end: "02:30", timezone: "America/New_York" }), /daylight saving/);
  assert.throws(() => validateBlock({ title: "Test", kind: "busy", start: "12:00", end: "11:00", timing: { type: "weekly", weekday: 1 } }, "Asia/Bangkok"), /after start/);
});

test("an ambiguous recurring busy period cannot incorrectly yield available", () => {
  const ny = { ...person, timezone: "America/New_York" };
  const free = { ...block("free", "00:00", "04:00"), timing: { type: "weekly" as const, weekday: 7 } };
  const busy = { ...block("ambiguous", "01:15", "01:45", "busy"), timing: { type: "weekly" as const, weekday: 7 } };
  assert.equal(classifyAvailability(ny, [free, busy], { date: "2026-11-01", start: "05:00", end: "07:00", timezone: "UTC" }).state, "unknown");
});

test("an ambiguous legacy Available marker is ignored without changing stored blocks", () => {
  const ny = { ...person, timezone: "America/New_York" };
  const legacy = { ...block("legacy", "01:15", "01:45"), timing: { type: "weekly" as const, weekday: 7 } };
  const before = structuredClone(legacy);
  assert.equal(classifyAvailability(ny, [legacy], { date: "2026-11-01", start: "05:00", end: "07:00", timezone: "UTC" }).state, "available");
  assert.deepEqual(legacy, before);
});

test("week navigation crosses month and year boundaries", () => {
  assert.deepEqual(weekDates("2027-01-01"), ["2026-12-28", "2026-12-29", "2026-12-30", "2026-12-31", "2027-01-01", "2027-01-02", "2027-01-03"]);
});

test("overlapping calendar blocks share lanes, including connected clusters", () => {
  const layout = layoutBlocks([block("free", "09:00", "12:00"), block("busy", "10:00", "11:00", "busy"), block("next", "11:00", "13:00", "busy"), block("later", "14:00", "15:00")]);
  assert.deepEqual(layout.map(({ lane, lanes }) => [lane, lanes]), [[0, 2], [1, 2], [1, 2], [0, 1]]);
});

test("mock repository supports CRUD without mutating fixtures or other people", async () => {
  const seed = createMockSnapshot(query.date);
  const repository = new MockCoreRepository(seed);
  const initial = await repository.getSnapshot();
  const draft: BlockDraft = { title: "  My free time  ", kind: "available", start: "18:00", end: "19:00", timing: { type: "date", date: query.date } };
  const created = await repository.saveBlock(draft);
  const saved = created.blocks.at(-1)!;
  assert.equal(saved.title, "My free time");
  assert.equal(seed.blocks.length, initial.blocks.length);
  const edited = await repository.saveBlock({ ...draft, end: "20:00", kind: "busy" }, saved.id);
  assert.equal(edited.blocks.find((item) => item.id === saved.id)?.end, "20:00");
  const deleted = await repository.deleteBlock(saved.id);
  assert.equal(deleted.blocks.length, initial.blocks.length);
  const other = initial.blocks.find((item) => item.ownerId !== "me")!;
  await assert.rejects(repository.deleteBlock(other.id), /no longer exists/);
  await assert.rejects(repository.saveBlock(draft, other.id), /no longer exists/);
  initial.profile.displayName = "Mutation";
  assert.equal((await repository.getSnapshot()).profile.displayName, "Alex Morgan");
});

test("settings immediately affect shared status, and a new repository resets the preview", async () => {
  const repository = new MockCoreRepository(createMockSnapshot(query.date));
  const updated = await repository.updateProfile({ displayName: "  Preview name  ", timezone: "Asia/Tokyo", shareAvailability: false });
  assert.equal(updated.profile.displayName, "Preview name");
  assert.equal(findAvailability(updated, query).find((result) => result.person.id === "me")?.state, "unknown");
  await assert.rejects(repository.updateProfile({ displayName: " ", timezone: "UTC", shareAvailability: true }), /display name/);
  await assert.rejects(repository.updateProfile({ displayName: "Name", timezone: "Invalid/Zone", shareAvailability: true }), /timezone/);
  assert.equal((await new MockCoreRepository(createMockSnapshot(query.date)).getSnapshot()).profile.displayName, "Alex Morgan");
});
