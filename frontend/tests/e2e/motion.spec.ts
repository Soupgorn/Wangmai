import { test, expect, type Page } from "@playwright/test";

type MotionSample = { name: string; duration: number; opacity: string; transform: string };
declare global { interface Window { motionSamples: MotionSample[] } }

test.use({ reducedMotion: "no-preference" });

async function recordMotion(page: Page) {
  await page.addInitScript(() => {
    const samples: MotionSample[] = [];
    Object.assign(window, { motionSamples: samples });
    document.addEventListener("animationstart", (event) => {
      const element = event.target as HTMLElement;
      requestAnimationFrame(() => {
        const animation = element.getAnimations().find((item) => (item as CSSAnimation).animationName === event.animationName);
        samples.push({ name: event.animationName, duration: Number(animation?.effect?.getTiming().duration ?? 0), opacity: getComputedStyle(element).opacity, transform: getComputedStyle(element).transform });
      });
    });
    const original = Element.prototype.animate;
    Element.prototype.animate = function (frames, options) {
      const animation = original.call(this, frames, options);
      requestAnimationFrame(() => samples.push({ name: animation.id, duration: Number(animation.effect?.getTiming().duration ?? 0), opacity: getComputedStyle(this).opacity, transform: getComputedStyle(this).transform }));
      return animation;
    };
  });
}
async function samples(page: Page) {
  return page.evaluate(() => window.motionSamples);
}

test("hero and login entrances run visibly at every supported width", async ({ page }) => {
  await recordMotion(page);
  for (const width of [1440, 1024, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const route of ["/", "/login"]) {
      await page.goto(route, { waitUntil: "domcontentloaded" });
      expect(await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches)).toBe(false);
      await expect.poll(async () => (await samples(page)).filter((sample) => sample.name === "wm-rise").length).toBeGreaterThan(0);
      const first = (await samples(page)).find((sample) => sample.name === "wm-rise")!;
      expect(first.duration).toBeGreaterThanOrEqual(400);
      expect(first.duration).toBeLessThanOrEqual(650);
      expect(Number(first.opacity)).toBeLessThan(1);
      expect(first.transform).not.toBe("none");
      await expect.poll(() => page.locator("h1").evaluate((element) => getComputedStyle(element).opacity)).toBe("1");
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0);
    }
  }
});

test("scroll reveal runs once and public content survives without JavaScript", async ({ page, browser }) => {
  await recordMotion(page); await page.setViewportSize({ width: 390, height: 600 });
  await page.goto("/");
  const section = page.locator("[data-scroll-reveal]");
  await expect(section).not.toHaveAttribute("data-revealed", "true");
  await section.scrollIntoViewIfNeeded();
  await expect.poll(async () => (await samples(page)).filter((sample) => sample.name === "wm-scroll-reveal").length).toBe(1);
  const reveal = (await samples(page)).find((sample) => sample.name === "wm-scroll-reveal")!;
  expect(reveal.duration).toBe(460); expect(Number(reveal.opacity)).toBeLessThan(1);
  await page.getByRole("heading", { name: "Less planning. More good times." }).scrollIntoViewIfNeeded();
  await section.scrollIntoViewIfNeeded();
  expect((await samples(page)).filter((sample) => sample.name === "wm-scroll-reveal")).toHaveLength(1);
  const noScript = await browser.newContext({ javaScriptEnabled: false });
  try { const staticPage = await noScript.newPage(); await staticPage.goto("/"); await expect(staticPage.getByRole("heading", { name: "Find your people." })).toBeVisible(); }
  finally { await noScript.close(); }
});

test("Google request has visible pending motion and recoverable error feedback", async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/api/auth/sign-in/social", async (route) => { await gate; await route.fulfill({ status: 503, json: { code: "UNAVAILABLE", message: "Unavailable" } }); });
  await page.goto("/login");
  await page.getByRole("button", { name: "Continue with Google" }).click();
  const pending = page.getByRole("button", { name: "Connecting to Google…" });
  await expect(pending).toBeDisabled(); await expect(pending).toHaveAttribute("aria-busy", "true");
  expect(await pending.locator(".motion-spinner").evaluate((element) => element.getAnimations().some((animation) => animation.playState === "running"))).toBe(true);
  release();
  await expect(page.locator("#google-signin-status")).toContainText("unavailable");
  await expect(page.getByRole("button", { name: "Continue with Google" })).toBeEnabled();
  await expect(page).toHaveURL(/\/login$/);
});

