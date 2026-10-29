"use client";

import { createContext, useContext, useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { MeResponse } from "@wangmai/shared";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { WorkspaceLoading } from "@/components/shared/workspace-loading";

const AccountContext = createContext<MeResponse["user"] | null>(null);
export function useAccount() { return useContext(AccountContext); }

export function AuthBoundary({ children }: { children: ReactNode }) {
  const { data, isPending, error, refetch } = authClient.useSession();
  const router = useRouter();
  useEffect(() => {
    if (!isPending && !error && !data) router.replace("/login");
  }, [data, error, isPending, router]);
  if (error) return <main id="main-content" className="mx-auto grid min-h-svh max-w-md content-center gap-5 p-6"><h1 className="text-2xl font-semibold tracking-tight">Let’s reconnect.</h1><p role="alert" className="text-sm leading-relaxed text-muted-foreground">We couldn’t check your session. Please try again.</p><Button onClick={() => void refetch()}>Try again</Button></main>;
  if (isPending || !data) return <main id="main-content"><WorkspaceLoading label="Checking your session…" /></main>;
  return <AccountContext.Provider value={{ ...data.user, image: data.user.image ?? null }}>{children}</AccountContext.Provider>;
}
