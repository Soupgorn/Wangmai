import { healthResponseSchema, type HealthResponse } from "@wangmai/shared";

// Browser-only, same-origin API calls preserve session cookies for future auth.
export async function getHealth(signal?: AbortSignal): Promise<HealthResponse> {
  const response = await fetch("/api/health", {
    credentials: "same-origin",
    cache: "no-store",
    ...(signal ? { signal } : {}),
  });
  if (!response.ok) throw new Error(`Health check failed (${response.status})`);
  return healthResponseSchema.parse(await response.json());
}
