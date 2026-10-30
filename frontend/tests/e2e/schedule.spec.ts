import { fileURLToPath } from "node:url";
import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { eq } from "drizzle-orm";
import type { ScheduleResponse } from "@wangmai/shared";
import { createAuth } from "../../../backend/src/auth/auth";
import { loadEnv } from "../../../backend/src/config/env";
import { createDatabase } from "../../../backend/src/db/client";
import { user } from "../../../backend/src/db/schema";
import { seedSession, signedCookie } from "../../../backend/tests/helpers";

process.loadEnvFile(fileURLToPath(new URL("../../../.env", import.meta.url)));
const env = loadEnv({ ...process.env, NODE_ENV: "test", BETTER_AUTH_URL: "http://localhost:3100" });
const { db, pool } = createDatabase(env); const auth = createAuth(env, db);
const users: string[] = [];
test.beforeEach(async ({ page }) => { await page.clock.install({ time: new Date("2026-11-02T03:00:00Z") }); });
test.afterAll(async () => {
  for (const id of users) await db.delete(user).where(eq(user.id, id));
  await pool.end();
});
async function cookie(context: BrowserContext, value: string) {
  const separator = value.indexOf("=");
  await context.addCookies([{ name: value.slice(0, separator), value: value.slice(separator + 1), url: env.BETTER_AUTH_URL, httpOnly: true, sameSite: "Lax" }]);
}
async function login(page: Page, context: BrowserContext) {
  const seeded = await seedSession(auth, env); users.push(seeded.user.id);
  await cookie(context, seeded.cookie); await page.goto("/schedule");
  await expect(page.getByRole("heading", { name: "A week that feels like you." })).toBeVisible();
  await expect(page.getByText("A little room to begin.", { exact: false })).toBeVisible();
  return seeded;
}
async function schedule(context: BrowserContext): Promise<ScheduleResponse> {
  const response = await context.request.get("/api/v1/me/schedule"); expect(response.status()).toBe(200); return response.json();
}

test("monthly bulk saves persist and a failed second write retains only unfinished dates", async ({ page, context }, testInfo) => {
  await login(page, context);
  await page.getByRole("button", { name: "Month", exact: true }).click();
  await page.getByLabel("Jump to date").fill("2026-10-29");
  await page.getByLabel("Select dates").selectOption("multiple");
  await page.locator('[data-date="2026-10-29"]').click();
  await page.locator('[data-date="2026-10-30"]').click();
  await page.getByLabel("Status", { exact: true }).selectOption("personal");
  let writes = 0;
  await page.route("**/api/v1/me/schedule/entries", async (route) => {
    if (route.request().method() === "POST" && ++writes === 2) await route.fulfill({ status: 503, json: { error: { message: "Temporary test failure" } } });
    else await route.continue();
  });
  await page.getByRole("button", { name: "Apply to selected dates" }).click();
  await expect(page.getByText("1 of 2 dates saved to your account.")).toBeVisible();
  await expect(page.getByRole("alert").filter({ hasText: "1 dates remain selected" })).toBeVisible();
  await expect(page.locator('[data-date="2026-10-29"]')).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator('[data-date="2026-10-30"]')).toHaveAttribute("aria-pressed", "true");
  await page.unroute("**/api/v1/me/schedule/entries");
  await page.getByRole("button", { name: "Apply to selected dates" }).click();
  await expect(page.getByText("1 of 1 dates saved to your account.")).toBeVisible();
  expect((await schedule(context)).blocks.filter((block) => block.title === "Personal Time")).toHaveLength(2);
  await page.reload();
  await page.getByRole("button", { name: "Month", exact: true }).click();
  await page.getByLabel("Jump to date").fill("2026-10-29");
  await expect(page.locator('[data-date="2026-10-29"]')).toHaveAttribute("aria-label", /1 time blocks, personal/);
  await page.screenshot({ path: testInfo.outputPath("persisted-month.png"), fullPage: true, animations: "disabled" });
  await page.goto("/availability");
  await expect(page.getByText("Only other people who choose to share appear here. Time is available unless they mark it unavailable. Event details and email addresses stay private.")).toBeVisible();
  await expect(page.getByTestId("person-jamie")).toHaveCount(0);
});

