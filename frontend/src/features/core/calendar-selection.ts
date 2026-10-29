import { dateValue } from "./time";

export type CalendarSelection = { start: string; end: string; anchor: string | null };
export const emptySelection: CalendarSelection = { start: "", end: "", anchor: null };

/** The first activation is a complete single-day query, while retaining an optional range anchor. */
export function chooseCalendarDate(selection: CalendarSelection, date: string): CalendarSelection {
  dateValue(date);
  if (!selection.anchor) return { start: date, end: date, anchor: date };
  if (selection.anchor === date) return { start: date, end: date, anchor: date };
  const [start, end] = [selection.anchor, date].sort();
  return { start: start!, end: end!, anchor: null };
}

export function editCalendarDate(selection: CalendarSelection, value: string, boundary: "start" | "end"): CalendarSelection {
  return boundary === "start"
    ? { start: value, end: !selection.end || selection.start === selection.end ? value : selection.end, anchor: null }
    : { ...selection, end: value, anchor: null };
}

export function selectionSummary(selection: CalendarSelection) {
  if (!selection.start && !selection.end) return { label: "Choose a day or a date range.", count: "No dates selected", days: 0 };
  try {
    const start = dateValue(selection.start); const end = dateValue(selection.end);
    const days = start.until(end).days + 1;
    if (days < 1) throw new Error();
    const options: Intl.DateTimeFormatOptions = { month: "long", day: "numeric", year: "numeric" };
    return { label: `${start.toLocaleString("en-US", options)}${days > 1 ? ` – ${end.toLocaleString("en-US", options)}` : ""}`, count: `${days} ${days === 1 ? "day" : "days"} selected`, days };
  } catch { return { label: "Check your selected dates", count: "Choose valid dates to continue", days: 0 }; }
}
