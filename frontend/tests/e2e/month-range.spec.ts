import { test, expect } from "@playwright/test";

test.use({ video: "on" });

test("month selections cross months, create dated blocks and retain the week", async ({ page }, testInfo) => {
  await page.goto("/preview/schedule");
  await page.getByRole("button", { name: "Month", exact: true }).click();
  await page.getByLabel("Jump to date").fill("2026-12-29");
  await page.locator('[data-date="2026-12-29"]').click();
  await expect(page.locator('[data-date="2026-12-29"]')).toHaveAttribute("aria-pressed", "true");
  await page.getByLabel("Select dates").selectOption("range");
  await page.locator('[data-date="2026-12-31"]').click();
  await page.getByRole("button", { name: "Next month", exact: true }).click();
  await page.locator('[data-date="2027-01-02"]').click();
  await expect(page.getByRole("status").filter({ hasText: "3 dates selected" })).toBeVisible();
  await page.getByRole("button", { name: "Apply to selected dates" }).click();
  await expect(page.getByText("3 of 3 dates updated in preview.")).toBeVisible();
  await page.getByLabel("Select dates").selectOption("multiple");
  await page.locator('[data-date="2027-01-01"]').click();
  await page.locator('[data-date="2027-01-03"]').click();
  await expect(page.getByRole("status").filter({ hasText: "2 dates selected" })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("month-range-selection.png"), fullPage: true, animations: "disabled" });
  await page.getByRole("button", { name: "Clear selection" }).click();
  await expect(page.getByText("Select dates to add time.")).toBeVisible();
  await page.getByRole("button", { name: "Week", exact: true }).click();
  await expect(page.getByRole("group", { name: /Schedule time grid/ })).toBeVisible();
});

test("range preview updates by day and intersection, validates boundaries, never calls live search", async ({ page }) => {
  const api: string[] = []; page.on("request", (request) => { if (request.url().includes("/api/")) api.push(request.url()); });
  await page.goto("/preview/availability");
  await page.getByText("Edit dates directly", { exact: true }).click();
  await page.getByLabel("Start Date", { exact: true }).fill("2026-12-31");
  await page.getByLabel("End Date", { exact: true }).fill("2027-01-02");
  await page.getByRole("button", { name: "By Date", exact: true }).click();
  await expect(page.getByLabel("Results for date").locator("option")).toHaveCount(3);
  await page.getByLabel("Results for date").selectOption("2027-01-01");
  await page.getByRole("button", { name: "By Person", exact: true }).click();
  await page.getByRole("button", { name: "Available on Every Day", exact: true }).click();
  await expect(page.locator('[data-testid^="person-"][data-state="unknown"]')).toHaveCount(0);
  await expect(page.locator('[data-testid^="person-"][data-state="busy"]')).toHaveCount(0);
  await page.getByLabel("End Date", { exact: true }).fill("2027-02-02");
  await expect(page.locator("#query-error")).toContainText("at most 31");
  await expect(page.locator('[data-testid^="person-"]')).toHaveCount(0);
  expect(api).toEqual([]);
});

for (const width of [1440, 1024, 768, 390, 320]) test(`month and range fit ${width}px with reduced motion`, async ({ page }, testInfo) => {
  await page.setViewportSize({ width, height: 1000 }); await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/preview/schedule"); await page.getByRole("button", { name: "Month", exact: true }).click();
  await page.getByLabel("Jump to date").fill("2026-10-29");
  const day = page.locator('[data-date="2026-10-29"]'); await day.focus(); await day.press("Enter");
  await expect(day).toHaveAttribute("aria-pressed", "true");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const controlsFit = await page.getByRole("button", { name: "Apply to selected dates" }).evaluate((element) => {
    const card = element.closest('[data-slot="card"]')?.getBoundingClientRect();
    const bounds = element.getBoundingClientRect();
    return !card || (bounds.left >= card.left && bounds.right <= card.right);
  });
  expect(controlsFit).toBe(true);
  expect(await day.evaluate((element) => getComputedStyle(element).animationName)).toBe("none");
  await page.screenshot({ path: testInfo.outputPath(`month-${width}.png`), fullPage: true });
  await page.goto("/preview/availability"); await page.getByText("Edit dates directly", { exact: true }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath(`range-${width}.png`), fullPage: true });
});
