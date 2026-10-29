import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { test, expect } from "@playwright/test";
import { eq } from "drizzle-orm";
import { createAuth } from "../../../backend/src/auth/auth";
import { loadEnv } from "../../../backend/src/config/env";
import { createDatabase } from "../../../backend/src/db/client";
import { user } from "../../../backend/src/db/schema";
import { seedSession } from "../../../backend/tests/helpers";

// Node-only fixtures. No test login endpoint or bypass is added to either app.
process.loadEnvFile(fileURLToPath(new URL("../../../.env", import.meta.url)));
const env = loadEnv({ ...process.env, NODE_ENV: "test", BETTER_AUTH_URL: "http://localhost:3100" });
const { db, pool } = createDatabase(env);
const auth = createAuth(env, db);
const seededUsers: string[] = [];
test.afterAll(async () => {
  for (const id of seededUsers) await db.delete(user).where(eq(user.id, id));
  await pool.end();
});

test("protected routes redirect unauthenticated users; health and public preview stay available", async ({ page, request }) => {
  for (const route of ["/schedule", "/availability", "/settings"]) {
    await page.goto(route);
    await expect(page).toHaveURL(/\/login$/);
  }
  const me = await request.get("/api/v1/me?userId=untrusted");
  expect(me.status()).toBe(401);
  expect((await request.get("/api/health")).status()).toBe(200);
  await page.goto("/preview/schedule");
  await expect(page.getByRole("heading", { name: "A week that feels like you.", exact: true })).toBeVisible();
});

test("Google button uses the same-origin Better Auth endpoint and shows configuration errors", async ({ page }) => {
  await page.route("**/api/auth/sign-in/social", (route) => route.fulfill({ status: 503, json: { code: "GOOGLE_NOT_CONFIGURED", message: "Google sign-in is not configured yet." } }));
  await page.goto("/login?error=access_denied");
  await expect(page.locator("#google-signin-status")).toContainText("Google sign-in didn’t finish");
  const button = page.getByRole("button", { name: "Continue with Google" });
  const requested = page.waitForRequest((request) => request.url().endsWith("/api/auth/sign-in/social"));
  await button.click();
  const request = await requested;
  expect(new URL(request.url()).origin).toBe("http://localhost:3100");
  expect(request.postDataJSON()).toMatchObject({ provider: "google", callbackURL: "/schedule" });
  // This tests frontend error handling without contacting Google, even when credentials are set.
  await expect(page.locator("#google-signin-status")).toContainText("Google sign-in is not configured yet");
  await expect(button).toBeEnabled();
});

test("persisted session redirects login, shows real profile, survives reload and logs out", async ({ page, context, request }) => {
  const seeded = await seedSession(auth, env);
  seededUsers.push(seeded.user.id);
  const separator = seeded.cookie.indexOf("=");
  await context.addCookies([{ name: seeded.cookie.slice(0, separator), value: seeded.cookie.slice(separator + 1), url: env.BETTER_AUTH_URL, httpOnly: true, sameSite: "Lax" }]);
  await page.goto("/login");
  await expect(page).toHaveURL(/\/schedule$/);
  await expect(page.getByText(/Your private schedule is saved to your account/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "A week that feels like you.", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await expect(page.getByText(seeded.user.email, { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText(seeded.user.email, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Log out", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("heading", { name: "Welcome to Wangmai." })).toBeVisible();
  expect((await request.get("/api/v1/me", { headers: { cookie: seeded.cookie } })).status()).toBe(401);
  await page.goto("/settings");
  await expect(page).toHaveURL(/\/login$/);
});

test("session and logout failures show recoverable errors", async ({ page, context }) => {
  const seeded = await seedSession(auth, env); seededUsers.push(seeded.user.id);
  const [name, value] = seeded.cookie.split("=");
  await context.addCookies([{ name: name!, value: value!, url: env.BETTER_AUTH_URL }]);
  await page.goto("/settings");
  await page.route("**/api/auth/sign-out", (route) => route.fulfill({ status: 503, json: { message: "Unavailable" } }));
  await page.getByRole("button", { name: "Log out", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Couldn’t sign out" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Log out", exact: true })).toBeEnabled();
  await page.unroute("**/api/auth/sign-out");
  await page.route("**/api/auth/get-session*", (route) => route.fulfill({ status: 503, json: { message: "Unavailable" } }));
  await page.reload();
  await expect(page.getByRole("alert").filter({ hasText: "We couldn’t check your session" })).toBeVisible();
  await page.unroute("**/api/auth/get-session*");
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByText(seeded.user.email, { exact: true })).toBeVisible();
});

test("unknown cookies never create a user session", async ({ page, context }) => {
  await context.addCookies([{ name: "better-auth.session_token", value: randomBytes(32).toString("hex"), url: env.BETTER_AUTH_URL }]);
  await page.goto("/schedule");
  await expect(page).toHaveURL(/\/login$/);
});
