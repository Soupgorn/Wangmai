import "server-only";
import { cookies } from "next/headers";
import { meResponseSchema } from "@wangmai/shared";
import { internalApiOrigin } from "./api-origin";

// Server rendering delegates all validation to Hono. Never import backend auth or secrets.
export async function getCurrentUser() {
  // Read request state before resolving runtime configuration so Next can defer
  // authenticated rendering during a credential-free production image build.
  const cookie = (await cookies()).toString();
  const response = await fetch(`${internalApiOrigin()}/api/v1/me`, {
    headers: { cookie },
    cache: "no-store",
    signal: AbortSignal.timeout(7_000),
  });
  if (response.status === 401) return null;
  if (!response.ok) throw new Error("Authentication is temporarily unavailable. Please try again.");
  return meResponseSchema.parse(await response.json()).user;
}
