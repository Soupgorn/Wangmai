import { test, expect, type Page } from "@playwright/test";

const pageErrors = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  pageErrors.set(page, errors);
  page.on("pageerror", (error) => errors.push(error.message));
  await page.clock.install({ time: new Date("2026-10-28T03:00:00Z") });
});
test.afterEach(async ({ page }) => { expect(pageErrors.get(page)).toEqual([]); });

async function preview(page: Page) {
  await page.goto("/login");
  await expect(page.getByRole("button", { name: "Continue with Google" })).toBeEnabled();
  await page.getByRole("link", { name: "Explore the interactive preview" }).click();
  await expect(page.getByRole("heading", { name: "A week that feels like you." })).toBeVisible();
}

test("calendar CRUD, recurrence, validation and focus", async ({ page }) => {
  await preview(page);
  await page.getByLabel("Jump to date").fill("2026-11-02");
  await page.getByRole("button", { name: "Add time", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Title", { exact: true }).fill("Weekly reading");
  await dialog.getByLabel("Start time").fill("18:00");
  await dialog.getByLabel("End time").fill("17:00");
  await dialog.getByRole("button", { name: "Add block" }).click();
  await expect(dialog.getByRole("alert")).toContainText("End time must be after start time");
  await dialog.getByLabel("End time").fill("19:00");
  await dialog.getByRole("button", { name: "Add block" }).click();
  await expect(dialog).not.toBeVisible();
  let block = page.getByRole("button", { name: /Edit Weekly reading, unavailable, 18:00 to 19:00, repeats weekly/ });
  await expect(block).toBeVisible();
  await page.getByRole("button", { name: "Next week", exact: true }).click();
  await expect(block).toBeVisible();
  await block.click();
  await dialog.getByLabel("Title", { exact: true }).fill("Weekly quiet time");
  await dialog.getByLabel("End time").fill("20:00");
  await dialog.getByRole("button", { name: "Save changes", exact: true }).click();
  block = page.getByRole("button", { name: /Edit Weekly quiet time, unavailable, 18:00 to 20:00/ });
  await block.click();
  await dialog.getByRole("button", { name: "Delete block" }).click();
  await dialog.getByRole("button", { name: "Confirm delete" }).click();
  await expect(block).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Add time", exact: true })).toBeFocused();
  await page.getByRole("button", { name: "Previous week", exact: true }).click();
  await expect(block).toHaveCount(0);

  await page.getByRole("button", { name: "Add time", exact: true }).click();
  await dialog.getByLabel("Title", { exact: true }).fill("Dentist");
  await dialog.getByRole("radio", { name: "Unavailable", exact: true }).check();
  await dialog.getByLabel("Repeats", { exact: true }).selectOption("date");
  await dialog.getByLabel("Start time").fill("18:00");
  await dialog.getByLabel("End time").fill("19:00");
  await dialog.getByRole("button", { name: "Add block" }).click();
  await expect(page.getByRole("button", { name: /Edit Dentist, unavailable, 18:00 to 19:00, this date only/ })).toBeVisible();
  await page.getByRole("button", { name: "Next week", exact: true }).click();
  await expect(page.getByRole("button", { name: /Edit Dentist/ })).toHaveCount(0);
  await page.getByRole("button", { name: "Today", exact: true }).click();
  await expect(page.getByLabel("Jump to date")).toHaveValue("2026-10-28");
  await page.getByRole("button", { name: "Add time", exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole("button", { name: "Add time", exact: true })).toBeFocused();
});

test("new calendar blocks are Busy only and short blocks keep text inside their bounds", async ({ page }) => {
  await preview(page);
  await page.getByLabel("Jump to date").fill("2026-11-02");
  await page.getByRole("button", { name: "Add time", exact: true }).click();
  const dialog = page.getByRole("dialog");
  const title = dialog.getByLabel("Title", { exact: true });
  await expect(title).toHaveValue("Unavailable");
  await expect(dialog.getByRole("radio", { name: "Unavailable", exact: true })).toBeChecked();
  await expect(dialog.getByRole("radio", { name: "Available", exact: true })).toHaveCount(0);
  await title.fill("Work");
  await dialog.getByRole("radio", { name: "Unavailable", exact: true }).check();
  await expect(title).toHaveValue("Work");
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();

  const examples = [
    { title: "Free time", start: "18:00", end: "18:30", unavailable: false },
    { title: "Unavailable", start: "19:00", end: "20:00", unavailable: true },
    { title: "Work session with a long private title that needs to fit", start: "20:00", end: "21:00", unavailable: false },
  ];
  for (const example of examples) {
    await page.getByRole("button", { name: "Add time", exact: true }).click();
    if (example.unavailable) await dialog.getByRole("radio", { name: "Unavailable", exact: true }).check();
    await title.fill(example.title);
    await dialog.getByLabel("Start time").fill(example.start);
    await dialog.getByLabel("End time").fill(example.end);
    await dialog.getByRole("button", { name: "Add block", exact: true }).click();
    await expect(dialog).not.toBeVisible();
  }
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const example of examples) {
      const event = page.getByRole("button", { name: `Edit ${example.title}, unavailable, ${example.start} to ${example.end}, repeats weekly`, exact: true });
      await event.scrollIntoViewIfNeeded();
      const textFits = await event.evaluate((element) => {
        const bounds = element.getBoundingClientRect();
        return [...element.querySelectorAll("strong, span")].filter((child) => child.children.length === 0 && getComputedStyle(child).display !== "none").every((child) => {
          const text = child.getBoundingClientRect();
          return text.left >= bounds.left && text.right <= bounds.right + 1 && text.top >= bounds.top && text.bottom <= bounds.bottom + 1;
        });
      });
      expect(textFits, `${example.title} text fits a ${width}px calendar`).toBe(true);
      await event.click();
      await expect(title).toHaveValue(example.title);
      await page.keyboard.press("Escape");
    }
  }
});

test("calendar drag and keyboard slot entry", async ({ page }) => {
  await preview(page);
  const slot = page.locator('[data-day="2"][data-slot-index="36"]');
  await slot.scrollIntoViewIfNeeded();
  const box = await slot.boundingBox();
  if (!box) throw new Error("Calendar slot has no bounds");
  await page.mouse.move(box.x + box.width / 2, box.y + 10);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + 43, { steps: 5 });
  await page.mouse.up();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("Start time")).toHaveValue("18:00");
  await expect(dialog.getByLabel("End time")).toHaveValue("19:00");
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  const keyboardSlot = page.locator('[data-day="0"][data-slot-index="18"]');
  await keyboardSlot.focus();
  await keyboardSlot.press("ArrowDown");
  await expect(page.locator('[data-day="0"][data-slot-index="19"]')).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel("Start time")).toHaveValue("09:30");
  await page.keyboard.press("Escape");
  await expect(page.locator('[data-day="0"][data-slot-index="19"]')).toBeFocused();
});

