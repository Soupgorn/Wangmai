import { fileURLToPath } from "node:url";
import { test, expect, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { eq } from "drizzle-orm";
import type { AvailabilitySearchResponse, BlockDraft, ScheduleResponse } from "@wangmai/shared";
import { createAuth } from "../../../backend/src/auth/auth";
import { loadEnv } from "../../../backend/src/config/env";
import { createDatabase } from "../../../backend/src/db/client";
import { user } from "../../../backend/src/db/schema";
import { seedSession } from "../../../backend/tests/helpers";

// Regression fixtures use real PostgreSQL and server-verified Better Auth test sessions.
// They are not evidence of manual Google consent or the real-account acceptance checklist.
process.loadEnvFile(fileURLToPath(new URL("../../../.env", import.meta.url)));
const env = loadEnv({ ...process.env, NODE_ENV: "test", BETTER_AUTH_URL: "http://localhost:3100" });
if (!/^wangmai_browser_test_[a-f0-9]{16}$/.test(env.POSTGRES_DB)) throw new Error("Live finder regression fixtures require the isolated browser database runner.");
const { db, pool } = createDatabase(env); const auth = createAuth(env, db);
const ownedIds: string[] = []; const contexts: BrowserContext[] = [];
type Actor = Awaited<ReturnType<typeof seedSession>> & { context: BrowserContext };
test.use({ video: "on", reducedMotion: "no-preference" });
test.beforeEach(async ({ page }) => { await page.clock.install({ time: new Date("2026-10-29T03:00:00Z") }); });
test.afterEach(async () => { for (const context of contexts.splice(0)) await context.close(); for (const id of ownedIds.splice(0)) await db.delete(user).where(eq(user.id, id)); });
test.afterAll(async () => { await pool.end(); });
async function actor(context: BrowserContext, name: string): Promise<Actor> {
  const seeded = await seedSession(auth, env); ownedIds.push(seeded.user.id);
  await db.update(user).set({ name }).where(eq(user.id, seeded.user.id));
  const separator = seeded.cookie.indexOf("=");
  await context.addCookies([{ name: seeded.cookie.slice(0, separator), value: seeded.cookie.slice(separator + 1), url: env.BETTER_AUTH_URL, httpOnly: true, sameSite: "Lax" }]);
  return { ...seeded, context };
}
async function extra(browser: Browser, name: string) { const context = await browser.newContext({ baseURL: env.BETTER_AUTH_URL }); contexts.push(context); return actor(context, name); }
async function read(who: Actor): Promise<ScheduleResponse> { const response = await who.context.request.get("/api/v1/me/schedule"); expect(response.status()).toBe(200); return response.json(); }
async function write(who: Actor, path: string, data: unknown) { const response = await who.context.request.fetch(`/api/v1/me/schedule/${path}`, { method: path === "preferences" ? "PATCH" : "POST", headers: { origin: env.BETTER_AUTH_URL, "If-Match": `"${(await read(who)).revision}"` }, data }); expect(response.ok()).toBe(true); return response.json() as Promise<ScheduleResponse>; }
async function setup(browser: Browser, context: BrowserContext) {
  const viewer = await actor(context, "Phase 5 viewer fixture"); const a = await extra(browser, "Phase 5 Alex fixture"); const beam = await extra(browser, "Phase 5 Beam fixture"); const unknown = await extra(browser, "Phase 5 Unknown fixture"); const hidden = await extra(browser, "Phase 5 Private fixture");
  for (const who of [a, beam, hidden]) for (const date of ["2026-10-29", "2026-10-30", "2026-10-31"]) {
    const entry: BlockDraft = { title: "PRIVATE EVENT MUST NOT APPEAR", kind: who === beam && date === "2026-10-30" ? "busy" : "available", start: "13:00", end: "17:00", timing: { type: "date", date } };
    await write(who, "entries", { mutationId: crypto.randomUUID(), entry });
  }
  await write(beam, "preferences", { shareAvailability: true }); await write(unknown, "preferences", { shareAvailability: true });
  return { viewer, a, beam, unknown, hidden };
}
async function dates(page: Page) {
  await page.getByRole("button", { name: "Clear dates", exact: true }).click();
  await page.locator('[data-picker-date="2026-10-29"]').click(); await page.locator('[data-picker-date="2026-10-31"]').click();
}

test("sharing persists; real multi-account Any/Every and per-date results exclude private users; preview stays isolated", async ({ page, context, browser }) => {
  const { a, beam, unknown, hidden } = await setup(browser, context);
  expect((await read(a)).shareAvailability).toBe(false);
  const owner = await a.context.newPage(); await owner.goto("/settings");
  const sharing = owner.getByRole("switch", { name: "Share my availability" }); await expect(sharing).toHaveAttribute("aria-checked", "false");
  await sharing.click(); await owner.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(owner.getByText("Preferences saved to your account.", { exact: true })).toBeVisible();
  await owner.reload(); await expect(sharing).toHaveAttribute("aria-checked", "true");
  await page.goto("/availability"); await dates(page);
  await expect(page.getByTestId(`person-${a.user.id}`)).toContainText("Available 3 of 3 days");
  await expect(page.getByTestId(`person-${beam.user.id}`)).toContainText("Available 2 of 3 days");
  await expect(page.getByText("Preview people", { exact: true })).toHaveCount(0);
  await expect(page.getByTestId(`person-${hidden.user.id}`)).toHaveCount(0);
  await expect(page.getByTestId("person-jamie")).toHaveCount(0);
  await page.getByRole("button", { name: "Available on Every Day", exact: true }).click();
  await expect(page.getByTestId(`person-${beam.user.id}`)).toHaveCount(0); await expect(page.getByTestId(`person-${a.user.id}`)).toBeVisible();
  await page.getByRole("button", { name: "By Date", exact: true }).click(); await page.getByLabel("Results for date").selectOption("2026-10-30");
  await expect(page.getByTestId(`person-${beam.user.id}`)).toHaveAttribute("data-state", "busy");
  await expect(page.getByTestId(`person-${unknown.user.id}`)).toHaveAttribute("data-state", "unknown");
  await expect(page.getByText("PRIVATE EVENT MUST NOT APPEAR", { exact: true })).toHaveCount(0);
  const wire = await context.request.get("/api/v1/availability?startDate=2026-10-29&endDate=2026-10-31&startTime=13:00&endTime=15:00&timezone=Asia%2FBangkok");
  const payload: AvailabilitySearchResponse = await wire.json(); expect(JSON.stringify(payload)).not.toContain(hidden.user.id); expect(JSON.stringify(payload)).not.toContain(a.user.email);
  await sharing.click(); await owner.getByRole("button", { name: "Save changes", exact: true }).click(); await expect(sharing).toHaveAttribute("aria-checked", "false");
  await expect(owner.getByText("Preferences saved to your account.", { exact: true })).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.getByTestId(`person-${a.user.id}`)).toHaveCount(0);
  await expect(page.getByTestId(`person-${beam.user.id}`)).toHaveAttribute("data-state", "busy");
  const before = await read(a); const calls: string[] = []; owner.on("request", (request) => { if (request.url().includes("/api/v1/")) calls.push(request.url()); });
  await owner.goto("/preview/settings"); await owner.getByRole("switch", { name: "Share my availability" }).click(); await owner.getByRole("button", { name: "Save changes", exact: true }).click();
  await owner.goto("/preview/availability"); await expect(owner.getByText("Preview people", { exact: true })).toBeVisible();
  expect(calls).toEqual([]); expect(await read(a)).toEqual(before);
});

