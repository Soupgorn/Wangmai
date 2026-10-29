"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { AvailabilitySearchQuery } from "@wangmai/shared";
import { fetchAvailability, rangeFromResponse } from "./availability-client";
import { ScheduleRequestError } from "./database-repository";
import type { RangeResults } from "./date-range";

type SearchState = { key: string; sequence: number; attempt: number; range: RangeResults | null; error: string };
export function useLiveAvailability(query: AvailabilitySearchQuery | null, enabled: boolean) {
  const key = enabled && query ? JSON.stringify(query) : "";
  const [request, setRequest] = useState({ key, sequence: 0 });
  // Returning A → B → A is a fresh query, never a cached A response.
  if (request.key !== key) setRequest({ key, sequence: request.sequence + 1 });
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<SearchState | null>(null);
  const router = useRouter();
  const sequence = request.sequence;
  useEffect(() => {
    if (!key) return;
    const controller = new AbortController(); let current = true;
    // Coalesce rapid date/time input while retaining immediate visible loading feedback.
    const timer = window.setTimeout(() => {
      void fetchAvailability(JSON.parse(key) as AvailabilitySearchQuery, controller.signal).then(
        (response) => { if (current) setState({ key, sequence, attempt, range: rangeFromResponse(response), error: "" }); },
        (reason) => {
          if (!current) return;
          if (reason instanceof ScheduleRequestError && reason.status === 401) router.replace("/login");
          setState({ key, sequence, attempt, range: null, error: reason instanceof Error ? reason.message : "Shared availability could not load. Please try again." });
        },
      );
    }, 200);
    return () => { current = false; clearTimeout(timer); controller.abort(); };
  }, [attempt, key, router, sequence]);
  useEffect(() => {
    if (!key) return;
    const refresh = () => { if (document.visibilityState === "visible") setAttempt((value) => value + 1); };
    // Sharing changes in another account are reflected without persisting public results locally.
    window.addEventListener("focus", refresh); document.addEventListener("visibilitychange", refresh);
    const timer = window.setInterval(refresh, 30_000);
    return () => { window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", refresh); clearInterval(timer); };
  }, [key]);
  const current = state?.key === key && state.sequence === sequence && state.attempt === attempt ? state : null;
  return { range: current?.range ?? null, error: current?.error ?? "", loading: !!key && !current, retry: () => setAttempt((value) => value + 1) };
}
