"use client";

import Link from "next/link";
import { useLayoutEffect, useRef } from "react";
import { animateMotion } from "@/lib/motion";
import { cn } from "@/lib/utils";
import type { NavigationItem } from "./application-shell";

function position(nav: HTMLElement, indicator: HTMLElement) {
  const active = nav.querySelector<HTMLElement>('[aria-current="page"]');
  if (!active) return;
  const box = active.getBoundingClientRect(); const parent = nav.getBoundingClientRect();
  Object.assign(indicator.style, { left: `${box.left - parent.left}px`, top: `${box.top - parent.top}px`, width: `${box.width}px`, height: `${box.height}px` });
  nav.dataset.ready = "true";
}

export function SidebarNavigation({ items, activeHref }: { items: readonly NavigationItem[]; activeHref?: string }) {
  const nav = useRef<HTMLElement>(null);
  const indicator = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    if (!nav.current || !indicator.current) return;
    const before = indicator.current.getBoundingClientRect();
    position(nav.current, indicator.current);
    const after = indicator.current.getBoundingClientRect();
    const animation = before.width && after.width ? animateMotion(indicator.current,
      [{ transform: `translate(${before.left - after.left}px,${before.top - after.top}px) scale(${before.width / after.width},${before.height / after.height})` }, { transform: "none" }], "state", "wm-navigation") : null;
    return () => animation?.cancel();
  }, [activeHref]);
  useLayoutEffect(() => {
    const element = nav.current; const marker = indicator.current;
    if (!element || !marker) return;
    const observer = new ResizeObserver(() => position(element, marker));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return <nav ref={nav} aria-label="Workspace navigation" className="motion-nav grid grid-cols-3 gap-1.5 lg:flex lg:flex-col">
    <span ref={indicator} aria-hidden="true" className="motion-nav-indicator" />
    {items.map(({ label, href, icon: Icon }) => <Link key={href} href={href} aria-current={activeHref === href ? "page" : undefined} className={cn("flex min-h-11 items-center justify-center gap-2 rounded-sm px-2 py-3 text-xs max-[360px]:flex-col max-[360px]:gap-1 lg:justify-start lg:px-3 lg:text-[13px] hover:bg-sidebar-accent", activeHref === href ? "bg-sidebar-accent font-semibold text-sidebar-accent-foreground" : "text-muted-foreground")}><Icon aria-hidden="true" className="size-4 shrink-0" /><span>{label}</span></Link>)}
  </nav>;
}
