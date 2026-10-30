"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { CheckCircle2, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BusyIndicator } from "@/components/shared/busy-indicator";
import { Card } from "@/components/ui/card";
import { UserAvatar } from "@/components/shared/user-avatar";
import { useCore } from "./core-provider";
import { Field } from "./core-ui";
import { TIMEZONES } from "./time";
import type { Profile } from "./types";
import styles from "./core.module.css";
import { useAccount } from "@/features/auth/auth-boundary";
import { LogoutButton } from "@/features/auth/logout-button";

export function SettingsPage() {
  const { snapshot } = useCore();
  return snapshot ? <SettingsView profile={snapshot.profile} /> : null;
}

function SettingsView({ profile }: { profile: Profile }) {
  const account = useAccount();
  const { updateProfile, mode, retry } = useCore();
  const persistent = mode === "persistent";
  const [displayName, setDisplayName] = useState(profile.displayName);
  const [timezone, setTimezone] = useState(profile.timezone);
  const [shareAvailability, setShareAvailability] = useState(profile.shareAvailability);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const dirty = displayName !== profile.displayName || timezone !== profile.timezone || shareAvailability !== profile.shareAvailability;
  async function save(event: FormEvent) {
    event.preventDefault(); setPending(true); setError(""); setSaved(false);
    try { await updateProfile({ displayName, timezone, shareAvailability }); setDisplayName(displayName.trim()); setSaved(true); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Could not update the preview. Please try again."); }
    finally { setPending(false); }
  }
  return <>
    <div className={styles.heading}><div><h1>Profile</h1><p>{persistent ? "Your Google profile, sharing preferences, and schedule timezone." : "Try your preferences here. These changes apply to this preview only."}</p></div></div>
    <div className={styles.settings}>
      <Card className={styles.settingsCard}><form onSubmit={save} aria-busy={pending}>
        <section className={styles.settingsSection} aria-label="Profile information">
          <div className={styles.profile}><UserAvatar name={account?.name ?? profile.displayName} decorative className="!size-14 !text-base" /><div><strong>{account?.name ?? profile.displayName}</strong><p>{account ? account.email : "Preview profile. No Google account connected."}</p></div></div>
          <div className={styles.twoColumns}>
            <Field label="Display name"><input className={styles.input} autoComplete="off" value={displayName} readOnly={persistent} required maxLength={60} onChange={(event) => { setDisplayName(event.target.value); setSaved(false); }} /></Field>
            <Field label={persistent ? "Google email" : "Example email"}><input className={styles.input} type="email" value={profile.email} readOnly /></Field>
          </div>
        </section>
        <section className={styles.settingsSection} aria-labelledby="privacy-heading">
          <h2 id="privacy-heading">Availability & privacy</h2>
          <div className={styles.switchRow}><div><strong id="sharing-label">Share my availability</strong><p id="sharing-description">{persistent ? "Off by default. When enabled, time you have not marked unavailable is shown as available. Signed-in people can find your name, Google profile picture, and status. Event titles and your email stay private. Turning this off removes you from new searches after you save." : "Time you have not marked unavailable is shared as available. Turning sharing off keeps your status private."}</p></div><button disabled={pending} type="button" className={styles.switch} role="switch" aria-labelledby="sharing-label" aria-describedby="sharing-description" aria-checked={shareAvailability} onClick={() => { setShareAvailability(!shareAvailability); setSaved(false); }}><span /></button></div>
        </section>
        <section className={styles.settingsSection} aria-labelledby="timezone-heading">
          <h2 id="timezone-heading">Time & region</h2>
          <select aria-label="Timezone" disabled={pending} className={styles.input} value={timezone} onChange={(event) => { setTimezone(event.target.value); setSaved(false); }}>{[...new Set([profile.timezone, ...TIMEZONES])].map((zone) => <option key={zone} value={zone}>{zone.replaceAll("_", " ")}</option>)}</select>
        </section>
        {error && <div role="alert" className="motion-error px-6 pt-4"><p className={styles.error}>{error}</p>{persistent && <Button variant="outline" onClick={retry}>Reload preferences</Button>}</div>}
        <div className={styles.settingsFooter}><span role="status" className={styles.saved}>{saved && !dirty ? <span className="motion-feedback"><CheckCircle2 aria-hidden="true" className="size-4" />{persistent ? "Preferences saved to your account." : "Updated in this preview only."}</span> : dirty ? persistent ? "Unsaved preference changes" : "Unsaved preview changes" : ""}</span><Button type="submit" aria-busy={pending} disabled={pending || !dirty}>{pending && <BusyIndicator />}{pending ? persistent ? "Saving…" : "Updating preview…" : "Save changes"}</Button></div>
      </form></Card>
      <aside className="pt-1">
        {account ? <LogoutButton /> : <Button asChild variant="outline" size="lg" className="cursor-pointer"><Link href="/login"><LogOut aria-hidden="true" />Log out of preview</Link></Button>}
      </aside>
    </div>
  </>;
}