test("real search handles failure/retry, debounces input, and rejects late and reused-query responses", async ({ page, context, browser }) => {
  const { a, beam } = await setup(browser, context); await write(a, "preferences", { shareAvailability: true });
  await page.route("**/api/v1/availability?**", (route) => route.fulfill({ status: 503, json: { error: { message: "Availability temporarily unavailable." } } }));
  await page.goto("/availability"); await expect(page.getByRole("alert").filter({ hasText: "Couldn’t load shared availability." })).toBeVisible();
  await expect(page.getByTestId(`person-${a.user.id}`)).toHaveCount(0);
  await page.unroute("**/api/v1/availability?**"); await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(page.getByTestId(`person-${a.user.id}`)).toBeVisible();
  await page.evaluate(() => {
    const original = window.fetch.bind(window); let held = false;
    window.fetch = async (...args) => {
      const response = await original(...args); const url = new URL(String(args[0]), location.origin);
      if (!held && url.pathname === "/api/v1/availability" && url.searchParams.get("startDate") === "2026-10-30") {
        held = true;
        return new Promise<Response>((resolve) => { Object.assign(window, { heldAvailabilityReady: true, releaseHeldAvailability: () => resolve(response) }); });
      }
      return response;
    };
  });
  await page.getByText("Edit dates directly", { exact: true }).click(); await page.getByLabel("Start Date", { exact: true }).fill("2026-10-30");
  await expect.poll(() => page.evaluate(() => (window as unknown as { heldAvailabilityReady?: boolean }).heldAvailabilityReady)).toBe(true);
  await page.getByLabel("Start Date", { exact: true }).fill("2026-10-29");
  await expect(page.getByRole("status", { name: "Loading shared availability", exact: true })).toBeVisible();
  await expect(page.getByTestId(`person-${beam.user.id}`)).toHaveAttribute("data-state", "available");
  await page.evaluate(() => (window as unknown as { releaseHeldAvailability: () => void }).releaseHeldAvailability());
  await expect(page.getByTestId(`person-${beam.user.id}`)).toHaveAttribute("data-state", "available");
  const starts: string[] = []; page.on("request", (request) => { const url = new URL(request.url()); if (url.pathname === "/api/v1/availability") starts.push(url.searchParams.get("startTime")!); });
  await page.getByLabel("From", { exact: true }).fill("14:00"); await page.getByLabel("From", { exact: true }).fill("14:15"); await page.getByLabel("From", { exact: true }).fill("14:30");
  await expect(page.getByRole("status", { name: "Availability summary", exact: true })).toContainText("14:30");
  expect(starts.at(-1)).toBe("14:30"); expect(starts.length).toBeLessThan(3);
  await page.getByRole("button", { name: "Clear dates", exact: true }).click(); await expect(page.getByTestId(`person-${beam.user.id}`)).toHaveCount(0);
});

