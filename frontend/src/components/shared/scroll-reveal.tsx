"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { animateMotion } from "@/lib/motion";

/** SSR and failed scripts leave content visible. A reveal runs once, on entry. */
export function ScrollReveal({ children, className, id, label }: { children: ReactNode; className: string | undefined; id: string; label: string }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element || !window.IntersectionObserver) return;
    let animation: Animation | null = null;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry?.isIntersecting) return;
      observer.disconnect(); element.dataset.revealed = "true";
      animation = animateMotion(element, [{ opacity: 0, transform: "translateY(18px)" }, { opacity: 1, transform: "none" }], "section", "wm-scroll-reveal");
    }, { threshold: 0.15 });
    observer.observe(element);
    return () => { observer.disconnect(); animation?.cancel(); };
  }, []);
  return <section ref={ref} id={id} aria-label={label} className={className} data-scroll-reveal>{children}</section>;
}
