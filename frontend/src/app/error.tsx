"use client";

import { PageRecovery } from "@/components/shared/page-recovery";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return <PageRecovery message="This page is temporarily unavailable. Please try again." reset={reset} />;
}
