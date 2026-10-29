import Link from "next/link";
import { cn } from "@/lib/utils";

export function Brand({ compact = false, className }: { compact?: boolean; className?: string }) {
  return (
    <Link href="/" aria-label="Wangmai home" className={cn("inline-flex w-fit shrink-0 items-center gap-2.5 rounded-sm", className)}>
      <span aria-hidden="true" className="grid size-[31px] shrink-0 place-items-center rounded-[10px] bg-primary text-2xl text-primary-foreground">
        <span className="-translate-y-[0.125em] font-extrabold leading-none tracking-normal">w</span>
      </span>
      <span aria-hidden="true" className={cn("font-extrabold tracking-[-0.9px]", compact ? "text-[13px]" : "text-lg leading-[1.05]")}>
        wangmai
        {!compact && <span lang="th" className="mt-1 block text-[10px] leading-normal font-normal tracking-normal text-muted-foreground">ว่างมั้ย?</span>}
      </span>
    </Link>
  );
}
