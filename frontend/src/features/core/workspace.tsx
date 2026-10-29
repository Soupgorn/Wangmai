"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { UserShell, userNavigation } from "@/components/layout/workspace-shells";
import { Button } from "@/components/ui/button";
import { useCore } from "./core-provider";
import styles from "./core.module.css";
import { useAccount } from "@/features/auth/auth-boundary";
import { WorkspaceLoading } from "@/components/shared/workspace-loading";

export function CoreWorkspace({ children }: { children: ReactNode }) {
  const path = usePathname();
  const account = useAccount();
  const { snapshot, error, retry } = useCore();
  const title = userNavigation.find((item) => item.href === path.replace(/^\/preview/, ""))?.label ?? "My schedule";
  return <UserShell title={title} activeHref={path} account={{ name: account?.name ?? snapshot?.profile.displayName ?? "Preview", roleLabel: account ? "Google account" : "Preview profile" }}>
    <p className={styles.previewNotice}><strong>Interactive preview</strong><span>{account ? "Your Google account is connected. Schedules, people, and preferences below are demo data; changes reset on refresh." : "Fictional people and schedules. Changes reset on refresh."}</span></p>
    {error ? <div role="alert" className={styles.empty}><p>{error}</p><Button onClick={retry}>Try again</Button></div>
      : snapshot ? children : <WorkspaceLoading label="Loading the preview…" />}
  </UserShell>;
}