test("live results preserve the unified picker, actual animations, responsive layouts and reduced motion", async ({ page, context, browser }, testInfo) => {
  test.setTimeout(100_000);
  const { a, beam } = await setup(browser, context); await write(a, "preferences", { shareAvailability: true });
  await page.addInitScript(() => {
    const ids: string[] = []; Object.assign(window, { liveAnimations: ids }); const original = Element.prototype.animate;
    Element.prototype.animate = function (frames, options) { const animation = original.call(this, frames, options); requestAnimationFrame(() => ids.push(animation.id)); return animation; };
  });
  await page.goto("/availability"); await dates(page); await expect(page.getByTestId(`person-${beam.user.id}`)).toBeVisible();
  await page.getByRole("button", { name: "Available on Every Day", exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { liveAnimations: string[] }).liveAnimations)).toEqual(expect.arrayContaining(["wm-result", "wm-finder-exit", "wm-finder-segment"]));
  await page.getByRole("button", { name: "Available on Any Day", exact: true }).click();
  for (const width of [1440, 1024, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 }); await page.emulateMedia({ reducedMotion: "reduce" });
    await expect(page.getByTestId(`person-${a.user.id}`)).toContainText("Available 3 of 3 days");
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0);
    expect(await page.getByTestId("date-selection-summary").locator(":scope > span").evaluate((element) => getComputedStyle(element).animationName)).toBe("none");
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: testInfo.outputPath(`live-${width}.png`), fullPage: true });
    await page.getByRole("button", { name: "By Date", exact: true }).click(); await page.getByLabel("Results for date").selectOption("2026-10-30");
    await expect(page.getByTestId(`person-${beam.user.id}`)).toHaveAttribute("data-state", "busy");
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0);
    await page.getByRole("button", { name: "By Person", exact: true }).click();
  }
});
