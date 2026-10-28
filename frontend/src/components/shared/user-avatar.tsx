import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const avatarVariants = cva("relative inline-grid shrink-0 place-items-center rounded-full font-bold", {
  variants: {
    tone: { sage: "bg-[var(--availability-background)] text-foreground", neutral: "bg-muted text-foreground", forest: "bg-foreground text-card", mist: "bg-[color-mix(in_srgb,var(--brand-mist)_25%,var(--card))] text-foreground" },
    size: { xs: "size-[31px] text-[9px]", sm: "size-[33px] text-[11px]", md: "size-[37px] text-[11px]" },
  }, defaultVariants: { tone: "sage", size: "sm" },
});
type UserAvatarProps = VariantProps<typeof avatarVariants> & { name: string; initials?: string; available?: boolean; decorative?: boolean; className?: string };
export function UserAvatar({ name, initials, available = false, decorative = false, tone, size, className }: UserAvatarProps) {
  const letters = initials ?? name.trim().split(/\s+/).slice(0, 2).map((part) => part.charAt(0)).join("");
  return (
    <span className={cn(avatarVariants({ tone, size }), className)} {...(decorative ? { "aria-hidden": true as const } : { role: "img", "aria-label": name })}>
      {letters}
      {available && <span className="absolute right-0 bottom-0 size-2.5 rounded-full border-2 border-card bg-primary" />}
    </span>
  );
}
