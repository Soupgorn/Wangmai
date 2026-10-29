"use client";

import { useLayoutEffect, useRef, type RefObject } from "react";
import type { ScheduleBlock } from "@/features/core/types";

export function animateMotion(element: HTMLElement, frames: Keyframe[], token: string, id: string, delay = 0) {
  const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
  if (preference.matches || !element.animate) return null;
  const tokens = getComputedStyle(document.documentElement);
  // Registered time properties can be serialized as seconds by the browser.
  const time = tokens.getPropertyValue(`--motion-${token}`).trim();
  const milliseconds = parseFloat(time) * (time.endsWith("ms") ? 1 : 1000);
  const animation = element.animate(frames, {
    duration: milliseconds || 240,
    easing: tokens.getPropertyValue("--motion-ease").trim() || "ease-out", delay, fill: "backwards",
  });
  animation.id = id;
  const reduce = () => { if (preference.matches) animation.cancel(); };
  preference.addEventListener("change", reduce);
  void animation.finished.then(() => preference.removeEventListener("change", reduce), () => preference.removeEventListener("change", reduce));
  return animation;
}

/** Commit latest results immediately. Cancelling motion never retains old content. */
export function useResultMotion(ref: RefObject<HTMLDivElement | null>, revision: string) {
  const previous = useRef<string | null>(null);
  useLayoutEffect(() => {
    const changed = previous.current !== null && previous.current !== revision;
    previous.current = revision;
    if (!changed || !ref.current) return;
    const animations = Array.from(ref.current.children).map((node, index) => animateMotion(node as HTMLElement,
      [{ opacity: 0.35, transform: "translateY(8px)" }, { opacity: 1, transform: "none" }], "state", "wm-result", Math.min(index, 3) * 35));
    return () => animations.forEach((animation) => animation?.cancel());
  }, [ref, revision]);
}

/** Snapshot changes acknowledge completed repository writes, not pending requests. */
export function useBlockMotion(ref: RefObject<HTMLDivElement | null>, blocks: readonly ScheduleBlock[], view: string) {
  const previous = useRef<{ view: string; nodes: Map<string, { clone: HTMLElement; parent: HTMLElement; signature: string }> } | null>(null);
  useLayoutEffect(() => {
    if (!ref.current) return;
    const signatures = new Map(blocks.map((block) => [block.id, JSON.stringify(block)]));
    const nodes = new Map<string, { clone: HTMLElement; parent: HTMLElement; signature: string }>();
    const animations: Animation[] = [];
    const ghosts: HTMLElement[] = [];
    const sameView = previous.current?.view === view;
    ref.current.querySelectorAll<HTMLButtonElement>("[data-block-id]").forEach((element) => {
      const key = `${element.dataset.blockDate}:${element.dataset.blockId}`;
      const signature = signatures.get(element.dataset.blockId ?? "") ?? "";
      const before = sameView ? previous.current?.nodes.get(key) : undefined;
      if (sameView && (!before || before.signature !== signature)) {
        const animation = animateMotion(element, [{ opacity: 0, transform: "scale(.94)" }, { opacity: 1, transform: "none" }], "block", "wm-block-enter", 140);
        if (animation) animations.push(animation);
      }
      if (element.parentElement) nodes.set(key, { clone: element.cloneNode(true) as HTMLElement, parent: element.parentElement, signature });
    });
    if (sameView) previous.current?.nodes.forEach((before, key) => {
      if (nodes.has(key) || !before.parent.isConnected || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      const ghost = before.clone as HTMLButtonElement;
      ghost.removeAttribute("data-block-id"); ghost.removeAttribute("id");
      ghost.setAttribute("aria-hidden", "true"); ghost.setAttribute("data-motion-exit", "");
      ghost.disabled = true; ghost.tabIndex = -1; ghost.style.pointerEvents = "none";
      before.parent.appendChild(ghost); ghosts.push(ghost);
      const animation = animateMotion(ghost, [{ opacity: 1, transform: "none" }, { opacity: 0, transform: "scale(.94)" }], "exit", "wm-block-exit");
      if (animation) { animations.push(animation); void animation.finished.then(() => ghost.remove(), () => ghost.remove()); }
      else ghost.remove();
    });
    previous.current = { view, nodes };
    return () => { animations.forEach((animation) => animation.cancel()); ghosts.forEach((ghost) => ghost.remove()); };
  }, [blocks, ref, view]);
}