test("navigation, filters and toggle have actual state-transition timelines", async ({ page }) => {
  await recordMotion(page); await page.goto("/preview/schedule");
  await page.getByRole("link", { name: "Who’s free?", exact: true }).click();
  await expect.poll(async () => (await samples(page)).some((sample) => sample.name === "wm-navigation" && sample.duration === 240)).toBe(true);
  await page.getByRole("button", { name: "Unknown (1)", exact: true }).click();
  await expect(page.getByTestId("person-pim")).toBeVisible();
  await expect(page.getByTestId("person-jamie")).toHaveCount(0);
  await expect.poll(async () => (await samples(page)).some((sample) => sample.name === "wm-result" && sample.duration === 240 && Number(sample.opacity) < 1)).toBe(true);
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  const toggle = page.getByRole("switch", { name: "Share my availability" });
  await toggle.click(); await expect(toggle).toHaveAttribute("aria-checked", "false");
  expect(await toggle.locator("span").evaluate((element) => element.getAnimations().some((animation) => animation.playState === "running"))).toBe(true);
});

test("mobile navigation expands smoothly and collapsed links are inert", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 }); await page.goto("/preview/schedule");
  const panel = page.locator("#workspace-menu");
  const initial = await panel.evaluate((element) => element.getBoundingClientRect().height);
  await page.getByRole("button", { name: "Hide navigation" }).click();
  await expect(panel).toHaveAttribute("inert", "");
  expect(await panel.evaluate((element) => element.getAnimations().some((animation) => animation.playState === "running"))).toBe(true);
  await expect.poll(() => panel.evaluate((element) => element.getBoundingClientRect().height)).toBeLessThan(10);
  await page.getByRole("button", { name: "Show navigation" }).click();
  await expect(panel).not.toHaveAttribute("inert");
  await expect.poll(() => panel.evaluate((element) => Math.round(element.getBoundingClientRect().height))).toBe(Math.round(initial));
});

test("reduced motion removes spatial effects while preserving all actions", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" }); await page.goto("/");
  expect(await page.locator("h1").evaluate((element) => getComputedStyle(element).animationName)).toBe("none");
  await page.goto("/preview/schedule");
  await page.getByRole("button", { name: "Add time", exact: true }).click();
  const dialog = page.getByRole("dialog");
  expect(await dialog.evaluate((element) => getComputedStyle(element).animationName)).toBe("none");
  await dialog.getByLabel("Title", { exact: true }).fill("Reduced-motion block");
  await dialog.getByRole("button", { name: "Add block", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole("button", { name: /Edit Reduced-motion block/ })).toBeVisible();
  expect(await page.evaluate(() => document.getAnimations().some((animation) => animation.id.startsWith("wm-")))).toBe(false);
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  const toggle = page.getByRole("switch", { name: "Share my availability" });
  await toggle.click(); await expect(toggle).toHaveAttribute("aria-checked", "false");
  expect(await toggle.locator("span").evaluate((element) => element.getAnimations().some((animation) => (animation as CSSTransition).transitionProperty === "transform"))).toBe(false);
});


test("enabling reduced motion cancels an in-flight result reveal without stale content", async ({ page }) => {
  await page.goto("/preview/availability");
  await page.getByRole("button", { name: "Unknown (1)", exact: true }).click();
  expect(await page.evaluate(() => document.getAnimations().some((animation) => animation.id === "wm-result"))).toBe(true);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect.poll(() => page.evaluate(() => document.getAnimations().some((animation) => animation.id === "wm-result"))).toBe(false);
  await expect(page.getByTestId("person-pim")).toBeVisible();
  await expect(page.getByTestId("person-jamie")).toHaveCount(0);
});

test("week transitions replace headings and dated events together", async ({ page }) => {
  await page.goto("/preview/schedule");
  await page.getByLabel("Jump to date").fill("2026-11-02");
  await page.getByRole("button", { name: "Add time", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Title", { exact: true }).fill("Only the outgoing Monday");
  await dialog.getByLabel("Repeats", { exact: true }).selectOption("date");
  await dialog.getByRole("button", { name: "Add block", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await page.getByRole("button", { name: "Next week", exact: true }).click();
  await expect(page.getByLabel("Jump to date")).toHaveValue("2026-11-09");
  await expect(page.getByRole("button", { name: /Edit Only the outgoing Monday/ })).toHaveCount(0);
  await expect(page.locator("[data-motion-exit]")).toHaveCount(0);
  expect(await page.locator(".motion-week").evaluate((element) => element.getAnimations().some((animation) => animation.playState === "running"))).toBe(true);
});
