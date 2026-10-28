"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { FlaskConical } from "lucide-react";
import { UserShell, userNavigation } from "@/components/layout/workspace-shells";
import { Button } from "@/components/ui/button";
import { useCore } from "./core-provider";
import styles from "./core.module.css";
import { useAccount } from "@/features/auth/auth-boundary";

export function CoreWorkspace({ children }: { children: ReactNode }) {
  const path = usePathname();
  const account = useAccount();
  const { snapshot, error, retry } = useCore();
  const title = userNavigation.find((item) => item.href === path.replace(/^\/preview/, ""))?.label ?? "My schedule";
  return <UserShell title={title} activeHref={path} account={{ name: account?.name ?? snapshot?.profile.displayName ?? "Preview", roleLabel: account ? "Google account" : "Preview profile" }}>
    <p className={styles.previewNotice}><FlaskConical aria-hidden="true" />{account ? "Signed in. Schedule and availability below are a separate fictional preview; changes reset on refresh. No schedules are saved to your account." : "Interactive preview. Fictional people; changes reset on refresh."}</p>
    {error ? <div role="alert" className={styles.empty}><p>{error}</p><Button onClick={retry}>Try again</Button></div>
      : snapshot ? children : <p role="status" className={styles.empty}>Loading your preview…</p>}
  </UserShell>;
}
