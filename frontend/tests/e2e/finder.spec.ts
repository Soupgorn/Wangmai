import { test, expect, type Page } from "@playwright/test";

test.use({ video: "on", reducedMotion: "no-preference" });
test.beforeEach(async ({ page }) => { await page.clock.install({ time: new Date("2026-10-28T03:00:00Z") }); });
async function range(page: Page) {
  await page.goto("/preview/availability");
  await page.getByText("Edit dates directly", { exact: true }).click();
  await page.getByLabel("Start Date", { exact: true }).fill("2026-10-29");
  await page.getByLabel("End Date", { exact: true }).fill("2026-11-02");
}

test("one calendar handles single days, ranges, reverse order, repeated dates, summaries and clear", async ({ page }) => {
  await page.goto("/preview/availability");
  await expect(page.getByRole("button", { name: "Single Day", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Date Range", exact: true })).toHaveCount(0);
  const summary = page.getByTestId("date-selection-summary");
  await page.getByRole("button", { name: "Clear dates", exact: true }).click();
  await expect(summary).toContainText("No dates selected");
  await expect(page.getByRole("status", { name: "Availability summary", exact: true })).toHaveCount(0);
  await expect(page.getByText("Find a day to get together.", { exact: true })).toBeVisible();
  await expect(page.locator('[data-testid^="person-"]')).toHaveCount(0);
  await expect(page.locator("#query-error")).toHaveCount(0);
  await page.locator('[data-picker-date="2026-10-29"]').click();
  await expect(summary).toContainText("October 29, 2026");
  await expect(summary).toContainText("1 day selected");
  expect(await summary.locator(":scope > span").evaluate((element) => element.getAnimations().some((animation) => animation.playState === "running"))).toBe(true);
  await expect(page.getByTestId("person-jamie")).toHaveAttribute("data-state", "busy");
  await expect(page.locator("#picker-help")).toContainText("or keep this single day");
  await page.locator('[data-picker-date="2026-10-31"]').click();
  await expect(summary).toContainText("October 29, 2026 – October 31, 2026");
  await expect(summary).toContainText("3 days selected");
  await expect(page.locator('[data-picker-date="2026-10-30"]')).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("person-chris")).toContainText("Available 3 of 3 days");
  await expect(page.locator("#picker-help")).toContainText("Showing availability across the selected days.");
  // A completed range starts fresh; selecting the same day keeps a single day.
  await page.locator('[data-picker-date="2026-10-31"]').click();
  await page.locator('[data-picker-date="2026-10-31"]').click();
  await expect(summary).toContainText("1 day selected");
  await page.locator('[data-picker-date="2026-10-29"]').click();
  await expect(summary).toContainText("October 29, 2026 – October 31, 2026");
  await page.getByRole("button", { name: "Clear dates", exact: true }).click();
  await expect(summary).toContainText("No dates selected");
  await expect(page.locator('[data-picker-date][aria-pressed="true"]')).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Clear dates", exact: true })).toBeDisabled();
  await expect(page.getByLabel("From", { exact: true })).toHaveValue("13:00");
  await expect(page.getByLabel("Until", { exact: true })).toHaveValue("15:00");
  await expect(page.getByLabel("Timezone", { exact: true })).toHaveValue("Asia/Bangkok");
});

test("range cards show Any by default, exact dates, Every intersection and per-date states", async ({ page }, testInfo) => {
  const api: string[] = []; page.on("request", (request) => { if (request.url().includes("/api/")) api.push(request.url()); });
  await range(page);
  const summary = page.getByRole("status", { name: "Availability summary", exact: true });
  await expect(summary.getByText("People free any day", { exact: true })).toBeVisible();
  await expect(summary.locator("time")).toHaveCount(2);
  await expect(summary.locator("time").first()).toHaveAttribute("datetime", "2026-10-29");
  await expect(summary.locator("time").last()).toHaveAttribute("datetime", "2026-11-02");
  await expect(summary).toContainText("13:00 – 15:00");
  await expect(page.getByRole("button", { name: "Available on Any Day", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("person-jamie")).toContainText("Available 4 of 5 days");
  await expect(page.getByTestId("person-jamie").locator("time")).toHaveCount(4);
  await expect(page.getByTestId("person-jamie").locator('time[datetime="2026-10-29"]')).toHaveCount(0);
  await expect(page.getByTestId("person-chris")).toContainText("Available 5 of 5 days");
  await expect(page.getByTestId("person-pim")).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("any-day-desktop.png"), fullPage: true, animations: "disabled" });
  await page.getByRole("button", { name: "Available on Every Day", exact: true }).click();
  await expect(summary.getByText("People free every day", { exact: true })).toBeVisible();
  await expect(summary.getByTestId("available-count")).toContainText("1 person");
  await expect(page.getByTestId("person-jamie")).toHaveCount(0);
  await expect(page.getByTestId("person-chris")).toBeVisible();
  await expect(page.locator('[data-testid^="person-"]')).toHaveCount(1);
  await page.getByRole("button", { name: "By Date", exact: true }).click();
  await expect(summary.getByText("People free", { exact: true })).toBeVisible();
  await expect(summary.locator("time")).toHaveCount(1);
  await expect(summary.locator("time")).toHaveAttribute("datetime", "2026-10-29");
  await expect(page.getByLabel("Results for date").locator("option")).toHaveCount(5);
  await expect(page.getByTestId("person-jamie")).toHaveAttribute("data-state", "busy");
  await expect(page.getByTestId("person-pim")).toHaveAttribute("data-state", "unknown");
  await page.getByRole("button", { name: "Next results date" }).click();
  await expect(summary.locator("time")).toHaveAttribute("datetime", "2026-10-30");
  await expect(page.getByTestId("person-jamie")).toHaveAttribute("data-state", "available");
  await page.getByRole("button", { name: "Previous results date" }).click();
  await expect(page.getByTestId("person-jamie")).toHaveAttribute("data-state", "busy");
  await page.screenshot({ path: testInfo.outputPath("by-date-desktop.png"), fullPage: true, animations: "disabled" });
  await page.getByRole("button", { name: "By Person", exact: true }).click();
  await page.getByTestId("person-chris").getByRole("button", { name: "See everyone on 1 November 2026" }).click();
  await expect(page.getByLabel("Results for date")).toHaveValue("2026-11-01");
  await expect(page.getByText("Private appointment", { exact: true })).toHaveCount(0);
  expect(api).toEqual([]);
});

test("calendar click and keyboard selection cross months and years without selecting on arrow focus", async ({ page }) => {
  await range(page);
  await page.getByLabel("Start Date", { exact: true }).fill("2026-12-31");
  await page.getByLabel("End Date", { exact: true }).fill("2026-12-31");
  const first = page.locator('[data-picker-date="2026-12-31"]');
  await first.focus(); await first.press("Enter");
  await first.press("ArrowRight");
  await expect(page.locator('[data-picker-date="2027-01-01"]')).toBeFocused();
  await expect(page.getByLabel("End Date", { exact: true })).toHaveValue("2026-12-31");
  await page.keyboard.press("ArrowRight"); await page.keyboard.press("Enter");
  await expect(page.getByLabel("End Date", { exact: true })).toHaveValue("2027-01-02");
  await expect(page.locator('[data-picker-date="2027-01-01"]')).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Next month", exact: true }).click();
  await expect(page.getByRole("heading", { name: "January 2027" })).toBeVisible();
  await expect(page.getByLabel("Start Date", { exact: true })).toHaveValue("2026-12-31");
  await page.getByRole("button", { name: "Clear dates", exact: true }).click();
  await page.locator('[data-picker-date="2026-12-30"]').click();
  await expect(page.getByLabel("Start Date", { exact: true })).toHaveValue("2026-12-30");
});

test("invalid ranges clear old results; shared gaps are free and DST errors remain distinct", async ({ page }) => {
  await range(page);
  await page.getByLabel("End Date", { exact: true }).fill("2026-11-29");
  await expect(page.locator("#query-error")).toContainText("at most 31");
  await expect(page.locator('[data-testid^="person-"]')).toHaveCount(0);
  await expect(page.locator("[data-finder-exit]")).toHaveCount(0);
  await page.getByLabel("End Date", { exact: true }).fill("2026-10-28");
  await expect(page.locator("#query-error")).toContainText("on or after");
  await page.getByLabel("End Date", { exact: true }).fill("2026-11-02");
  await page.getByLabel("From", { exact: true }).fill("07:00");
  await page.getByLabel("Until", { exact: true }).fill("08:00");
  await expect(page.getByTestId("available-count")).toContainText("5 people");
  await expect(page.getByTestId("person-jamie")).toBeVisible();
  await expect(page.locator("#query-error")).toHaveCount(0);
  await page.getByLabel("Start Date", { exact: true }).fill("2026-11-01");
  await page.getByLabel("End Date", { exact: true }).fill("2026-11-01");
  await page.getByLabel("From", { exact: true }).fill("01:15");
  await page.getByLabel("Until", { exact: true }).fill("02:30");
  await page.getByLabel("Timezone", { exact: true }).selectOption("America/New_York");
  await expect(page.locator("#query-error")).toContainText("daylight saving");
  await page.getByLabel("Start Date", { exact: true }).fill("");
  await expect(page.getByTestId("date-selection-summary")).toContainText("No dates selected");
  await page.getByLabel("End Date", { exact: true }).fill("2026-11-01");
  await expect(page.locator("#query-error")).toContainText("valid date");
});

test("selection, segments, cards, counts and exits have real motion and interruption stays current", async ({ page }) => {
  await page.addInitScript(() => {
    const played: { id: string; duration: number }[] = []; Object.assign(window, { finderAnimations: played });
    document.addEventListener("animationstart", (event) => played.push({ id: event.animationName, duration: 0 }));
    const original = Element.prototype.animate;
    Element.prototype.animate = function (frames, options) { const animation = original.call(this, frames, options); requestAnimationFrame(() => played.push({ id: animation.id, duration: Number(animation.effect?.getTiming().duration) })); return animation; };
  });
  await range(page);
  await page.getByRole("button", { name: "Available on Every Day", exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { finderAnimations: { id: string }[] }).finderAnimations.map((item) => item.id))).toEqual(expect.arrayContaining(["wm-result", "wm-finder-exit", "wm-finder-segment"]));
  const names = await page.evaluate(() => (window as unknown as { finderAnimations: { id: string; duration: number }[] }).finderAnimations);
  expect(names.some((item) => item.id.includes("calendar-in"))).toBe(true);
  expect(names.some((item) => item.id.includes("date-select"))).toBe(true);
  expect(names.some((item) => item.id.includes("count-in"))).toBe(true);
  expect(names.some((item) => item.id === "wm-finder-exit" && item.duration === 160)).toBe(true);
  expect(names.some((item) => item.id === "wm-result" && item.duration === 240)).toBe(true);
  await expect(page.getByTestId("person-jamie")).toHaveCount(0);
  await expect(page.locator("[data-finder-exit]")).toHaveCount(0);
  await page.getByRole("button", { name: "Available on Any Day", exact: true }).click();
  await expect(page.getByTestId("person-jamie")).toBeVisible();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect.poll(() => page.evaluate(() => document.getAnimations().some((item) => item.id.startsWith("wm-")))).toBe(false);
  await expect(page.getByTestId("person-jamie")).toBeVisible();
});

for (const width of [1440, 1024, 768, 390, 320]) test(`finder fits ${width}px, uses touch selection and respects reduced motion`, async ({ browser }, testInfo) => {
  const context = await browser.newContext({ baseURL: "http://localhost:3100", viewport: { width, height: 1000 }, hasTouch: true, reducedMotion: "reduce" });
  const page = await context.newPage();
  try {
    await range(page);
    await page.getByRole("button", { name: "Clear dates", exact: true }).tap();
    await page.locator('[data-picker-date="2026-10-29"]').tap();
    await expect(page.getByTestId("date-selection-summary")).toContainText("1 day selected");
    await page.locator('[data-picker-date="2026-11-01"]').tap();
    await expect(page.getByLabel("End Date", { exact: true })).toHaveValue("2026-11-01");
    await expect(page.getByTestId("date-selection-summary")).toContainText("4 days selected");
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0);
    expect(await page.locator('[data-picker-date="2026-10-29"] span').evaluate((element) => getComputedStyle(element).animationName)).toBe("none");
    expect(await page.getByTestId("date-selection-summary").locator(":scope > span").evaluate((element) => getComputedStyle(element).animationName)).toBe("none");
    expect(await page.evaluate(() => document.getAnimations().some((animation) => animation.id.startsWith("wm-")))).toBe(false);
    await page.screenshot({ path: testInfo.outputPath(`finder-${width}.png`), fullPage: true });
    await page.getByRole("button", { name: "By Date", exact: true }).tap();
    await page.getByLabel("Results for date").selectOption("2026-10-30");
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0);
  } finally { await context.close(); }
});
