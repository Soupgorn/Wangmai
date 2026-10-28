import Link from "next/link";
import { cn } from "@/lib/utils";

export function Brand({ compact = false, className }: { compact?: boolean; className?: string }) {
  return (
    <Link href="/" aria-label="Wangmai home" className={cn("inline-flex w-fit shrink-0 items-center gap-2.5 rounded-sm", className)}>
      <span aria-hidden="true" className={cn("grid -rotate-6 place-items-center bg-primary text-primary-foreground", compact ? "size-[25px] rounded-lg text-[19px]" : "size-[31px] rounded-[10px] text-2xl")}>
        <span className="-mt-0.5 font-extrabold tracking-[-3px]">w</span>
      </span>
      <span aria-hidden="true" className={cn("font-extrabold tracking-[-0.9px]", compact ? "text-[13px]" : "text-lg leading-[1.05]")}>
        wangmai
        {!compact && <span lang="th" className="mt-1 block text-[10px] leading-normal font-normal tracking-normal text-muted-foreground">ว่างมั้ย?</span>}
      </span>
    </Link>
  );
}
