import type pg from "pg";
import { setTimeout as delay } from "node:timers/promises";

export type ApiVariables = { requestId: string; userId: string };
export function reportRequestFailure(requestId: string | undefined) {
  // Deliberately omit URL, query, exception, headers, body and identity.
  console.error(JSON.stringify({ event: "request_failed", requestId: requestId ?? "unavailable" }));
}

export function databaseReadiness(pool: pg.Pool) {
  let pending: Promise<boolean> | undefined;
  return () => {
    // Coalesce concurrent health requests; never build a second connection queue.
    const query: pg.QueryConfig & { query_timeout: number } = { text: "SELECT 1", query_timeout: 1500 };
    pending ??= pool.query(query).then(() => true, () => false).finally(() => { pending = undefined; });
    return pending;
  };
}

export async function waitForDatabase(check: () => Promise<unknown>, signal: AbortSignal, retryDelayMs = 1000) {
  for (let attempt = 0; attempt < 5; attempt++) {
    signal.throwIfAborted();
    try { await check(); return; }
    catch (error) {
      const code = (error as { code?: string }).code;
      if (attempt === 4 || !code || !["ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "57P01", "57P02", "57P03", "08006", "53300"].includes(code)) throw error;
      await delay(retryDelayMs, undefined, { signal });
    }
  }
}

type ClosableServer = {
  close(callback: (error?: Error) => void): unknown;
  closeAllConnections?: () => void;
};
export async function drainServer(server: ClosableServer, endPool: () => Promise<void>, timeoutMs = 25000) {
  let timer: NodeJS.Timeout;
  const graceful = new Promise<boolean>((resolve) => {
    server.close((error) => {
      void endPool().then(() => resolve(!error), () => resolve(false));
    });
  });
  const deadline = new Promise<boolean>((resolve) => {
    timer = setTimeout(() => { server.closeAllConnections?.(); resolve(false); }, timeoutMs);
  });
  try { return await Promise.race([graceful, deadline]); }
  finally { clearTimeout(timer!); }
}
