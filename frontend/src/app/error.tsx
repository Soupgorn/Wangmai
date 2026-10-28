"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return <main className="p-8"><p role="alert">This page is temporarily unavailable. Please try again.</p><Button onClick={reset}>Try again</Button><Link className="ml-4 underline" href="/login">Back to sign in</Link></main>;
}