test("month agenda defaults recurring edits to one occurrence and preserves the series", async ({ page, context }) => {
  await login(page, context);
  await page.getByRole("button", { name: "Add time", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Title", { exact: true }).fill("Monthly routine");
  await dialog.getByRole("button", { name: "Add block", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await page.getByRole("button", { name: "Month", exact: true }).click();
  await page.locator('[data-date="2026-11-02"]').click();
  await page.getByRole("button", { name: /09:00–10:00 · Monthly routine/ }).click();
  await expect(dialog.getByLabel("Apply changes to")).toHaveValue("occurrence");
  await dialog.getByLabel("Title", { exact: true }).fill("Just this day");
  await dialog.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await page.reload();
  const blocks = (await schedule(context)).blocks;
  expect(blocks.find((block) => block.title === "Monthly routine")?.excludedDates).toContain("2026-11-02");
  expect(blocks.find((block) => block.title === "Monthly routine")?.timing.type).toBe("weekly");
  expect(blocks.find((block) => block.title === "Just this day")?.timing).toEqual({ type: "date", date: "2026-11-02" });
});

test("weekly CRUD and dated overrides survive refresh, logout and a new session", async ({ page, context }, testInfo) => {
  const seeded = await login(page, context);
  await page.getByLabel("Jump to date").fill("2026-11-02");
  await page.getByRole("button", { name: "Add time", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Title", { exact: true }).fill("Persisted weekly reading");
  await dialog.getByLabel("Start time").fill("18:00"); await dialog.getByLabel("End time").fill("19:00");
  await dialog.getByRole("button", { name: "Add block", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  const weekly = page.getByRole("button", { name: /Edit Persisted weekly reading, unavailable, 18:00 to 19:00, repeats weekly/ });
  await expect(weekly).toBeVisible();
  await expect(page.getByText("Saved to your account.", { exact: true })).toBeVisible();
  await page.reload(); await expect(weekly).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("saved-schedule.png"), fullPage: true });
  const id = (await schedule(context)).blocks[0]!.id;
  await weekly.click();
  await dialog.getByLabel("Apply changes to").selectOption("occurrence");
  await dialog.getByLabel("Title", { exact: true }).fill("Only this Monday");
  await dialog.getByLabel("Start time").fill("20:00"); await dialog.getByLabel("End time").fill("21:00");
  await dialog.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(weekly).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Edit Only this Monday, unavailable, 20:00 to 21:00, this date only/ })).toBeVisible();
  await page.getByRole("button", { name: "Next week", exact: true }).click(); await expect(weekly).toBeVisible();
  await weekly.click();
  await dialog.getByRole("button", { name: "Restore occurrence on 2026-11-02", exact: true }).click();
  await page.getByRole("button", { name: "Previous week", exact: true }).click(); await expect(weekly).toBeVisible();
  await weekly.click(); await dialog.getByLabel("Title", { exact: true }).fill("Renamed saved block");
  await dialog.getByRole("button", { name: "Save changes", exact: true }).click();
  const renamed = page.getByRole("button", { name: /Edit Renamed saved block, unavailable/ }); await expect(renamed).toBeVisible();
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Log out", exact: true }).click(); await expect(page).toHaveURL(/\/login$/);
  expect((await context.request.get("/api/v1/me/schedule")).status()).toBe(401);
  const renewed = await (await auth.$context).internalAdapter.createSession(seeded.user.id);
  await cookie(context, await signedCookie(auth, env, renewed.token));
  await page.goto("/login"); await expect(page).toHaveURL(/\/schedule$/); await expect(renamed).toBeVisible();
  expect((await schedule(context)).blocks[0]!.id).toBe(id);
  await renamed.click(); await dialog.getByRole("button", { name: "Delete block", exact: true }).click();
  await dialog.getByRole("button", { name: "Confirm delete", exact: true }).click();
  await expect(renamed).toHaveCount(0); await page.reload(); expect((await schedule(context)).blocks).toEqual([]);
});

test("drag and keyboard creation persist; midnight is represented without crossing local dates", async ({ page, context }) => {
  await login(page, context);
  const slot = page.locator('[data-day="2"][data-slot-index="36"]'); await slot.scrollIntoViewIfNeeded();
  const box = await slot.boundingBox(); if (!box) throw new Error("Calendar slot missing");
  await page.mouse.move(box.x + box.width / 2, box.y + 10); await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + 43, { steps: 5 }); await page.mouse.up();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("Start time")).toHaveValue("18:00"); await expect(dialog.getByLabel("End time")).toHaveValue("19:00");
  await dialog.getByLabel("Title", { exact: true }).fill("Dragged and saved");
  await dialog.getByRole("button", { name: "Add block", exact: true }).click();
  const keyboard = page.locator('[data-day="0"][data-slot-index="46"]'); await keyboard.focus(); await keyboard.press("Enter");
  await dialog.getByLabel("Title", { exact: true }).fill("Until midnight"); await dialog.getByLabel("End time").fill("00:00");
  await dialog.getByRole("button", { name: "Add block", exact: true }).click();
  await page.reload(); const result = await schedule(context);
  expect(result.blocks.find((block) => block.title === "Dragged and saved")!.timing).toEqual({ type: "date", date: "2026-11-04" });
  expect(result.blocks.find((block) => block.title === "Until midnight")!.end).toBe("24:00");
});

test("lost create response is retryable without a duplicate or false success; stale edits can reload", async ({ page, context }) => {
  await login(page, context); await page.getByRole("button", { name: "Add time", exact: true }).click();
  const dialog = page.getByRole("dialog"); await dialog.getByLabel("Title", { exact: true }).fill("Exactly once");
  await page.route("**/api/v1/me/schedule/entries", async (route) => {
    const response = await route.fetch(); expect(response.status()).toBe(201); await route.abort("failed");
  });
  await dialog.getByRole("button", { name: "Add block", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("Couldn’t confirm the request");
  expect(await page.evaluate(() => document.getAnimations().some((animation) => animation.id === "wm-block-enter"))).toBe(false);
  await expect(page.getByText("Saved to your account.", { exact: true })).toHaveCount(0);
  await page.unroute("**/api/v1/me/schedule/entries");
  await dialog.getByRole("button", { name: "Add block", exact: true }).click(); await expect(dialog).not.toBeVisible();
  expect((await schedule(context)).blocks.filter((block) => block.title === "Exactly once")).toHaveLength(1);
  const before = await schedule(context);
  const changed = await context.request.patch("/api/v1/me/schedule/preferences", { headers: { origin: env.BETTER_AUTH_URL, "If-Match": `"${before.revision}"` }, data: { timezone: "UTC" } }); expect(changed.status()).toBe(200);
  await page.getByRole("button", { name: /Edit Exactly once, unavailable/ }).click();
  await dialog.getByLabel("Title", { exact: true }).fill("Stale title"); await dialog.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("another tab");
  await dialog.getByRole("button", { name: "Reload saved schedule", exact: true }).click();
  await expect(page.getByRole("button", { name: /Edit Exactly once, unavailable/ })).toBeVisible();
});

test("timezone settings persist and both public preview and authenticated finder remain isolated", async ({ page, context, browser }) => {
  await login(page, context);
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await expect(page.getByLabel("Display name", { exact: true })).toHaveAttribute("readonly", "");
  await expect(page.getByRole("switch", { name: "Share my availability" })).toBeEnabled();
  await expect(page.getByRole("switch", { name: "Share my availability" })).toHaveAttribute("aria-checked", "false");
  await page.getByLabel("Timezone", { exact: true }).selectOption("UTC"); await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByText("Preferences saved to your account.", { exact: true })).toBeVisible();
  await page.reload(); await expect(page.getByLabel("Timezone", { exact: true })).toHaveValue("UTC");
  await page.getByRole("link", { name: "Who’s free?", exact: true }).click();
  await expect(page.getByText("Only other people who choose to share appear here. Time is available unless they mark it unavailable. Event details and email addresses stay private.", { exact: true })).toBeVisible();
  const before = await schedule(context); const mutations: string[] = [];
  page.on("request", (request) => { if (request.method() !== "GET" && request.url().includes("/api/v1/me/")) mutations.push(request.url()); });
  await page.goto("/preview/schedule"); await page.getByRole("button", { name: "Add time", exact: true }).click();
  const dialog = page.getByRole("dialog"); await dialog.getByLabel("Title", { exact: true }).fill("Never saved preview");
  await dialog.getByRole("button", { name: "Add block", exact: true }).click(); await expect(dialog).not.toBeVisible();
  expect(mutations).toEqual([]); expect(await schedule(context)).toEqual(before);
  const other = await browser.newContext({ baseURL: env.BETTER_AUTH_URL });
  try {
    const stranger = await seedSession(auth, env); users.push(stranger.user.id); await cookie(other, stranger.cookie);
    expect((await schedule(other)).blocks).toEqual([]);
  } finally { await other.close(); }
  await page.goto("/schedule"); await expect(page.getByRole("button", { name: /Never saved preview/ })).toHaveCount(0);
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const path of ["/schedule", "/settings"]) {
      await page.goto(path); await expect(page.locator("h1")).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
    }
  }
});


