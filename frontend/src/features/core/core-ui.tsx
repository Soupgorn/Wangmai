"use client";

import { cloneElement, useId, useState, type ReactElement } from "react";
import { Check, ChevronLeft, ChevronRight, Clock3, CircleHelp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { addDays, addMonths, dateValue, formatDate, monthDates, WEEKDAYS } from "./time";
import type { AvailabilityState } from "./types";
import styles from "./core.module.css";
import { blockLabels } from "./block-labels";

export function Field({ label, children, className = "" }: { label: string; children: ReactElement<{ "aria-labelledby"?: string }>; className?: string | undefined }) {
  const labelId = useId();
  return <label className={`${styles.field} ${className}`}><span id={labelId}>{label}</span>{cloneElement(children, { "aria-labelledby": labelId })}</label>;
}

export function StatusTag({ state }: { state: AvailabilityState }) {
  const Icon = state === "available" ? Check : state === "busy" ? Clock3 : CircleHelp;
  return <span className={styles.status} data-state={state}><Icon aria-hidden="true" />{state === "unknown" ? "Unknown" : blockLabels[state]}</span>;
}

export function DatePicker({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [month, setMonth] = useState(value);
  function choose(date: string) { setMonth(date); onChange(date); }
  return <div>
    <div className={styles.monthHeading}>
      <h3 aria-live="polite">{formatDate(month, { month: "long", year: "numeric" })}</h3>
      <div className="flex"><Button variant="ghost" size="icon" aria-label="Previous month" onClick={() => setMonth(addMonths(month, -1))}><ChevronLeft aria-hidden="true" /></Button><Button variant="ghost" size="icon" aria-label="Next month" onClick={() => setMonth(addMonths(month, 1))}><ChevronRight aria-hidden="true" /></Button></div>
    </div>
    <div className={styles.monthGrid} aria-label="Choose a date">
      {WEEKDAYS.map((day) => <span key={day} className={styles.weekday} aria-label={day}>{day.slice(0, 1)}</span>)}
      {monthDates(month).map((date) => <button key={date} type="button" className={styles.dateButton} data-outside={date.slice(0, 7) !== month.slice(0, 7)} aria-label={formatDate(date, { weekday: "long", day: "numeric", month: "long", year: "numeric" })} aria-pressed={date === value} tabIndex={date === value || (value.slice(0, 7) !== month.slice(0, 7) && date === dateValue(month).with({ day: 1 }).toString()) ? 0 : -1} onClick={() => choose(date)} onKeyDown={(event) => {
        const offset = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[event.key];
        if (offset !== undefined) { event.preventDefault(); const parent = event.currentTarget.parentElement; const next = addDays(date, offset); choose(next); requestAnimationFrame(() => { parent?.querySelectorAll<HTMLButtonElement>("button").forEach((button) => { if (button.getAttribute("aria-label") === formatDate(next, { weekday: "long", day: "numeric", month: "long", year: "numeric" })) button.focus(); }); }); }
      }}>{dateValue(date).day}</button>)}
    </div>
    <Field label="Date" className={styles.pickerField}><input className={styles.input} type="date" value={value} onChange={(event) => { if (event.target.value) choose(event.target.value); }} /></Field>
  </div>;
}
