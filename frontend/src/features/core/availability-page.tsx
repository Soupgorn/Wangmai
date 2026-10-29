"use client";

import { useRef, useState } from "react";
import { Globe2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { UserAvatar } from "@/components/shared/user-avatar";
import { useCore } from "./core-provider";
import { DatePicker, Field, StatusTag } from "./core-ui";
import { findAvailability } from "./availability";
import { formatDate } from "./time";
import type { AvailabilityResult, AvailabilityState, CoreSnapshot } from "./types";
import styles from "./core.module.css";
import { useResultMotion } from "@/lib/motion";

export function AvailabilityPage() {
  const { snapshot } = useCore();
  return snapshot ? <AvailabilityView snapshot={snapshot} /> : null;
}

function AvailabilityView({ snapshot }: { snapshot: CoreSnapshot }) {
  const [date, setDate] = useState(snapshot.today);
  const [start, setStart] = useState("13:00");
  const [end, setEnd] = useState("15:00");
  const [filter, setFilter] = useState<AvailabilityState | "all">("all");
  const resultsRef = useRef<HTMLDivElement>(null);
  useResultMotion(resultsRef, `${date}:${start}:${end}:${filter}`);
  let results: AvailabilityResult[] = [];
  let error = "";
  try { results = findAvailability(snapshot, { date, start, end, timezone: snapshot.profile.timezone }); }
  catch (reason) { error = reason instanceof Error ? reason.message : "Choose a valid date and time."; }
  const self = results.find((result) => result.person.id === snapshot.profile.id);
  const people = results.filter((result) => result.person.id !== snapshot.profile.id);
  const counts = { available: people.filter((result) => result.state === "available").length, busy: people.filter((result) => result.state === "busy").length, unknown: people.filter((result) => result.state === "unknown").length };
  const shown = people.filter((result) => filter === "all" || result.state === filter).sort((a, b) => ["available", "busy", "unknown"].indexOf(a.state) - ["available", "busy", "unknown"].indexOf(b.state));
  return <>
    <div className={styles.heading}><div><h1>Good company is a time away.</h1><p>Choose a moment and see who has room for a plan.</p></div></div>
    <div className={styles.finder}>
      <Card className={styles.queryCard}>
        <div className={styles.queryContent}>
          <h2>Find a moment</h2>
          <DatePicker value={date} onChange={setDate} />
          <div className={`${styles.twoColumns} mt-5`}>
            <Field label="From"><input type="time" className={styles.input} step={60} required value={start} onChange={(event) => setStart(event.target.value)} aria-invalid={!!error} aria-describedby={error ? "query-error" : undefined} /></Field>
            <Field label="Until"><input type="time" className={styles.input} step={60} required value={end} onChange={(event) => setEnd(event.target.value)} aria-invalid={!!error} aria-describedby={error ? "query-error" : undefined} /></Field>
          </div>
          <p className="!mt-4 flex items-center gap-2 !text-xs"><Globe2 aria-hidden="true" className="size-3.5" />{snapshot.profile.timezone}</p>
          {self && <div className="mt-5 flex flex-wrap items-center gap-2 border-t pt-4 text-xs text-muted-foreground"><span>Your shared status</span><StatusTag state={self.state} /></div>}
        </div>
      </Card>
      <section aria-label="Availability results">
        <div className={styles.resultsHeading} role="status" aria-live="polite" aria-atomic="true">
          <h2 key={`${date}:${start}:${end}`} className="motion-feedback" data-testid="available-count">{error ? "Let’s choose a valid time." : `${counts.available} ${counts.available === 1 ? "person" : "people"}, a little room for a plan.`}</h2>
          <p>{formatDate(date, { weekday: "long", day: "numeric", month: "long" })} &nbsp; {start || "—"}–{end || "—"}</p>
        </div>
        {error ? <Card><p id="query-error" role="alert" className={`${styles.error} motion-error p-5`}>{error}</p></Card> : <>
          <div className={styles.filterTabs} aria-label="Filter availability states">
            {(["all", "available", "busy", "unknown"] as const).map((state) => <button type="button" key={state} aria-pressed={filter === state} onClick={() => setFilter(state)}>{state === "all" ? "Everyone" : state === "available" ? "Available" : state === "busy" ? "Unavailable" : "Unknown"} <span>({state === "all" ? people.length : counts[state]})</span></button>)}
          </div>
          <div ref={resultsRef} className={styles.people}>
            {shown.map((result) => <Card key={result.person.id} className={styles.person} data-testid={`person-${result.person.id}`} data-state={result.state}>
              <UserAvatar name={result.person.displayName} tone={result.person.id === "chris" ? "forest" : result.person.id === "mint" || result.person.id === "beam" ? "neutral" : "sage"} className="!size-12 !text-sm" decorative />
              <div className={styles.personDetails}><h3>{result.person.displayName}</h3><p>{result.explanation}</p></div>
              <StatusTag state={result.state} />
            </Card>)}
            {shown.length === 0 && <Card className={`${styles.empty} motion-feedback`}><p>{filter === "available" ? "No one has shared availability for this whole time. Try another date or a shorter time range." : "No people have this status for the selected time."}</p></Card>}
          </div>
        </>}
      </section>
    </div>
  </>;
}
