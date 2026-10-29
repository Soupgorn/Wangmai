import Link from "next/link";
import { Brand } from "@/components/shared/brand";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return <main id="main-content" className="mx-auto flex min-h-svh max-w-lg flex-col justify-center gap-7 p-6 sm:p-10">
    <Brand />
    <div className="space-y-3"><h1 className="text-3xl font-semibold tracking-tight">We couldn’t find that page.</h1><p className="text-sm leading-relaxed text-muted-foreground">The link may have changed. Head home or explore the schedule preview.</p></div>
    <div className="flex flex-wrap gap-3"><Button asChild><Link href="/">Back home</Link></Button><Button asChild variant="outline"><Link href="/preview/schedule">Explore the preview</Link></Button></div>
  </main>;
}
