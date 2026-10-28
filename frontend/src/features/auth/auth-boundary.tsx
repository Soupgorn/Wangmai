"use client";

import { createContext, useContext, useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { MeResponse } from "@wangmai/shared";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";

const AccountContext = createContext<MeResponse["user"] | null>(null);
export function useAccount() { return useContext(AccountContext); }

export function AuthBoundary({ children }: { children: ReactNode }) {
  const { data, isPending, error, refetch } = authClient.useSession();
  const router = useRouter();
  useEffect(() => {
    if (!isPending && !error && !data) router.replace("/login");
  }, [data, error, isPending, router]);
  if (error) return <main className="p-8"><p role="alert">We couldn’t check your session. Please try again.</p><Button onClick={() => void refetch()}>Try again</Button></main>;
  if (isPending || !data) return <main className="p-8" role="status">Checking your session…</main>;
  return <AccountContext.Provider value={{ ...data.user, image: data.user.image ?? null }}>{children}</AccountContext.Provider>;
}
