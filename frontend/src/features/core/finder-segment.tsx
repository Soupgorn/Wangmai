"use client";

import { useLayoutEffect, useRef } from "react";
import { animateMotion } from "@/lib/motion";
import styles from "./finder.module.css";

/** Native buttons retain Tab/Enter/Space behavior; selection never moves focus. */
export function FinderSegment<T extends string>({ label, value, options, onChange }: {
  label: string; value: T; options: readonly { value: T; label: string }[]; onChange: (value: T) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const previous = useRef<{ left: number; width: number } | null>(null);
  useLayoutEffect(() => {
    const selected = ref.current?.querySelector<HTMLElement>('[aria-pressed="true"]');
    const indicator = selected?.querySelector<HTMLElement>("[data-segment-fill]");
    if (!selected || !indicator) return;
    const next = { left: selected.offsetLeft, width: selected.offsetWidth };
    const before = previous.current; previous.current = next;
    if (!before) return;
    const animation = animateMotion(indicator, [
      { transform: `translateX(${before.left - next.left}px) scaleX(${before.width / next.width})` },
      { transform: "none" },
    ], "state", "wm-finder-segment");
    return () => animation?.cancel();
  }, [value]);
  return <div ref={ref} className={styles.segment} role="group" aria-label={label}>
    {options.map((option) => <button key={option.value} type="button" aria-pressed={value === option.value} onClick={() => onChange(option.value)}>
      {value === option.value && <span data-segment-fill className={styles.segmentFill} aria-hidden="true" />}
      <span className={styles.segmentText}>{option.label}</span>
    </button>)}
  </div>;
}
