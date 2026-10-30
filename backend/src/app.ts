import { Hono } from "hono";
import { randomUUID } from "node:crypto";
import { bodyLimit } from "hono/body-limit";
import type { HealthResponse } from "@wangmai/shared";
import type { Auth } from "./auth/auth.js";
import type { Database } from "./db/client.js";
import { scheduleRoutes } from "./modules/schedule/routes.js";
import { availabilityRoutes } from "./modules/availability/routes.js";
import { reportRequestFailure, type ApiVariables } from "./operations.js";

export function createApp(auth: Auth, googleEnabled: boolean, db?: Database, ready: () => Promise<boolean> = async () => false) {
  const app = new Hono<{ Variables: ApiVariables }>();

  app.use("/api/*", async (c, next) => {
    const requestId = randomUUID();
    c.set("requestId", requestId);
    c.header("X-Request-Id", requestId);
    c.header("Cache-Control", "no-store");
    await next();
  });
  app.get("/api/health", (c) => c.json({ status: "ok", service: "wangmai-api" } satisfies HealthResponse));
  app.get("/api/ready", async (c) => {
    const available = await ready().catch(() => false);
    return c.json({ status: available ? "ok" : "unavailable" }, available ? 200 : 503);
  });
  app.onError((_error, c) => {
    reportRequestFailure(c.get("requestId"));
    return c.json({ error: "Service temporarily unavailable. Please try again." }, 503,
      { "Cache-Control": "no-store", "X-Request-Id": c.get("requestId") });
  });
  app.use("/api/auth/*", bodyLimit({ maxSize: 64 * 1024, onError: (c) => c.json({ error: "Authentication request is too large." }, 413) }));
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
  if (db) app.route("/api/v1/me", scheduleRoutes(auth, db));
  if (db) app.route("/api/v1/availability", availabilityRoutes(auth, db));
  return app;
}
