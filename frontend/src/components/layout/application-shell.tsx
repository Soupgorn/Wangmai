import Link from "next/link";
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { ArrowUpRight, ChevronRight } from "lucide-react";
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
    <nav aria-label="Workspace navigation" className="flex flex-wrap gap-1.5 lg:flex-col">
      {items.map(({ label, href, icon: Icon }) => {
        const content = <><Icon aria-hidden="true" className="size-4 shrink-0" /><span>{label}</span></>;
        const className = cn("flex items-center gap-2.5 rounded-sm px-3 py-3 text-xs", activeHref === href ? "bg-sidebar-accent font-semibold text-sidebar-accent-foreground" : "text-muted-foreground");
        return <Link key={href} href={href} aria-current={activeHref === href ? "page" : undefined} className={cn(className, "hover:bg-sidebar-accent")}>{content}</Link>;
      })}
    </nav>
  );
}

export function ApplicationHeader({ title, account }: Pick<ApplicationShellProps, "title" | "account">) {
  return (
    <header aria-label="Page header" className="flex min-h-[76px] items-center justify-between gap-4 border-b bg-card px-6 lg:px-8">
      <div className="flex items-center gap-2.5 text-[11px] text-muted-foreground"><span>Your space</span><ChevronRight aria-hidden="true" className="size-3.5" /><span className="font-medium text-foreground">{title}</span></div>
      <Link href="/settings" aria-label="Open profile settings" className="rounded-full"><UserAvatar name={account.name} decorative /></Link>
    </header>
  );
}

/** Presentation only: authentication and authorization are owned by later phases. */
export function ApplicationShell({ title, account, navigation, activeHref, children }: ApplicationShellProps) {
  return (
    <div className="min-h-svh lg:grid lg:grid-cols-[200px_minmax(0,1fr)]">
      <aside className="flex flex-col gap-6 border-b bg-sidebar px-4 py-6 lg:sticky lg:top-0 lg:h-svh lg:border-r lg:border-b-0 lg:py-8">
        <Brand className="ml-1" />
        <SidebarNavigation items={navigation} {...(activeHref === undefined ? {} : { activeHref })} />
        <div className="mt-auto hidden space-y-5 pt-8 lg:block">
          <Link href="/" className="flex items-center gap-2 rounded-sm text-[11px] text-muted-foreground"><ArrowUpRight aria-hidden="true" className="size-3.5" />Back to Wangmai</Link>
          <div className="flex items-center gap-2.5 border-t pt-5"><UserAvatar name={account.name} decorative /><div className="min-w-0 [overflow-wrap:anywhere]"><p className="text-xs font-semibold">{account.name}</p>{account.roleLabel && <p className="mt-1 text-[10px] text-muted-foreground">{account.roleLabel}</p>}</div></div>
        </div>
      </aside>
      <div className="min-w-0"><ApplicationHeader title={title} account={account} /><main id="main-content" className="p-4 sm:p-6 lg:p-8">{children}</main></div>
    </div>
  );
}
