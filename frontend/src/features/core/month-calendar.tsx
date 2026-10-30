"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "./core-ui";
import { useCore } from "./core-provider";
import { addDays, dateValue, formatDate, matchesDate, monthDates } from "./time";
import { applyDatedBlocks, selectDate, type SelectionMode } from "./date-range";
import type { ScheduleBlock } from "./types";
import styles from "./core.module.css";

export function MonthCalendar({ date, onDate, onEdit }: { date: string; onDate: (date: string) => void; onEdit: (date: string, target: HTMLElement, block?: ScheduleBlock) => void }) {
  const { snapshot, saveBlock, mode } = useCore();
  const [selected, setSelected] = useState<string[]>([]);
  const [selectionMode, setMode] = useState<SelectionMode>("single");
  const [anchor, setAnchor] = useState<string | null>(null);
  const [status, setStatus] = useState("busy");
  const [start, setStart] = useState("13:00"); const [end, setEnd] = useState("17:00");
  const [pending, setPending] = useState(false); const lock = useRef(false);
  const [feedback, setFeedback] = useState(""); const [error, setError] = useState("");
  const grid = useRef<HTMLDivElement>(null);
  const pendingFocus = useRef<string | null>(null);
  useEffect(() => {
    if (pendingFocus.current) grid.current?.querySelector<HTMLButtonElement>(`[data-date="${pendingFocus.current}"]`)?.focus();
    pendingFocus.current = null;
  }, [date]);
  if (!snapshot) return null;
  const own = snapshot.blocks.filter((block) => block.ownerId === snapshot.profile.id);
  const active = selected.at(-1);
  const blocksOn = (day: string) => own.filter((block) => matchesDate(block, day, snapshot.profile.timezone));
  function choose(day: string) {
    try {
      setSelected(selectDate(selected, day, selectionMode, anchor));
      if (selectionMode === "range") setAnchor(anchor ? null : day);
      setFeedback(""); setError("");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Choose a shorter date range."); }
  }
  async function apply() {
    if (lock.current || !selected.length || !snapshot) return;
    lock.current = true; setPending(true); setFeedback(""); setError("");
    try {
      const result = await applyDatedBlocks(selected, { title: status === "personal" ? "Personal Time" : "Unavailable", kind: "busy", start, end: end === "00:00" ? "24:00" : end, timing: { type: "date", date } }, snapshot.profile.timezone, saveBlock);
      setSelected(result.remaining); setAnchor(null);
      setFeedback(`${result.confirmed.length} of ${selected.length} dates ${mode === "persistent" ? "saved to your account" : "updated in preview"}.`);
      if (result.error) setError(`${result.error} ${result.remaining.length} dates remain selected. Retry the same times or reload to confirm before changing the block.`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Check the selected times."); }
    finally { lock.current = false; setPending(false); }
  }
  return <div className={styles.monthSurface}>
    <fieldset disabled={pending} className={styles.selectionToolbar}>
      <Field label="Select dates"><select className={styles.input} value={selectionMode} onChange={(event) => { setMode(event.target.value as SelectionMode); setAnchor(null); setSelected([]); }}><option value="single">One date</option><option value="range">Date range</option><option value="multiple">Multiple dates</option></select></Field>
      <p>{selectionMode === "range" ? anchor ? "Choose the last date in your range." : "Choose the first date, then the last date." : selectionMode === "multiple" ? "Tap dates to add or remove them." : "Choose a date to see its time blocks."}</p>
      <Button variant="ghost" disabled={!selected.length} onClick={() => { setSelected([]); setAnchor(null); }}>Clear selection</Button>
    </fieldset>
    <div className={styles.monthWeekdays} aria-hidden="true">{["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => <span key={day}>{day}</span>)}</div>
    <div ref={grid} key={date.slice(0, 7)} className={`${styles.scheduleMonthGrid} motion-week`} role="group" aria-label="Monthly schedule. Arrow keys move between dates; Enter selects a date.">
      {monthDates(date).map((day) => {
        const blocks = blocksOn(day);
        const kinds = [...new Set(blocks.map((block) => block.kind === "busy" && block.title.toLowerCase() === "personal time" ? "personal" : block.kind))];
        return <button type="button" key={day} data-date={day} disabled={pending} className={styles.monthCell} data-outside={day.slice(0, 7) !== date.slice(0, 7)} data-selected={selected.includes(day)} data-range={selectionMode === "range" && selected.includes(day)} aria-pressed={selected.includes(day)} aria-current={day === snapshot.today ? "date" : undefined} aria-label={`${formatDate(day, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}: ${blocks.length ? `${blocks.length} time blocks, ${kinds.join(", ")}` : "No scheduled time"}`} onClick={() => choose(day)} onKeyDown={(event) => {
          const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[event.key];
          if (!step) return; event.preventDefault(); const next = addDays(day, step);
          const target = grid.current?.querySelector<HTMLButtonElement>(`[data-date="${next}"]`);
          if (target) target.focus(); else { pendingFocus.current = next; onDate(next); }
        }}>
          <span className={styles.monthNumber}>{dateValue(day).day}</span>
          <span className={styles.monthIndicators} aria-hidden="true">{kinds.map((kind) => <span key={kind} data-kind={kind} />)}</span>
          <span className={styles.monthBlockCount} aria-hidden="true">{blocks.length ? `${blocks.length} ${blocks.length === 1 ? "block" : "blocks"}` : ""}</span>
        </button>;
      })}
    </div>
    <div className={styles.monthLegend}><span>Previous availability</span><span data-kind="busy">Busy</span><span data-kind="personal">Personal Time</span><p>Only Busy and Personal Time affect availability. Previous Available markers are preserved but ignored.</p></div>
    <div className={styles.bulkPanel}>
      <p role="status" aria-live="polite">{selected.length ? `${selected.length} ${selected.length === 1 ? "date" : "dates"} selected: ${selected.join(", ")}` : "Select dates to add time."}</p>
      <form onSubmit={(event) => { event.preventDefault(); void apply(); }}>
        <fieldset disabled={pending || !selected.length} className={styles.bulkFields}>
          <Field label="Status"><select className={styles.input} value={status} onChange={(event) => setStatus(event.target.value)}><option value="busy">Busy</option><option value="personal">Personal Time</option></select></Field>
          <Field label="Start time"><input className={styles.input} type="time" required value={start} onChange={(event) => setStart(event.target.value)} /></Field>
          <Field label="End time"><input className={styles.input} type="time" required value={end} onChange={(event) => setEnd(event.target.value)} /></Field>
          <Button type="submit" aria-busy={pending}>{pending ? "Saving dates…" : "Apply to selected dates"}</Button>
        </fieldset>
      </form>
      <p className="text-xs text-muted-foreground">Adds the same time block to each date. Weekly routines remain unchanged; Busy takes priority. End time 00:00 means midnight at the end of each day.</p>
      {feedback && <p role="status" className="motion-feedback">{feedback}</p>}{error && <p role="alert" className={styles.error}>{error}</p>}
      {active && <section className={styles.monthAgenda} aria-label="Selected date schedule"><h3>{formatDate(active, { day: "numeric", month: "long", year: "numeric" })}</h3><Button disabled={pending} variant="outline" onClick={(event) => onEdit(active, event.currentTarget)}>Open date editor</Button>{blocksOn(active).map((block) => <Button disabled={pending} variant="ghost" key={block.id} onClick={(event) => onEdit(active, event.currentTarget, block)}>{block.start}–{block.end} · {block.title}{block.timing.type === "weekly" ? " · Weekly" : ""}</Button>)}</section>}
    </div>
  </div>;
}
