import Link from "next/link";
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { ChevronRight } from "lucide-react";
import { Brand } from "@/components/shared/brand";
import { UserAvatar } from "@/components/shared/user-avatar";
import { cn } from "@/lib/utils";

export type NavigationItem = { label: string; href: string; icon: LucideIcon };
export type ShellAccount = { name: string; roleLabel?: string };
export type ApplicationShellProps = {
  title: string;
  account: ShellAccount;
  navigation: readonly NavigationItem[];
  activeHref?: string;
  children: ReactNode;
};

export function SidebarNavigation({ items, activeHref }: { items: readonly NavigationItem[]; activeHref?: string }) {
  return (
    <nav aria-label="Workspace navigation" className="grid grid-cols-3 gap-1.5 lg:flex lg:flex-col">
      {items.map(({ label, href, icon: Icon }) => {
        const content = <><Icon aria-hidden="true" className="size-4 shrink-0" /><span>{label}</span></>;
        const className = cn("flex min-h-11 items-center justify-center gap-2 rounded-sm px-2 py-3 text-xs transition-colors duration-[180ms] max-[360px]:flex-col max-[360px]:gap-1 lg:justify-start lg:px-3 lg:text-[13px]", activeHref === href ? "bg-sidebar-accent font-semibold text-sidebar-accent-foreground" : "text-muted-foreground");
        return <Link key={href} href={href} aria-current={activeHref === href ? "page" : undefined} className={cn(className, "hover:bg-sidebar-accent")}>{content}</Link>;
      })}
    </nav>
  );
}

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
  return (
    <div className="min-h-svh lg:grid lg:grid-cols-[200px_minmax(0,1fr)]">
      <aside className="flex flex-col gap-6 border-b bg-sidebar px-4 py-6 lg:sticky lg:top-0 lg:h-svh lg:border-r lg:border-b-0 lg:py-8">
        <Brand className="ml-1" />
        <SidebarNavigation items={navigation} {...(activeHref === undefined ? {} : { activeHref })} />
      </aside>
      <div className="min-w-0"><ApplicationHeader title={title} account={account} {...(activeHref === undefined ? {} : { activeHref })} /><main id="main-content" className="p-4 sm:p-6 lg:p-8">{children}</main></div>
    </div>
  );
}
