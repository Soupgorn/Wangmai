"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { FlaskConical } from "lucide-react";
import { UserShell, userNavigation } from "@/components/layout/workspace-shells";
import { Button } from "@/components/ui/button";
import { useCore } from "./core-provider";
import styles from "./core.module.css";

export function CoreWorkspace({ children }: { children: ReactNode }) {
  const path = usePathname();
  const { snapshot, error, retry } = useCore();
  const title = userNavigation.find((item) => item.href === path)?.label ?? "My schedule";
  return <UserShell title={title} activeHref={path} account={{ name: snapshot?.profile.displayName ?? "Preview", roleLabel: "Preview profile" }}>
    <p className={styles.previewNotice}><FlaskConical aria-hidden="true" />Interactive preview. Fictional people; changes reset on refresh.</p>
    {error ? <div role="alert" className={styles.empty}><p>{error}</p><Button onClick={retry}>Try again</Button></div>
      : snapshot ? children : <p role="status" className={styles.empty}>Loading your preview…</p>}
  </UserShell>;
}
