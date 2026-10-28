import { CalendarDays, Check, Coffee, Globe2 } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { UserAvatar } from "@/components/shared/user-avatar";
import styles from "./public-pages.module.css";

// An illustration of the product, never an authenticated or live availability result.
const previewPeople = [
  { name: "Jamie Chen", initials: "JC", until: "18:00", tone: "sage" },
  { name: "Mint Tan", initials: "MT", until: "17:00", tone: "neutral" },
  { name: "Chris Park", initials: "CP", until: "17:00", tone: "forest" },
] as const;

export function AvailabilityPreview({ compact = false }: { compact?: boolean }) {
  if (compact) {
    return (
      <figure aria-label="Example: three friends are free on Wednesday, 28 October, from 13:00 to 15:00" className={styles.compactFigure}>
        <Card className={styles.compactPreview}>
          <CardContent className={styles.compactContent}>
            <div className={styles.previewDate}><time dateTime="2026-10-28">Wednesday, 28 October</time><CalendarDays aria-hidden="true" /></div>
            <div className={styles.compactTime}><strong>13:00 – 15:00</strong><span>2 hours, together</span></div>
            <div className={styles.compactMatch}>
              <div className={styles.avatarStack}>{previewPeople.map((person) => <UserAvatar key={person.initials} name={person.name} initials={person.initials} tone={person.tone} size="xs" decorative />)}</div>
              <span><Check aria-hidden="true" />3 friends are free</span>
            </div>
          </CardContent>
          <div className={styles.compactPlan}><Coffee aria-hidden="true" />Coffee after class?</div>
        </Card>
      </figure>
    );
  }

  return (
    <figure className={styles.heroPreview} aria-label="Example Wangmai availability preview, using fictional people">
      <Card className={styles.previewCard}>
        <CardHeader className={styles.previewHeader}>
          <h2 lang="th">ว่างมั้ย?</h2>
          <p>A little window for your people.</p>
          <div className={styles.previewDate}><time dateTime="2026-10-28">Wed, 28 October</time><CalendarDays aria-hidden="true" /></div>
          <div className={styles.previewTime}>13:00 – 15:00</div>
          <div className={styles.previewTimezone}><Globe2 aria-hidden="true" />Bangkok time</div>
        </CardHeader>
        <CardContent className={styles.previewResults}>
          <div className={styles.previewResultHeading}><h3>Look who’s free</h3><span>3</span></div>
          <ul className={styles.previewPeople}>
            {previewPeople.map((person) => (
              <li key={person.initials}>
                <UserAvatar name={person.name} initials={person.initials} tone={person.tone} size="md" available decorative />
                <div><p className={styles.personName}>{person.name}</p><p className={styles.personStatus}>Free until {person.until}</p></div>
                <span className={styles.availableMark}><Check aria-hidden="true" /><span className="sr-only">Available</span></span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
      <figcaption className={styles.previewCaption}>Same free time. A new plan waiting to happen.</figcaption>
    </figure>
  );
}
