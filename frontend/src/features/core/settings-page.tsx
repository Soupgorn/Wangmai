"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
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
  const { updateProfile } = useCore();
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
    <div className={styles.heading}><div><h1>Profile</h1><p>Try your preferences here. These changes apply to this preview only.</p></div></div>
    <div className={styles.settings}>
      <Card className={styles.settingsCard}><form onSubmit={save} aria-busy={pending}>
        <section className={styles.settingsSection} aria-label="Profile information">
          <div className={styles.profile}><UserAvatar name={account?.name ?? profile.displayName} decorative className="!size-14 !text-base" /><div><strong>{account?.name ?? profile.displayName}</strong><p>{account ? account.email : "Preview profile. No Google account connected."}</p></div></div>
          <div className={styles.twoColumns}>
            <Field label="Display name"><input className={styles.input} autoComplete="off" value={displayName} required maxLength={60} onChange={(event) => { setDisplayName(event.target.value); setSaved(false); }} /></Field>
            <Field label="Example email"><input className={styles.input} type="email" value={profile.email} readOnly /></Field>
          </div>
        </section>
        <section className={styles.settingsSection} aria-labelledby="privacy-heading">
          <h2 id="privacy-heading">Availability & privacy</h2>
          <div className={styles.switchRow}><div><strong id="sharing-label">Share my availability</strong><p id="sharing-description">Let people see when you’re free. Turning this off makes your shared status unknown.</p></div><button type="button" className={styles.switch} role="switch" aria-labelledby="sharing-label" aria-describedby="sharing-description" aria-checked={shareAvailability} onClick={() => { setShareAvailability(!shareAvailability); setSaved(false); }}><span /></button></div>
        </section>
        <section className={styles.settingsSection} aria-labelledby="timezone-heading">
          <h2 id="timezone-heading">Time & region</h2>
          <select aria-label="Timezone" className={styles.input} value={timezone} onChange={(event) => { setTimezone(event.target.value); setSaved(false); }}>{TIMEZONES.map((zone) => <option key={zone} value={zone}>{zone.replaceAll("_", " ")}</option>)}</select>
        </section>
        {error && <p role="alert" className={`${styles.error} px-6 pt-4`}>{error}</p>}
        <div className={styles.settingsFooter}><span role="status" className={styles.saved}>{saved && !dirty ? "Updated in this preview only." : dirty ? "Unsaved preview changes" : ""}</span><Button type="submit" disabled={pending || !dirty}>{pending ? "Updating preview…" : "Save changes"}</Button></div>
      </form></Card>
      <aside className="pt-1">
        {account ? <LogoutButton /> : <Button asChild variant="outline" size="lg" className="cursor-pointer"><Link href="/login"><LogOut aria-hidden="true" />Log out of preview</Link></Button>}
      </aside>
    </div>
  </>;
}
