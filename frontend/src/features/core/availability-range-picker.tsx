"use client";

import { useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field } from "./core-ui";
import { addDays, addMonths, dateValue, formatDate, monthDates, WEEKDAYS } from "./time";
import core from "./core.module.css";
import styles from "./finder.module.css";
import { chooseCalendarDate, editCalendarDate, emptySelection, selectionSummary, type CalendarSelection } from "./calendar-selection";

function validDate(value: string) { try { return dateValue(value).toString(); } catch { return null; } }
const fullDate = (date: string) => formatDate(date, { weekday: "long", day: "numeric", month: "long", year: "numeric" });

export function AvailabilityRangePicker({ selection, today, onChange, invalid, describedBy }: {
  selection: CalendarSelection; today: string;
  onChange: (selection: CalendarSelection) => void; invalid: boolean; describedBy: string;
}) {
  const { start, end, anchor } = selection;
  const [month, setMonth] = useState(validDate(start) ?? today);
  const [hover, setHover] = useState<string | null>(null);
  const [focusDate, setFocusDate] = useState(validDate(start) ?? today);
  const grid = useRef<HTMLDivElement>(null);
  const pendingFocus = useRef<string | null>(null);
  useLayoutEffect(() => {
    if (!pendingFocus.current) return;
    const target = grid.current?.querySelector<HTMLButtonElement>(`[data-picker-date="${pendingFocus.current}"]`);
    if (target) { pendingFocus.current = null; target.focus(); }
  }, [focusDate, month]);
  const dates = monthDates(month);
  const focus = dates.includes(focusDate) ? focusDate : dateValue(month).with({ day: 1 }).toString();
  const previewEnd = anchor && hover ? hover : end;
  const validStart = validDate(start);
  const validEnd = validDate(previewEnd);
  const [low, high] = validStart && validEnd ? [validStart, validEnd].sort() : [null, null];
  const summary = selectionSummary(selection);
  const helper = !start && !end ? "Choose a day or a date range." : anchor
    ? hover && hover !== anchor ? "Choose the last day of your range." : "Choose another day to make it a range, or keep this single day."
    : summary.days > 1 ? "Showing availability across the selected days." : "Choose another day to make it a range, or keep this single day.";

  function choose(date: string) {
    setFocusDate(date); setHover(null);
    onChange(chooseCalendarDate(selection, date));
  }
  function navigate(event: KeyboardEvent<HTMLButtonElement>, date: string) {
    const offset = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[event.key];
    let next: string;
    if (offset !== undefined) next = addDays(date, offset);
    else if (event.key === "Home") next = addDays(date, 1 - dateValue(date).dayOfWeek);
    else if (event.key === "End") next = addDays(date, 7 - dateValue(date).dayOfWeek);
    else if (event.key === "PageUp" || event.key === "PageDown") next = addMonths(date, event.key === "PageUp" ? -1 : 1);
    else return;
    event.preventDefault(); pendingFocus.current = next; setFocusDate(next);
    if (!dates.includes(next)) setMonth(next);
  }
  function typed(value: string, which: "start" | "end") {
    onChange(editCalendarDate(selection, value, which));
    if (validDate(value)) { setMonth(value); setFocusDate(value); }
    setHover(null);
  }

  return <div className={styles.picker}>
    <div className={styles.selectionSummary}>
      <div className={styles.summaryText} role="status" aria-live="polite" aria-atomic="true" data-testid="date-selection-summary"><span key={`${start}:${end}`}><strong>{summary.label}</strong><small>{summary.count}</small></span></div>
      <Button type="button" variant="ghost" size="icon" aria-label="Clear dates" disabled={!start && !end} onClick={() => { onChange(emptySelection); setHover(null); }}><X aria-hidden="true" /></Button>
    </div>
    <div className={styles.calendarHeading}>
      <h3 aria-live="polite">{formatDate(month, { month: "long", year: "numeric" })}</h3>
      <div><Button type="button" variant="ghost" size="icon" aria-label="Previous month" onClick={() => { setMonth(addMonths(dateValue(month).with({ day: 1 }).toString(), -1)); setHover(null); }}><ChevronLeft aria-hidden="true" /></Button><Button type="button" variant="ghost" size="icon" aria-label="Next month" onClick={() => { setMonth(addMonths(dateValue(month).with({ day: 1 }).toString(), 1)); setHover(null); }}><ChevronRight aria-hidden="true" /></Button></div>
    </div>
    <div ref={grid} className={styles.rangeGrid} role="group" aria-label="Choose a day or date range" aria-describedby="picker-help" onPointerLeave={() => setHover(null)}>
      {WEEKDAYS.map((day) => <span key={day} className={styles.weekday} aria-label={day}>{day.slice(0, 2)}</span>)}
      <div key={month.slice(0, 7)} className={styles.calendarDays}>
        {dates.map((date) => {
          const selected = Boolean(low && high && date >= low && date <= high);
          return <button type="button" key={date} data-picker-date={date} data-outside={date.slice(0, 7) !== month.slice(0, 7)} data-in-range={selected} data-edge={selected && (date === low || date === high)} data-start={date === low} data-end={date === high}
            aria-label={fullDate(date)} aria-pressed={Boolean(validStart && validDate(end) && start <= end && date >= start && date <= end)}
            aria-current={date === today ? "date" : undefined} tabIndex={date === focus ? 0 : -1}
            onFocus={() => { setFocusDate(date); if (anchor) setHover(date); }} onKeyDown={(event) => navigate(event, date)} onClick={() => choose(date)} onPointerEnter={(event) => { if (event.pointerType === "mouse" && anchor) setHover(date); }}>
            <span>{dateValue(date).day}</span>
          </button>;
        })}
      </div>
    </div>
    <p id="picker-help" className={styles.pickerHelp} role="status">{helper}</p>
    <details className={styles.directDates}><summary>Edit dates directly</summary><div className={styles.dateInputs}>
      <Field label="Start Date"><input className={core.input} type="date" required value={start} onChange={(event) => typed(event.target.value, "start")} aria-invalid={invalid} aria-describedby={describedBy} /></Field>
      <Field label="End Date"><input className={core.input} type="date" required value={end} onChange={(event) => typed(event.target.value, "end")} aria-invalid={invalid} aria-describedby={describedBy} /></Field>
    </div><p>Up to 31 days, inclusive. Use the same date for one day.</p></details>
  </div>;
}
