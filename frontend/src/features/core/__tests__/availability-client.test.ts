import assert from "node:assert/strict";
import test from "node:test";
import { availabilityResponseSchema, googleProfileImage, type AvailabilitySearchResponse } from "@wangmai/shared";
import { fetchAvailability, rangeFromResponse } from "../availability-client";

const query = { startDate: "2026-12-31", endDate: "2027-01-01", startTime: "13:00", endTime: "15:00", timezone: "Asia/Bangkok" };
const response: AvailabilitySearchResponse = { query, people: [{ id: "public-a", displayName: "Alex", image: null, availableDates: ["2026-12-31", "2027-01-01"] }, { id: "public-b", displayName: "Beam", image: null, availableDates: ["2026-12-31"] }], days: [{ date: "2026-12-31", results: [{ personId: "public-a", state: "available" }, { personId: "public-b", state: "available" }] }, { date: "2027-01-01", results: [{ personId: "public-a", state: "available" }, { personId: "public-b", state: "unknown" }] }], counts: { anyDay: 2, everyDay: 1 } };

test("status-only adapter preserves per-day Unknown and derives every-day matches without private profile fields", () => {
  const range = rangeFromResponse(availabilityResponseSchema.parse(response));
  assert.deepEqual(range.everyDay.map((row) => row.person.id), ["public-a"]);
  assert.equal(range.days[1]?.results[1]?.state, "unknown");
  assert.deepEqual(Object.keys(range.days[0]!.results[0]!.person).sort(), ["displayName", "id", "image"]);
});
test("wire schema rejects leaked fields, missing days, unknown users and inaccurate aggregates", () => {
  for (const value of [
    { ...response, email: "private@example.invalid" },
    { ...response, people: [{ ...response.people[0], email: "private@example.invalid" }] },
    { ...response, days: response.days.slice(1) },
    { ...response, counts: { anyDay: 50, everyDay: 1 } },
    { ...response, days: [{ ...response.days[0], results: [{ personId: "hidden", state: "available" }] }, response.days[1]] },
    { ...response, query: { ...query, endDate: "2026-12-01" } },
  ]) assert.equal(availabilityResponseSchema.safeParse(value).success, false);
});
test("only approved HTTPS Google photo URLs are exposed", () => {
  assert.equal(googleProfileImage("https://lh3.googleusercontent.com/a/photo"), "https://lh3.googleusercontent.com/a/photo");
  for (const value of ["http://lh3.googleusercontent.com/a", "https://lh3.googleusercontent.com.evil.invalid/a", "javascript:alert(1)", "https://user:password@lh3.googleusercontent.com/a", "https://example.invalid/picture"]) assert.equal(googleProfileImage(value), null);
});
test("fetch uses same-origin credentials, no cache, cancellation and validation; failures stay distinct from empty results", async (t) => {
  const controller = new AbortController();
  t.mock.method(globalThis, "fetch", async (url: Parameters<typeof fetch>[0], init?: RequestInit) => {
    assert.ok(String(url).startsWith("/api/v1/availability?")); assert.equal(init?.credentials, "same-origin"); assert.equal(init?.cache, "no-store"); assert.ok(init?.signal);
    return Response.json(response);
  });
  assert.deepEqual(await fetchAvailability(query, controller.signal), response);
  t.mock.restoreAll();
  t.mock.method(globalThis, "fetch", async () => Response.json({ error: { message: "Unavailable" } }, { status: 503 }));
  await assert.rejects(fetchAvailability(query, controller.signal), /Unavailable/);
  t.mock.restoreAll();
  t.mock.method(globalThis, "fetch", async () => Response.json({ ...response, query: { ...query, startTime: "14:00" } }));
  await assert.rejects(fetchAvailability(query, controller.signal), /unexpected response/);
});
