import type { ComponentProps } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-sm text-xs font-semibold whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-60 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  { variants: {
    variant: {
      default: "bg-[var(--button-background)] text-[var(--button-foreground)] hover:bg-[var(--button-hover)] disabled:hover:bg-[var(--button-background)]",
      secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/75 disabled:hover:bg-secondary",
      outline: "border border-input bg-card text-foreground hover:bg-accent disabled:hover:bg-card",
      ghost: "text-foreground hover:bg-accent disabled:hover:bg-transparent",
      link: "text-foreground underline-offset-4 hover:underline disabled:hover:no-underline",
    },
    size: { default: "min-h-10 px-4 py-2.5", sm: "min-h-9 px-3 py-2 text-[11px]", lg: "min-h-11 px-4 py-3", icon: "size-10" },
  }, defaultVariants: { variant: "default", size: "default" } },
);
type ButtonProps = ComponentProps<"button"> & VariantProps<typeof buttonVariants> & { asChild?: boolean };
function Button({ className, variant, size, asChild = false, type = "button", ...props }: ButtonProps) {
  const Component = asChild ? Slot.Root : "button";
  return <Component data-slot="button" className={cn(buttonVariants({ variant, size }), className)} {...(asChild ? {} : { type })} {...props} />;
}
export { Button, buttonVariants };
export type { ButtonProps };
