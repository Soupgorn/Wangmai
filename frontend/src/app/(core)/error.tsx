"use client";

import { PageRecovery } from "@/components/shared/page-recovery";

export default function AuthError({ reset }: { reset: () => void }) {
  return <PageRecovery message="Authentication is temporarily unavailable. Please try again." reset={reset} />;
}
