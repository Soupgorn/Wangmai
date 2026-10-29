"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { CalendarDays, Check, ChevronLeft, ChevronRight, Clock3, Globe2, LockKeyhole, UsersRound } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useCore } from "./core-provider";
import { Field, StatusTag } from "./core-ui";
import { evaluateRange, type RangeResults } from "./date-range";
import { matchingPeople, summarizePeople } from "./availability-summary";
import { AvailabilityRangePicker } from "./availability-range-picker";
import { AvailabilityPersonCard } from "./availability-person-card";
import { FinderSegment } from "./finder-segment";
import { useFinderMotion } from "./finder-motion";
import { type CalendarSelection } from "./calendar-selection";
import { formatDate, TIMEZONES } from "./time";
import type { AvailabilityState, CoreSnapshot } from "./types";
import core from "./core.module.css";
import styles from "./finder.module.css";

export function AvailabilityPage() {
  const { snapshot, mode } = useCore();
  if (mode === "persistent") return <>
    <div className={core.heading}><div><h1>Who’s free?</h1><p>Real-user availability is not connected yet.</p></div></div>
    <Card className={styles.unavailable}><LockKeyhole aria-hidden="true" /><h2>Your schedule stays private.</h2><p>Multi-user search will be available when the Phase 5 availability service is connected. Explore the experience with fictional people in the separate preview.</p><Link className={styles.previewLink} href="/preview/availability">Explore date range search with preview people</Link></Card>
  </>;
  return snapshot ? <AvailabilityView snapshot={snapshot} /> : null;
}

