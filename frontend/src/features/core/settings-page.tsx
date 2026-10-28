"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { LogOut, ShieldCheck } from "lucide-react";
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
    <div className={styles.heading}><div><h1>Your space, your way.</h1><p>The little details that make Wangmai yours.</p></div></div>
    <div className={styles.settings}>
      <Card className={styles.settingsCard}><form onSubmit={save}>
        <section className={styles.settingsSection} aria-labelledby="profile-heading">
          <h2 id="profile-heading">Your profile</h2>
          <div className={styles.profile}><UserAvatar name={account?.name ?? profile.displayName} decorative className="!size-14 !text-base" /><div><strong>{account?.name ?? profile.displayName}</strong><p>{account ? account.email : "Preview profile. No Google account connected."}</p></div></div>
          {account && <p className="mb-4 text-xs text-muted-foreground">Google profile connected. The settings below affect the fictional preview only.</p>}
          <div className={styles.twoColumns}>
            <Field label="Display name"><input className={styles.input} autoComplete="off" value={displayName} required maxLength={60} onChange={(event) => { setDisplayName(event.target.value); setSaved(false); }} /></Field>
            <Field label="Example email"><input className={styles.input} type="email" value={profile.email} readOnly aria-describedby="email-note" /></Field>
          </div>
          <p id="email-note" className="text-[11px] text-muted-foreground">This fictional email is part of the preview, not a signed-in account.</p>
        </section>
        <section className={styles.settingsSection} aria-labelledby="privacy-heading">
          <h2 id="privacy-heading">Availability & privacy</h2>
          <div className={styles.switchRow}><div><strong id="sharing-label">Share my availability</strong><p id="sharing-description">Let people see when you’re free. Turning this off makes your shared status unknown.</p></div><button type="button" className={styles.switch} role="switch" aria-labelledby="sharing-label" aria-describedby="sharing-description" aria-checked={shareAvailability} onClick={() => { setShareAvailability(!shareAvailability); setSaved(false); }}><span /></button></div>
          <p className="text-xs leading-relaxed text-muted-foreground">Block titles and personal plans are always private.</p>
        </section>
        <section className={styles.settingsSection} aria-labelledby="timezone-heading">
          <h2 id="timezone-heading">Time & region</h2>
          <Field label="Timezone"><select className={styles.input} value={timezone} onChange={(event) => { setTimezone(event.target.value); setSaved(false); }}>{TIMEZONES.map((zone) => <option key={zone} value={zone}>{zone.replaceAll("_", " ")}</option>)}</select></Field>
          <p className="text-[11px] leading-relaxed text-muted-foreground">Your calendar and time selections use this timezone. Block times stay at their local wall-clock times when you change it.</p>
        </section>
        {error && <p role="alert" className={`${styles.error} px-6 pt-4`}>{error}</p>}
        <div className={styles.settingsFooter}><span role="status" className={styles.saved}>{saved && !dirty ? "Updated in this preview only." : dirty ? "Unsaved preview changes" : ""}</span><Button type="submit" disabled={pending || !dirty}>{pending ? "Updating preview…" : "Save changes"}</Button></div>
      </form></Card>
      <aside>
        <div className={`${styles.privacy} !mt-1`}><ShieldCheck aria-hidden="true" /><strong>Privacy comes first.</strong><p>You choose what to share. We only show when you’re available, never the details of your day.</p></div>
        <div className="mt-7 border-t pt-5">{account ? <LogoutButton /> : <Button asChild variant="ghost" className="-ml-3"><Link href="/login"><LogOut aria-hidden="true" />Log out of preview</Link></Button>}<p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">{account ? "Ends your session and clears temporary preview changes." : "Leaves this preview and clears its temporary changes. No real session exists."}</p></div>
      </aside>
    </div>
  </>;
}
