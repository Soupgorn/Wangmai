"use client";

import { useEffect, useState } from "react";
import { CircleCheck, CircleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { getHealth } from "@/lib/api-client";

export function ApiStatus() {
  const [status, setStatus] = useState<"checking" | "ok" | "error">("checking");

  useEffect(() => {
    const controller = new AbortController();
    getHealth(controller.signal).then(
      () => setStatus("ok"),
      () => { if (!controller.signal.aborted) setStatus("error"); },
    );
    return () => controller.abort();
  }, []);

  return (
    <div role="status" aria-live="polite">
      <Badge variant="outline">
        {status === "ok" && <CircleCheck aria-hidden="true" />}
        {status === "error" && <CircleAlert aria-hidden="true" />}
        {status === "checking" ? "Checking API connection…" : status === "ok" ? "API connected" : "API unavailable"}
      </Badge>
    </div>
  );
}
