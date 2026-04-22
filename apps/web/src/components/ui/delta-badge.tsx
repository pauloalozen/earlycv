import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

export interface DeltaBadgeProps extends ComponentProps<"span"> {
  delta: string | number;
}

export function DeltaBadge({ delta, className, ...props }: DeltaBadgeProps) {
  const strDelta =
    typeof delta === "number"
      ? delta >= 0
        ? `+${delta}`
        : delta.toString()
      : delta;
  const isPositive = strDelta.startsWith("+");
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold",
        isPositive ? "bg-lime-100 text-lime-800" : "bg-red-100 text-red-700",
        className,
      )}
      {...props}
    >
      {strDelta}
    </span>
  );
}
