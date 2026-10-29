import Link from "next/link";
import { Brand } from "@/components/shared/brand";
import { Button } from "@/components/ui/button";

export function SiteHeader() {
  return (
    <header className="flex items-center justify-between gap-4 border-b py-[27px] max-sm:py-[22px]">
      <Brand className="max-[430px]:gap-2" />
      <nav aria-label="Main navigation" className="flex items-center gap-[27px] text-[11px] text-muted-foreground max-sm:gap-3.5">
        <Button asChild><Link href="/login">Sign in</Link></Button>
      </nav>
    </header>
  );
}
