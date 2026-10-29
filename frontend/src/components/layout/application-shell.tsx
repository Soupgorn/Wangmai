"use client";

import Link from "next/link";
import { useState, useSyncExternalStore, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { ChevronRight, Menu, X } from "lucide-react";
import { Brand } from "@/components/shared/brand";
import { UserAvatar } from "@/components/shared/user-avatar";
import { Button } from "@/components/ui/button";
import { SidebarNavigation } from "./workspace-navigation";
export { SidebarNavigation } from "./workspace-navigation";

export type NavigationItem = { label: string; href: string; icon: LucideIcon };
export type ShellAccount = { name: string; roleLabel?: string };
export type ApplicationShellProps = {
  title: string;
  account: ShellAccount;
  navigation: readonly NavigationItem[];
  activeHref?: string;
  children: ReactNode;
};

function subscribeCompact(callback: () => void) {
  const media = window.matchMedia("(max-width:1023px)");
  media.addEventListener("change", callback);
  return () => media.removeEventListener("change", callback);
}
const compactNavigation = () => window.matchMedia("(max-width:1023px)").matches;
const serverNavigation = () => false;

export function ApplicationHeader({ title, account, activeHref }: Pick<ApplicationShellProps, "title" | "account" | "activeHref">) {
  return (
    <header aria-label="Page header" className="flex min-h-[76px] items-center justify-between gap-4 border-b bg-card px-6 lg:px-8">
      <div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground"><Link href={activeHref?.startsWith("/preview/") ? "/preview/schedule" : "/schedule"} className="inline-flex min-h-11 items-center rounded-sm hover:text-foreground">Your space</Link><ChevronRight aria-hidden="true" className="size-3.5 shrink-0" /><span className="font-medium text-foreground">{title}</span></div>
      <Link href={activeHref?.startsWith("/preview/") ? "/preview/settings" : "/settings"} aria-label="Open profile settings" className="grid size-11 shrink-0 place-items-center rounded-full transition-colors hover:bg-secondary"><UserAvatar name={account.name} decorative /></Link>
    </header>
  );
}

/** Presentation only: Hono and the authenticated route boundary validate sessions. */
export function ApplicationShell({ title, account, navigation, activeHref, children }: ApplicationShellProps) {
  const [menuOpen, setMenuOpen] = useState(true);
  const compact = useSyncExternalStore(subscribeCompact, compactNavigation, serverNavigation);
  const expanded = !compact || menuOpen;
  return (
    <div className="min-h-svh lg:grid lg:grid-cols-[200px_minmax(0,1fr)]">
      <aside className="flex flex-col gap-6 border-b bg-sidebar px-4 py-6 lg:sticky lg:top-0 lg:h-svh lg:border-r lg:border-b-0 lg:py-8">
        <div className="flex items-center justify-between gap-3"><Brand className="ml-1" /><Button variant="ghost" size="icon" className="lg:hidden" aria-label={expanded ? "Hide navigation" : "Show navigation"} aria-controls="workspace-menu" aria-expanded={expanded} onClick={() => setMenuOpen(!menuOpen)}>{expanded ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}</Button></div>
        <div id="workspace-menu" className="motion-nav-collapse" data-open={expanded} inert={!expanded}><div className="motion-nav-inner"><SidebarNavigation items={navigation} {...(activeHref === undefined ? {} : { activeHref })} /></div></div>
      </aside>
      <div className="min-w-0"><ApplicationHeader title={title} account={account} {...(activeHref === undefined ? {} : { activeHref })} /><main id="main-content" className="p-4 sm:p-6 lg:p-8">{children}</main></div>
    </div>
  );
}
