"use client";

import { useLayoutEffect, useRef, type RefObject } from "react";
import { animateMotion } from "@/lib/motion";

/** Commit content first. Exiting filter cards are inert visual copies, never stale query results. */
export function useFinderMotion(ref: RefObject<HTMLDivElement | null>, revision: string, query: string) {
  const previous = useRef<{ query: string; nodes: Map<string, { clone: HTMLElement; top: number; left: number; width: number; height: number }> } | null>(null);
  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;
    const bounds = root.getBoundingClientRect();
    const nodes = new Map<string, { clone: HTMLElement; top: number; left: number; width: number; height: number }>();
    const animations: Animation[] = []; const ghosts: HTMLElement[] = [];
    const sameQuery = previous.current?.query === query;
    root.querySelectorAll<HTMLElement>("[data-result-key]").forEach((element, index) => {
      const key = element.dataset.resultKey!;
      const box = element.getBoundingClientRect();
      const top = box.top - bounds.top; const left = box.left - bounds.left;
      const before = sameQuery ? previous.current?.nodes.get(key) : undefined;
      const frames = before
        ? [{ transform: `translate(${before.left - left}px, ${before.top - top}px)` }, { transform: "none" }]
        : [{ opacity: .25, transform: "translateY(10px) scale(.985)" }, { opacity: 1, transform: "none" }];
      const animation = animateMotion(element, frames, "state", "wm-result", before ? 0 : Math.min(index, 3) * 35);
      if (animation) animations.push(animation);
      nodes.set(key, { clone: element.cloneNode(true) as HTMLElement, top, left, width: box.width, height: box.height });
    });
    if (sameQuery && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) previous.current?.nodes.forEach((before, key) => {
      if (nodes.has(key)) return;
      const ghost = before.clone;
      [ghost, ...ghost.querySelectorAll<HTMLElement>("*")].forEach((node) => { node.removeAttribute("id"); node.removeAttribute("data-testid"); node.removeAttribute("data-result-key"); });
      ghost.inert = true; ghost.setAttribute("aria-hidden", "true"); ghost.setAttribute("data-finder-exit", "");
      Object.assign(ghost.style, { position: "absolute", top: `${before.top}px`, left: `${before.left}px`, width: `${before.width}px`, height: `${before.height}px`, pointerEvents: "none", zIndex: "0" });
      root.appendChild(ghost); ghosts.push(ghost);
      const animation = animateMotion(ghost, [{ opacity: .7, transform: "none" }, { opacity: 0, transform: "translateY(-6px) scale(.98)" }], "exit", "wm-finder-exit");
      if (animation) { animations.push(animation); void animation.finished.then(() => ghost.remove(), () => ghost.remove()); }
      else ghost.remove();
    });
    previous.current = { query, nodes };
    return () => { animations.forEach((animation) => animation.cancel()); ghosts.forEach((ghost) => ghost.remove()); };
  }, [query, ref, revision]);
}
