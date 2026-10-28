import { Hono } from "hono";
import type { HealthResponse } from "@wangmai/shared";

export const app = new Hono();

app.get("/api/health", (c) => {
  c.header("Cache-Control", "no-store");
  return c.json({ status: "ok", service: "wangmai-api" } satisfies HealthResponse);
});
