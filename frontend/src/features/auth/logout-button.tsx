"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";

export function LogoutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function logout() {
    setPending(true); setError("");
    try {
      const result = await authClient.signOut();
      if (result.error) throw new Error("Logout failed");
      router.replace("/login");
      router.refresh();
    } catch { setError("Couldn’t sign out. Please try again."); setPending(false); }
  }
  return <><Button variant="outline" size="lg" className="cursor-pointer" disabled={pending} onClick={() => void logout()}><LogOut aria-hidden="true" />{pending ? "Signing out…" : "Log out"}</Button>{error && <p role="alert" className="mt-2 text-xs">{error}</p>}</>;
}