function AvailabilityView({ snapshot }: { snapshot: CoreSnapshot }) {
  const [selection, setSelection] = useState<CalendarSelection>({ start: snapshot.today, end: snapshot.today, anchor: null });
  const { start: date, end: endDate } = selection;
  const [timezone, setTimezone] = useState(snapshot.profile.timezone);
  const [matching, setMatching] = useState<"any" | "every">("any");
  const [view, setView] = useState<"person" | "date">("person");
  const [activeDate, setActiveDate] = useState(snapshot.today);
  const [start, setStart] = useState("13:00");
  const [end, setEnd] = useState("15:00");
  const [filter, setFilter] = useState<AvailabilityState | "all">("all");
  const resultsRef = useRef<HTMLDivElement>(null);
  const noDates = !date && !endDate;
  const rangeMode = Boolean(date && endDate && date !== endDate);
  // Pure evaluation commits current filters immediately: no delayed mock requests or stale responses.
  const { range, error } = useMemo(() => {
    if (noDates) return { range: { days: [], everyDay: [] } as RangeResults, error: "" };
    try { return { range: evaluateRange(snapshot, { startDate: date, endDate, start, end, timezone }), error: "" }; }
    catch (reason) { return { range: { days: [], everyDay: [] } as RangeResults, error: reason instanceof Error ? reason.message : "Choose a valid date and time." }; }
  }, [date, endDate, end, noDates, snapshot, start, timezone]);
  const summaries = useMemo(() => summarizePeople(range, snapshot.profile.id), [range, snapshot.profile.id]);
  const matches = matchingPeople(summaries, matching);
  const day = range.days.find((day) => day.date === activeDate) ?? range.days[0];
  const dayIndex = range.days.indexOf(day!);
  const people = day?.results.filter((result) => result.person.id !== snapshot.profile.id) ?? [];
  const counts = { available: people.filter((result) => result.state === "available").length, busy: people.filter((result) => result.state === "busy").length, unknown: people.filter((result) => result.state === "unknown").length };
  const shown = people.filter((result) => filter === "all" || result.state === filter).sort((a, b) => ["available", "busy", "unknown"].indexOf(a.state) - ["available", "busy", "unknown"].indexOf(b.state));
  const personView = rangeMode && view === "person";
  const count = personView ? matches.length : counts.available;
  const self = day?.results.find((result) => result.person.id === snapshot.profile.id);
  const queryKey = `${date}:${endDate}:${start}:${end}:${timezone}:${error}`;
  useFinderMotion(resultsRef, `${queryKey}:${matching}:${view}:${activeDate}:${filter}`, `${queryKey}:${view}:${activeDate}`);
  const availabilityContext = personView ? matching === "every" ? "free every day" : "with time to share" : "free for this time";
  const summaryLabel = noDates ? "A good plan starts with a day." : error ? "Let’s choose a valid time." : `${count} ${count === 1 ? "person" : "people"} ${availabilityContext}`;
  const summaryDate = rangeMode && !personView ? day?.date ?? date : date;

  function exploreDate(value: string) { setActiveDate(value); setView("date"); setFilter("all"); }

  return <>
    <div className={`${core.heading} ${styles.pageHeading}`}><div><h1>Good company is a time away.</h1><p>Find your people. Make a little room for a plan.</p></div><span className={styles.previewBadge}><span />Preview people</span></div>
    <p className={styles.previewNotice}>Preview results · Fictional people and schedules, independent of your account. Real-user search is not connected.</p>
    {!error && !noDates && <a href="#finder-results" className={styles.mobileResultsLink}><UsersRound aria-hidden="true" />View {count} {count === 1 ? "match" : "matches"}</a>}
    <div className={styles.finder}>
      <section className={styles.query} aria-label="Availability filters">
        <div className={styles.queryTitle}><CalendarDays aria-hidden="true" /><h2>When works for you?</h2></div>
        <AvailabilityRangePicker selection={selection} today={snapshot.today} onChange={setSelection} invalid={!!error} describedBy={error ? "query-error picker-help" : "picker-help"} />
        {error && <p id="query-error" role="alert" className={core.error}>{error}</p>}
        <div className={styles.timeSection}><h3><Clock3 aria-hidden="true" />{rangeMode ? "Same time, each day" : "A little time together"}</h3><div className={styles.timeInputs}>
          <Field label="From"><input type="time" className={core.input} step={60} required value={start} onChange={(event) => setStart(event.target.value)} aria-invalid={!!error} aria-describedby={error ? "query-error" : "time-help"} /></Field>
          <Field label="Until"><input type="time" className={core.input} step={60} required value={end} onChange={(event) => setEnd(event.target.value)} aria-invalid={!!error} aria-describedby={error ? "query-error" : "time-help"} /></Field>
        </div><p id="time-help">{rangeMode ? "The whole interval, on each selected date." : "Availability must cover the whole interval."} Overnight plans need two separate searches.</p></div>
        <Field label="Timezone"><select className={core.input} value={timezone} onChange={(event) => setTimezone(event.target.value)} aria-invalid={!!error} aria-describedby={error ? "query-error" : undefined}>{[...new Set([snapshot.profile.timezone, ...TIMEZONES])].map((zone) => <option key={zone} value={zone}>{zone === "UTC" ? "UTC (Coordinated Universal Time)" : zone}</option>)}</select></Field>
        {self && !rangeMode && <div className={styles.selfStatus}><span>Your shared status</span><StatusTag state={self.state} /></div>}
      </section>
      <section id="finder-results" className={styles.results} aria-label="Availability results" tabIndex={-1}>
        <div className={styles.resultHeading}>
          {!noDates && !error ? <div className={styles.resultSummary} role="status" aria-label="Availability summary" aria-live="polite" aria-atomic="true">
            <dl className={styles.summaryMetrics}>
              <div className={styles.summaryMetric}>
                <dt className={styles.summaryLabel}><span className={styles.summaryIcon}><UsersRound aria-hidden="true" /></span>{personView ? matching === "every" ? "People free every day" : "People free any day" : "People free"}</dt>
                <dd className={styles.summaryValue}><h2 data-testid="available-count"><span key={`${count}:${matching}:${view}:${activeDate}`} className={styles.countChange}>{count}<span className="sr-only"> {count === 1 ? "person" : "people"} {availabilityContext}</span></span></h2></dd>
              </div>
              <div className={styles.summaryMetric}>
                <dt className={styles.summaryLabel}><span className={styles.summaryIcon}><CalendarDays aria-hidden="true" /></span>{personView ? "Dates" : "Date"}</dt>
                <dd className={`${styles.summaryValue} ${styles.summaryDateValue}`}><time dateTime={summaryDate}>{formatDate(summaryDate, { weekday: "short", day: "numeric", month: "short", year: "numeric" })}</time>{personView && <span>– <time dateTime={endDate}>{formatDate(endDate, { weekday: "short", day: "numeric", month: "short", year: "numeric" })}</time></span>}</dd>
              </div>
              <div className={styles.summaryMetric}>
                <dt className={styles.summaryLabel}><span className={styles.summaryIcon}><Clock3 aria-hidden="true" /></span>Time{personView && " each day"}</dt>
                <dd className={`${styles.summaryValue} ${styles.summaryTimeValue}`}>{start} – {end}</dd>
              </div>
            </dl>
          </div> : <div className={styles.resultMessage} role="status" aria-live="polite" aria-atomic="true"><h2 data-testid="available-count">{summaryLabel}</h2><p>{noDates ? "Choose a day or a date range in the calendar." : "Check your dates and times to continue."}</p></div>}
          {rangeMode && <FinderSegment label="Result presentation" value={view} options={[{ value: "person", label: "By Person" }, { value: "date", label: "By Date" }]} onChange={setView} />}
        </div>
        {rangeMode && !error && (personView ? <div className={styles.matchControls}>
          <FinderSegment label="Availability match" value={matching} options={[{ value: "any", label: "Available on Any Day" }, { value: "every", label: "Available on Every Day" }]} onChange={setMatching} />
          <p>{matching === "any" ? "At least one confirmed date. See exactly which days below." : "Confirmed for the whole interval on every selected date."}</p>
        </div> : <div className={styles.dateExplorer}>
          <div className={styles.dateNavigation}><Button variant="ghost" size="icon" aria-label="Previous results date" disabled={dayIndex <= 0} onClick={() => setActiveDate(range.days[dayIndex - 1]!.date)}><ChevronLeft aria-hidden="true" /></Button>
            <Field label="Results for date"><select className={core.input} value={day?.date ?? date} onChange={(event) => setActiveDate(event.target.value)}>{range.days.map((day) => <option key={day.date} value={day.date}>{formatDate(day.date, { weekday: "short", day: "numeric", month: "long", year: "numeric" })}</option>)}</select></Field>
            <Button variant="ghost" size="icon" aria-label="Next results date" disabled={dayIndex >= range.days.length - 1} onClick={() => setActiveDate(range.days[dayIndex + 1]!.date)}><ChevronRight aria-hidden="true" /></Button>
          </div><p role="status">Day {dayIndex + 1} of {range.days.length}. Each date is evaluated independently.</p>
        </div>)}
        {!personView && !error && !noDates && <div className={core.filterTabs} role="group" aria-label="Filter availability states">
          {(["all", "available", "busy", "unknown"] as const).map((state) => <button type="button" key={state} aria-pressed={filter === state} onClick={() => setFilter(state)}>{state === "all" ? "Everyone" : state === "available" ? "Available" : state === "busy" ? "Unavailable" : "Unknown"} <span>({state === "all" ? people.length : counts[state]})</span></button>)}
        </div>}
        <div ref={resultsRef} className={styles.resultList}>
          {noDates ? <div className={styles.empty} data-result-key="no-dates"><CalendarDays aria-hidden="true" /><h3>Find a day to get together.</h3><p>Select one date to see who’s free that day, or choose a second date to explore a range.</p></div>
            : error ? <div className={`${styles.empty} ${styles.error}`}><CalendarDays aria-hidden="true" /><h3>Adjust your dates or times</h3><p>{error}</p><p>Choose up to 31 calendar days. Times apply separately on each date.</p></div>
            : personView ? <>
              {matches.map((summary) => <AvailabilityPersonCard key={summary.person.id} summary={summary} range onDate={exploreDate} />)}
              {matches.length === 0 && <EmptyResults every={matching === "every"} />}
            </> : <>
              {shown.map((result) => <AvailabilityPersonCard key={result.person.id} summary={summaries.find((summary) => summary.person.id === result.person.id)!} result={result} range={false} onDate={exploreDate} />)}
              {shown.length === 0 && <EmptyResults every={false} filtered={filter !== "available"} />}
            </>}
        </div>
        {!error && !noDates && <div className={styles.resultFootnote}><Check aria-hidden="true" /><p>{personView ? `${range.days.length} ${range.days.length === 1 ? "date" : "dates"} checked. ` : ""}Only shared, confirmed time counts as available. Unknown never counts.</p></div>}
        <p className={styles.timezoneNote}><Globe2 aria-hidden="true" /><span>{timezone}</span> · All dates and times use this timezone.</p>
      </section>
    </div>
  </>;
}

function EmptyResults({ every, filtered = false }: { every: boolean; filtered?: boolean }) {
  return <div className={styles.empty} data-result-key="empty"><UsersRound aria-hidden="true" /><h3>{every ? "No one is free every day." : filtered ? "No people with this status." : "A little change might make room."}</h3><p>{every ? "Try Any Day to find people with time on some dates, or choose a shorter range." : filtered ? "Try another status or adjust your dates and times." : "No one has shared availability for this whole time. Try another date or a shorter time range."}</p></div>;
}
