"use client";

import type { ReactNode } from "react";
import { useAccount } from "@/features/auth/auth-boundary";
import { CoreProvider } from "./core-provider";
import { CoreWorkspace } from "./workspace";

export function AuthenticatedWorkspace({ children }: { children: ReactNode }) {
  const account = useAccount();
  const mode = "persistent";
  // A session can change in another tab without navigating this document.
  // Reload the repository and all account-scoped view state for the new user.
  return <CoreProvider key={account?.id ?? mode} mode={mode}><CoreWorkspace>{children}</CoreWorkspace></CoreProvider>;
}
