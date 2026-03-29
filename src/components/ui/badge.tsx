import type { HTMLAttributes } from "react";
import { tv, type VariantProps } from "tailwind-variants";

import { cn } from "@/lib/cn";

export const badgeVariants = tv({
  base: "inline-flex items-center rounded-full px-3 py-1 font-mono text-[11px] font-bold uppercase tracking-[0.18em]",
  variants: {
    variant: {
      accent: "bg-orange-100 text-orange-700",
      success: "bg-emerald-100 text-emerald-700",
      neutral: "bg-stone-200 text-stone-700",
      dark: "bg-stone-900 text-orange-100",
      outline: "border border-stone-300 bg-white text-stone-700",
    },
  },
  defaultVariants: {
    variant: "accent",
  },
});

export type BadgeProps = HTMLAttributes<HTMLSpanElement> &
  VariantProps<typeof badgeVariants>;

export function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}
