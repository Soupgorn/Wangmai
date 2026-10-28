import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type SectionHeadingProps = { title: ReactNode; description?: ReactNode; as?: "h1" | "h2" | "h3"; id?: string; className?: string };
export function SectionHeading({ title, description, as: Heading = "h2", id, className }: SectionHeadingProps) {
  return (
    <div className={cn("space-y-2", className)}>
      <Heading id={id} className="text-[13px] leading-snug font-semibold tracking-[-0.15px]">{title}</Heading>
      {description && <p className="max-w-[65ch] text-[11px] leading-[1.8] text-muted-foreground">{description}</p>}
    </div>
  );
}
