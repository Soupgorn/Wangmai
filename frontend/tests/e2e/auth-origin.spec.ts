import { test, expect } from "@playwright/test";

test("numeric loopback pages canonicalize before cookie-bearing Google sign-in", async ({ page, context, request }) => {
  await context.addCookies([{ name: "origin_regression_marker", value: "1", url: "http://127.0.0.1:3100" }]);
  await page.goto("http://127.0.0.1:3100/login");
  // Never render or submit Google credentials in automation; stop at authorization navigation.
  await expect.poll(() => new URL(page.url()).origin).toBe("http://localhost:3100");
  await expect(page.getByRole("heading", { name: "Welcome to Wangmai." })).toBeVisible();
  // Reproduce the important condition: the initiating browser request carries a cookie.
  await context.addCookies([{ name: "origin_regression_marker", value: "1", url: "http://localhost:3100" }]);
  let authorization: URL | undefined;
  await page.route("**/api/auth/sign-in/social", async (route) => {
    // Capture the real response before the SDK navigates away, invalidating its body.
    const upstream = await route.fetch();
    const data = await upstream.json();
    if (typeof data.url === "string") authorization = new URL(data.url);
    await route.fulfill({ response: upstream });
  });
  await page.route("https://accounts.google.com/**", (route) => route.abort());
  const initiated = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/auth/sign-in/social");
  await page.getByRole("button", { name: "Continue with Google" }).click();
  const response = await initiated;
  expect(response.status()).toBe(200);
  expect(authorization?.origin).toBe("https://accounts.google.com");
  expect(authorization?.searchParams.get("redirect_uri")).toBe("http://localhost:3100/api/auth/callback/google");
  expect(authorization?.searchParams.get("scope")?.split(" ").sort()).toEqual(["email", "openid", "profile"]);
  expect(authorization?.searchParams.get("code_challenge_method")).toBe("S256");
  expect(authorization?.searchParams.has("state")).toBe(true);
  expect(response.request().headers().origin).toBe("http://localhost:3100");
  const session = await request.get("/api/auth/get-session");
  expect(session.status()).toBe(200);
  expect(await session.json()).toBeNull();
  const callback = await request.get("/api/auth/callback/google?error=access_denied", { maxRedirects: 0 });
  expect([302, 303, 307]).toContain(callback.status());
  const target = new URL(callback.headers().location!);
  expect(target.origin).toBe("http://localhost:3100");
  expect(target.pathname).toBe("/login");
});

test("API proxy stays same-origin and untrusted cookie-bearing origins remain rejected", async ({ request }) => {
  const canonical = await request.get("/login?error=access_denied", { maxRedirects: 0 });
  expect(canonical.status()).toBe(200);
  const redirected = await request.get("http://127.0.0.1:3100/login?error=access_denied", { maxRedirects: 0 });
  expect(redirected.status()).toBe(307);
  const target = new URL(redirected.headers().location!);
  expect(target.origin).toBe("http://localhost:3100");
  expect(target.pathname).toBe("/login");
  expect(target.searchParams.get("error")).toBe("access_denied");
  expect((await request.get("http://127.0.0.1:3100/api/health", { maxRedirects: 0 })).status()).toBe(200);
  const forbidden = await request.post("/api/auth/sign-in/social", { headers: { cookie: "origin_regression_marker=1", origin: "http://127.0.0.1:3100" }, data: { provider: "google", callbackURL: "/schedule" } });
  expect(forbidden.status()).toBe(403);
  expect((await forbidden.json()).code).toBe("INVALID_ORIGIN");
});
