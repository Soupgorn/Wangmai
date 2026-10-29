"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { UserShell, userNavigation } from "@/components/layout/workspace-shells";
import { Button } from "@/components/ui/button";
import { useCore } from "./core-provider";
import styles from "./core.module.css";
import { BusyIndicator } from "@/components/shared/busy-indicator";
import { useAccount } from "@/features/auth/auth-boundary";
import { WorkspaceLoading } from "@/components/shared/workspace-loading";

export function CoreWorkspace({ children }: { children: ReactNode }) {
  const path = usePathname();
  const account = useAccount();
  const { snapshot, error, retry, mode } = useCore();
  const title = userNavigation.find((item) => item.href === path.replace(/^\/preview/, ""))?.label ?? "My schedule";
  return <UserShell title={title} activeHref={path} account={{ name: account?.name ?? snapshot?.profile.displayName ?? "Preview", roleLabel: account ? "Google account" : "Preview profile" }}>
    <div key={snapshot ? path : "loading"} className={snapshot ? "motion-page" : ""}>{error ? <div role="alert" className={`${styles.empty} motion-error`}><p>{error}</p><Button onClick={retry}>Try again</Button></div>
      : snapshot ? children : <div className="relative"><WorkspaceLoading label={mode === "persistent" ? "Loading your saved schedule…" : "Loading your preview…"} /><span className="absolute top-8 right-8"><BusyIndicator /></span></div>}</div>
  </UserShell>;
}
