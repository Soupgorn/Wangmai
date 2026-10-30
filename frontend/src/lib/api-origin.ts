// Imported only by server session/readiness code. Never expose this in NEXT_PUBLIC_*.
export function internalApiOrigin(source: NodeJS.ProcessEnv = process.env) {
  const value = source.API_INTERNAL_ORIGIN ?? (source.NODE_ENV === "production" ? "" : "http://127.0.0.1:4000");
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol) || url.origin !== value || url.username || url.password) throw new Error();
    return url.origin;
  } catch { throw new Error("Internal API origin is missing or invalid"); }
}

export async function frontendReadiness(fetcher: typeof fetch = fetch, source: NodeJS.ProcessEnv = process.env) {
  let ready = false;
  try {
    const response = await fetcher(`${internalApiOrigin(source)}/api/ready`, { cache: "no-store", signal: AbortSignal.timeout(7000) });
    ready = response.status === 200 && (await response.json() as { status?: string }).status === "ok";
  } catch { /* Dependency/configuration details stay private. */ }
  return Response.json({ status: ready ? "ok" : "unavailable" }, { status: ready ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}