test("confirmed server writes drive block motion; pending writes never imply success", async ({ page, context }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await login(page, context);
  await page.getByRole("button", { name: "Add time", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Title", { exact: true }).fill("Server-confirmed motion");
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/api/v1/me/schedule/entries", async (route) => { await gate; await route.continue(); });
  await dialog.getByRole("button", { name: "Add block", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "Saving…" })).toBeDisabled();
  await expect(page.locator('[data-block-id]')).toHaveCount(0);
  await expect(page.getByText("Saved to your account.", { exact: true })).toHaveCount(0);
  await page.keyboard.press("Escape"); await expect(dialog).toBeVisible();
  release();
  await expect.poll(() => page.evaluate(() => document.getAnimations().filter((animation) => animation.id === "wm-block-enter").map((animation) => animation.effect!.getTiming().duration))).toContain(320);
  const closing = page.locator('.motion-dialog[data-state="closed"]');
  if (await closing.count()) await expect(closing).toHaveAttribute("inert", "");
  await page.keyboard.press("Enter");
  await expect(dialog).not.toBeVisible();
  await expect(page.getByText("Saved to your account.", { exact: true })).toBeVisible();
  expect((await schedule(context)).blocks[0]!.title).toBe("Server-confirmed motion");
  const block = page.getByRole("button", { name: /Edit Server-confirmed motion/ });
  await expect.poll(() => block.evaluate((element) => getComputedStyle(element).opacity)).toBe("1");
  await block.click();
  await dialog.getByRole("button", { name: "Delete block", exact: true }).click();
  await dialog.getByRole("button", { name: "Confirm delete", exact: true }).click();
  await expect.poll(() => page.evaluate(() => document.getAnimations().filter((animation) => animation.id === "wm-block-exit").map((animation) => animation.effect!.getTiming().duration))).toContain(160);
  await expect(block).toHaveCount(0);
  expect((await schedule(context)).blocks).toEqual([]);
});
