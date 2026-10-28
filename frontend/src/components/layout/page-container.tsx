import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export function PageContainer({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("mx-auto w-full max-w-site px-[var(--page-gutter)]", className)} {...props} />;
}
