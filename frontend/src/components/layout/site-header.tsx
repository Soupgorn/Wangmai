import Link from "next/link";
import { Brand } from "@/components/shared/brand";
import { Button } from "@/components/ui/button";

export function SiteHeader() {
  return (
    <header className="flex items-center justify-between gap-4 border-b py-[27px] max-sm:py-[22px]">
      <Brand className="max-[430px]:gap-2" />
      <nav aria-label="Main navigation" className="flex items-center gap-[27px] text-[11px] text-muted-foreground max-sm:gap-3.5">
        <Link href="/#why-wangmai" className="rounded-xs hover:text-foreground max-[740px]:hidden">Why Wangmai?</Link>
        <Link href="/login" className="rounded-xs hover:text-foreground max-[430px]:hidden">Sign in</Link>
        <Button asChild className="max-[430px]:min-h-10 max-[430px]:px-3 max-[430px]:text-[10px]"><Link href="/login">Find your free time</Link></Button>
      </nav>
    </header>
  );
}
