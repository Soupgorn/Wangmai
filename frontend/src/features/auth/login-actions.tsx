"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { BusyIndicator } from "@/components/shared/busy-indicator";
import styles from "@/components/marketing/public-pages.module.css";

export function LoginActions({ callbackError }: { callbackError: boolean }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(callbackError ? "Google sign-in didn’t finish. Please try again." : "");
  const { data: session, isPending, error: sessionError } = authClient.useSession();
  const router = useRouter();
  useEffect(() => { if (session) router.replace("/schedule"); }, [session, router]);
  async function signIn() {
    setPending(true); setError("");
    try {
      const result = await authClient.signIn.social({ provider: "google", callbackURL: "/schedule", errorCallbackURL: "/login?error=authentication_failed" });
      if (result.error) {
        setError(result.error.code === "GOOGLE_NOT_CONFIGURED" ? "Google sign-in is not configured yet. Please try again later." : "Google sign-in is unavailable. Please try again.");
        setPending(false);
      }
      else if (!result.data?.url) { setError("Google sign-in couldn’t start. Please try again."); setPending(false); }
    } catch { setError("Couldn’t connect to sign-in. Please try again."); setPending(false); }
  }
  return <>
    <Button size="lg" className={styles.googleButton} aria-busy={pending || isPending} disabled={pending || isPending || Boolean(session)} onClick={() => void signIn()} aria-describedby="google-signin-status">{pending ? <BusyIndicator /> : <span aria-hidden="true" className={styles.googleMark}>G</span>}{pending ? "Connecting to Google…" : "Continue with Google"}</Button>
    <p id="google-signin-status" className={`${styles.signinStatus} ${error || sessionError ? "motion-error" : ""}`} role={error || sessionError ? "alert" : "status"}>{error || (sessionError ? "We couldn’t check your session. You can try signing in again." : isPending ? "" : "Sign in securely with your Google account.")}</p>
  </>;
}
