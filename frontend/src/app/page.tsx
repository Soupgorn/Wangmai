import Link from "next/link";
import { CalendarPlus, LockKeyhole, Plus, UsersRound } from "lucide-react";
import { PageContainer } from "@/components/layout/page-container";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { AvailabilityPreview } from "@/components/marketing/availability-preview";
import { SectionHeading } from "@/components/shared/section-heading";
import { Button } from "@/components/ui/button";
import styles from "@/components/marketing/public-pages.module.css";
import { ScrollReveal } from "@/components/shared/scroll-reveal";

const features = [
  { icon: CalendarPlus, title: "Make a little space.", description: "Add your free time to a simple weekly calendar. A few clicks and you’re done." },
  { icon: UsersRound, title: "Find your people.", description: "Pick a moment. See who’s free, without the group chat back-and-forth." },
  { icon: LockKeyhole, title: "Keep your plans yours.", description: "Share when you’re available. The details of your day stay private." },
] as const;

export default function Home() {
  return (
    <PageContainer className={styles.landing}>
      <SiteHeader />
      <main id="main-content">
        <section className={styles.hero} aria-labelledby="landing-title">
          <div>
            <h1 id="landing-title" className={`${styles.heroTitle} motion-hero-title`}><span>Less planning.</span>{" "}<span>More good times.</span></h1>
            <p className={`${styles.heroDescription} motion-hero-description`}>Coffee after class? A long-overdue catch-up?<br />See who’s free and make a little time together.</p>
            <div className={`${styles.heroActions} motion-hero-actions`}>
              <Button asChild size="lg"><Link href="/login">Let’s make time <Plus aria-hidden="true" /></Link></Button>
              <small>Free to get together.</small>
            </div>
          </div>
          <AvailabilityPreview />
        </section>
        <ScrollReveal id="why-wangmai" className={styles.features} label="Why Wangmai?">
          {features.map(({ icon: Icon, title, description }) => (
            <div key={title} className={styles.feature}><Icon aria-hidden="true" /><SectionHeading title={title} description={description} /></div>
          ))}
        </ScrollReveal>
      </main>
      <SiteFooter />
    </PageContainer>
  );
}
