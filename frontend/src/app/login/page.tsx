import type { Metadata } from "next";
import Link from "next/link";
import { CalendarHeart, ShieldCheck } from "lucide-react";
import { AvailabilityPreview } from "@/components/marketing/availability-preview";
import { Brand } from "@/components/shared/brand";
import { PolicyLinks } from "@/components/shared/policy-links";
import { Button } from "@/components/ui/button";
import styles from "@/components/marketing/public-pages.module.css";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { LoginActions } from "@/features/auth/login-actions";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  // Keep login and the public preview usable during a backend outage.
  const user = await getCurrentUser().catch(() => null);
  if (user) redirect("/schedule");
  const { error } = await searchParams;
  return (
    <main id="main-content" className={styles.login}>
      <div className={styles.mobileBrand}><Brand /></div>
      <aside className={styles.loginIntro} aria-labelledby="login-introduction">
        <Brand />
        <div className={styles.loginStory}>
          <h2 id="login-introduction">Good plans start<br />with free time.</h2>
          <p>See who’s free and find a little room<br />for the people you like.</p>
          <AvailabilityPreview compact />
        </div>
        <p className={styles.introCaption}><span lang="th">ว่างมั้ย?</span> &nbsp; Make a little time together.</p>
      </aside>
      <section className={styles.loginContent} aria-labelledby="login-title">
        <div className={styles.loginForm}>
          <div className={styles.loginIcon}><CalendarHeart aria-hidden="true" /></div>
          <h1 id="login-title">Welcome to Wangmai.</h1>
          <p className={styles.loginDescription}>Your people. A little free time.<br />Let’s find a moment that works.</p>
          <LoginActions callbackError={Boolean(error)} />
          <Button asChild variant="outline" className="mt-4 w-full"><Link href="/preview/schedule">Explore the interactive preview</Link></Button>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">Fictional data. No sign-in or server saves.</p>
          <div className={styles.loginLegal}>By continuing, you agree to our<br /><PolicyLinks /></div>
          <p className={styles.loginPrivacy}><ShieldCheck aria-hidden="true" /><span>Your schedule stays private until<br />you choose to share your availability.</span></p>
        </div>
      </section>
    </main>
  );
}