test("instant filtering, counts, busy and unknown states", async ({ page }) => {
  await preview(page);
  await page.getByRole("link", { name: "Who’s free?", exact: true }).click();
  await expect(page.getByTestId("available-count")).toContainText("3 people");
  await expect(page.getByTestId("person-beam")).toHaveAttribute("data-state", "busy");
  await expect(page.getByTestId("person-pim")).toHaveAttribute("data-state", "unknown");
  await expect(page.getByRole("button", { name: /Search/i })).toHaveCount(0);
  await page.getByText("Edit dates directly", { exact: true }).click();
  await page.getByLabel("Start Date", { exact: true }).fill("2026-10-29");
  await expect(page.getByTestId("available-count")).toContainText("2 people");
  await expect(page.getByTestId("person-jamie")).toHaveAttribute("data-state", "busy");
  await page.getByLabel("From", { exact: true }).fill("15:00");
  await expect(page.locator("#query-error")).toContainText("End time must be after start time");
  await expect(page.getByTestId("person-jamie")).toHaveCount(0);
  await page.getByLabel("Until", { exact: true }).fill("16:00");
  await expect(page.getByTestId("available-count")).toContainText("5 people");
  await expect(page.getByTestId("person-beam")).toHaveAttribute("data-state", "available");
  await page.getByRole("button", { name: "Unknown (1)", exact: true }).click();
  await expect(page.getByTestId("person-pim")).toBeVisible();
  await expect(page.getByTestId("person-jamie")).toHaveCount(0);
  await page.getByRole("button", { name: "Everyone (6)", exact: true }).click();
  await page.getByLabel("From", { exact: true }).fill("08:00");
  await page.getByLabel("Until", { exact: true }).fill("09:00");
  await page.getByRole("button", { name: "Available (5)", exact: true }).click();
  await expect(page.getByTestId("person-jamie")).toHaveAttribute("data-state", "available");
  await expect(page.getByText("Private appointment", { exact: true })).toHaveCount(0);
});

