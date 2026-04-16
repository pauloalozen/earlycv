import type { HTMLAttributes } from "react";
import { tv } from "tailwind-variants";

import { cn } from "@/lib/cn";

const deltaBadgeVariants = tv({
  base: "inline-flex items-center rounded-full px-3 py-1 font-mono text-[11px] font-bold uppercase tracking-[0.18em]",
  variants: {
    tone: {
      positive: "bg-lime-100 text-lime-700",
      negative: "bg-orange-100 text-orange-700",
      neutral: "bg-stone-200 text-stone-700",
    },
  },
  defaultVariants: {
    tone: "neutral",
  },
});

export interface DeltaBadgeProps extends HTMLAttributes<HTMLSpanElement> {
  delta: number;
  label?: string;
}

export function DeltaBadge({
  delta,
  label = "pts",
  className,
  ...props
}: DeltaBadgeProps) {
  const tone = delta > 0 ? "positive" : delta < 0 ? "negative" : "neutral";
  const absDelta = Math.abs(delta);
  const sign = delta > 0 ? "+" : delta < 0 ? "-" : "";
  return (
    <span className={cn(deltaBadgeVariants({ tone }), className)} {...props}>
      {sign}
      <span className="font-bold">{absDelta}</span>{" "}
      <span className="font-bold">{label}</span>
    </span>
  );
}
