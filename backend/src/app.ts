import { Hono } from "hono";
import type { HealthResponse } from "@wangmai/shared";
import type { Auth } from "./auth/auth.js";

export function createApp(auth: Auth, googleEnabled: boolean) {
  const app = new Hono();

  app.use("/api/*", async (c, next) => {
    c.header("Cache-Control", "no-store");
    await next();
  });
  app.get("/api/health", (c) => c.json({ status: "ok", service: "wangmai-api" } satisfies HealthResponse));
  app.onError(() => new Response(JSON.stringify({ error: "Service temporarily unavailable. Please try again." }), {
    status: 503, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  }));
  app.all("/api/auth/*", async (c) => {
    if (!googleEnabled && c.req.path === "/api/auth/sign-in/social") {
      return c.json({ code: "GOOGLE_NOT_CONFIGURED", message: "Google sign-in is not configured yet. Please try again later." }, 503);
    }
    if (c.req.path === "/api/auth/sign-in/social" && c.req.method === "POST") {
      const body = await c.req.raw.clone().json().catch(() => null);
      // Only the basic Google redirect flow is supported. Do not accept client-added scopes.
      if (!body || body.provider !== "google" || body.scopes || body.additionalParams || body.idToken) {
        return c.json({ code: "INVALID_SIGN_IN", message: "Only basic Google sign-in is supported." }, 400);
      }
    }
    return auth.handler(c.req.raw);
  });
  app.get("/api/v1/me", async (c) => {
    const { response: session, headers } = await auth.api.getSession({ headers: c.req.raw.headers, returnHeaders: true });
    for (const cookie of headers.getSetCookie()) c.header("Set-Cookie", cookie, { append: true });
    if (!session) return c.json({ error: "Unauthorized" }, 401);
    const { id, name, email, emailVerified, image } = session.user;
    return c.json({ user: { id, name, email, emailVerified, image: image ?? null } });
  });
  return app;
}