test("profile, timezone, sharing, logout and honest mock boundary", async ({ page, context }) => {
  const mutations: string[] = [];
  page.on("request", (request) => { if (request.method() !== "GET" && request.url().includes("/api/")) mutations.push(request.url()); });
  await preview(page);
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await page.getByLabel("Display name", { exact: true }).fill("Ari Preview");
  await page.getByLabel("Timezone", { exact: true }).selectOption("UTC");
  await page.getByRole("switch", { name: "Share my availability" }).click();
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByText("Updated in this preview only.")).toBeVisible();
  await expect(page.getByRole("img", { name: "Ari Preview" })).toHaveCount(0);
  await page.getByRole("link", { name: "Who’s free?", exact: true }).click();
  await expect(page.getByTestId("available-count")).toContainText("5 people");
  await expect(page.getByText("UTC", { exact: true })).toBeVisible();
  await expect(page.getByText("Your shared status").locator("..")).toContainText("Unknown");
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await expect(page.getByLabel("Display name", { exact: true })).toHaveValue("Ari Preview");
  await page.reload();
  await expect(page.getByLabel("Display name", { exact: true })).toHaveValue("Alex Morgan");
  await expect(page.getByLabel("Timezone", { exact: true })).toHaveValue("Asia/Bangkok");
  await page.getByRole("link", { name: "Log out of preview", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Welcome to Wangmai." })).toBeVisible();
  expect((await context.cookies()).filter((cookie) => /auth|session/i.test(cookie.name))).toEqual([]);
  expect(mutations).toEqual([]);
});

test("schedule changes immediately affect the shared status", async ({ page }) => {
  await preview(page);
  await page.getByRole("link", { name: "Who’s free?", exact: true }).click();
  const status = page.getByText("Your shared status").locator("..");
  await expect(status).toContainText("Available");
  await page.getByRole("link", { name: "My schedule", exact: true }).click();
  await page.getByRole("button", { name: "Add time", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Title", { exact: true }).fill("Private appointment");
  await dialog.getByRole("radio", { name: "Unavailable", exact: true }).check();
  await dialog.getByLabel("Repeats", { exact: true }).selectOption("date");
  await dialog.getByLabel("Start time").fill("13:30");
  await dialog.getByLabel("End time").fill("14:00");
  await dialog.getByRole("button", { name: "Add block" }).click();
  await page.getByRole("link", { name: "Who’s free?", exact: true }).click();
  await expect(status).toContainText("Unavailable");
  await expect(page.getByTestId("available-count")).toContainText("3 people");
  await expect(page.getByText("Private appointment", { exact: true })).toHaveCount(0);
});

test("responsive core and public pages preserve the approved visual system", async ({ page }, testInfo) => {
  test.setTimeout(100_000);
  for (const width of [1440, 1024, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const route of ["/", "/login", "/preview/schedule", "/preview/availability", "/preview/settings"]) {
      await page.goto(route);
      await expect(page.locator("h1")).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, `${route} overflow at ${width}px`).toBeLessThanOrEqual(0);
      if (route === "/preview/schedule" && width <= 390) await expect(page.getByRole("button", { name: "Day", exact: true })).toHaveAttribute("aria-pressed", "true");
      if (width === 1440 || width === 390) await page.screenshot({ path: testInfo.outputPath(`${route === "/" ? "landing" : route.slice(1).replaceAll("/", "-")}-${width}.png`), fullPage: true });
    }
  }
});

test("excluded routes and controls are absent, health proxy still works", async ({ page, request }) => {
  await preview(page);
  const navigation = page.getByRole("navigation", { name: "Workspace navigation" });
  await expect(navigation.getByRole("link")).toHaveCount(3);
  await expect(page.getByRole("link", { name: /Dashboard|Admin|Notification|Group planning|Reports|Analytics/i })).toHaveCount(0);
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await expect(page.getByText(/Google Calendar|approval management|Coming soon/i)).toHaveCount(0);
  for (const route of ["/admin", "/admin/users", "/admin/roles", "/admin/health", "/admin/audit", "/admin/features", "/admin/reports", "/dashboard"]) {
    const response = await request.get(route);
    expect(response.status(), route).toBe(404);
  }
  const health = await request.get("/api/health");
  expect(health.status()).toBe(200);
  expect(await health.json()).toEqual({ status: "ok", service: "wangmai-api" });
});
