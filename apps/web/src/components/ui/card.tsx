import type { HTMLAttributes } from "react";
import { tv, type VariantProps } from "tailwind-variants";

import { cn } from "@/lib/cn";

export const cardVariants = tv({
  base: "rounded-[20px] border shadow-[0_18px_50px_-30px_rgba(28,25,23,0.18)]",
  variants: {
    variant: {
      default: "border-stone-200 bg-white",
      muted: "border-transparent bg-stone-100",
      accent:
        "border-orange-400/20 bg-linear-to-br from-orange-600 via-orange-500 to-amber-600 text-white",
      dark: "border-stone-800 bg-stone-950 text-stone-50",
      ghost: "border-stone-200/70 bg-white/80 backdrop-blur-sm",
    },
    padding: {
      sm: "p-4",
      md: "p-6",
      lg: "p-8",
    },
  },
  defaultVariants: {
    variant: "default",
    padding: "md",
  },
});

export type CardProps = HTMLAttributes<HTMLDivElement> &
  VariantProps<typeof cardVariants>;

export function Card({ className, padding, variant, ...props }: CardProps) {
  return (
    <div
      className={cn(cardVariants({ padding, variant }), className)}
      {...props}
    />
  );
}
