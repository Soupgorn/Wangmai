import "server-only";
import { cookies } from "next/headers";
import { meResponseSchema } from "@wangmai/shared";

// Server rendering delegates all validation to Hono. Never import backend auth or secrets.
export async function getCurrentUser() {
  const response = await fetch(`${process.env.API_INTERNAL_ORIGIN ?? "http://127.0.0.1:4000"}/api/v1/me`, {
    headers: { cookie: (await cookies()).toString() },
    cache: "no-store",
    signal: AbortSignal.timeout(7_000),
  });
  if (response.status === 401) return null;
  if (!response.ok) throw new Error("Authentication is temporarily unavailable. Please try again.");
  return meResponseSchema.parse(await response.json()).user;
}
