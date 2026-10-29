import Link from "next/link";
import { Brand } from "./brand";
import { Button } from "@/components/ui/button";

export function PageRecovery({ message, reset }: { message: string; reset: () => void }) {
  return <main id="main-content" className="mx-auto flex min-h-svh max-w-lg flex-col justify-center gap-7 p-6 sm:p-10">
    <Brand />
    <div className="space-y-3"><h1 className="text-3xl font-semibold tracking-tight">Let’s try that again.</h1><p role="alert" className="text-sm leading-relaxed text-muted-foreground">{message}</p></div>
    <div className="flex flex-wrap gap-3"><Button onClick={reset}>Try again</Button><Button asChild variant="outline"><Link href="/login">Back to sign in</Link></Button></div>
  </main>;
}
