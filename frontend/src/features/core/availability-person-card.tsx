"use client";

import { Check, CalendarDays } from "lucide-react";
import Image from "next/image";
import { UserAvatar } from "@/components/shared/user-avatar";
import { StatusTag } from "./core-ui";
import { formatDate } from "./time";
import type { PersonAvailability } from "./availability-summary";
import type { AvailabilityResult } from "./types";
import styles from "./finder.module.css";

export function AvailabilityPersonCard({ summary, result, range, onDate }: {
  summary: PersonAvailability; result?: AvailabilityResult | undefined; range: boolean; onDate: (date: string) => void;
}) {
  const { person, availableDates, totalDays } = summary;
  const state = result?.state ?? "available";
  return <article className={styles.personCard} data-result-key={person.id} data-testid={`person-${person.id}`} data-state={state} aria-label={range ? `${person.displayName}, available ${availableDates.length} of ${totalDays} days` : `${person.displayName}, ${state === "busy" ? "Unavailable" : state}`}>
    <div className={styles.personHeader}>
      <span className={styles.resultAvatar}><UserAvatar name={person.displayName} decorative tone={person.id === "chris" ? "forest" : person.id === "mint" || person.id === "beam" ? "neutral" : "sage"} className="!size-11 !text-sm" />{person.image && <Image key={person.image} src={person.image} alt="" width={44} height={44} unoptimized referrerPolicy="no-referrer" onError={(event) => { event.currentTarget.style.display = "none"; }} />}</span>
      <div className={styles.personName}><h3>{person.displayName}</h3><p>{range ? <>Available <strong>{availableDates.length} of {totalDays}</strong> days</> : result?.explanation}</p></div>
      {range ? <span className={styles.matchTag}><Check aria-hidden="true" />{availableDates.length === totalDays ? "Every day" : "Some days"}</span> : <StatusTag state={state} />}
    </div>
    {range && <>
      <div className={styles.personDates} aria-label={`Available dates for ${person.displayName}`}><CalendarDays aria-hidden="true" /><div>{availableDates.map((date) => <button key={date} type="button" onClick={() => onDate(date)} aria-label={`See everyone on ${formatDate(date, { day: "numeric", month: "long", year: "numeric" })}`}><time dateTime={date}>{formatDate(date, { day: "numeric", month: "short" })}</time></button>)}</div></div>
      <div className={styles.dayMarkers} role="img" aria-label={summary.days.map((day) => `${formatDate(day.date, { day: "numeric", month: "short" })}: ${day.state === "busy" ? "Unavailable" : day.state}`).join("; ")}>
        {summary.days.map((day) => <span key={day.date} data-state={day.state} aria-hidden="true" title={`${day.date}: ${day.state}`} />)}
      </div>
    </>}
  </article>;
}
