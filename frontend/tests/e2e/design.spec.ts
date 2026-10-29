import { test, expect } from "@playwright/test";

test("small-screen navigation stays in preview with usable control targets", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto("/preview/availability");
  const nav = page.getByRole("navigation", { name: "Workspace navigation" });
  for (const link of await nav.getByRole("link").all()) {
    const bounds = await link.boundingBox();
    expect(bounds!.width).toBeGreaterThanOrEqual(44);
    expect(bounds!.height).toBeGreaterThanOrEqual(44);
  }
  await expect(page.getByLabel("Date", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Next month", exact: true })).toBeHidden();
  await page.getByRole("link", { name: "Your space", exact: true }).click();
  await expect(page).toHaveURL(/\/preview\/schedule$/);
  await expect(page.getByText("Interactive preview", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0);
});

test("mobile editor fits, traps focus, announces validation, and restores focus", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto("/preview/schedule");
  const add = page.getByRole("button", { name: "Add time", exact: true });
  await add.click();
  const dialog = page.getByRole("dialog");
  const bounds = await dialog.boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.y).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(321);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(641);
  await dialog.getByLabel("Start time").fill("18:00");
  await dialog.getByLabel("End time").fill("17:00");
  await dialog.getByRole("button", { name: "Add block", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("End time must be after start time");
  await expect(dialog.locator("form")).toHaveAttribute("aria-describedby", "block-error");
  await dialog.getByRole("button", { name: "Add block", exact: true }).focus();
  await page.keyboard.press("Tab");
  expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  await page.keyboard.press("Escape");
  await expect(add).toBeFocused();
});

test("reduced motion retains selection feedback without dialog animation", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/preview/schedule");
  await page.getByRole("button", { name: "Add time", exact: true }).click();
  expect(await page.locator(".motion-overlay").evaluate((element) => getComputedStyle(element).animationName)).toBe("none");
  const available = page.getByRole("radio", { name: "Available", exact: true });
  const unavailable = page.getByRole("radio", { name: "Unavailable", exact: true });
  const before = await available.locator("..").evaluate((element) => getComputedStyle(element).backgroundColor);
  await unavailable.check();
  // Reduced motion keeps a short color transition; wait for its settled state.
  await expect.poll(() => unavailable.locator("..").evaluate((element) => getComputedStyle(element).backgroundColor)).toBe(before);
  await expect(unavailable).toBeChecked();
});
