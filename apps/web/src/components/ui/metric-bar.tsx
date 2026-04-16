import { type ClassValue, clsx } from "clsx";
import type React from "react";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

type Color = "green" | "yellow" | "red";

interface Segment {
  name: string;
  pct: number;
  color: Color;
}

interface MetricBarProps extends React.HTMLAttributes<HTMLDivElement> {
  score: number;
  segments: Segment[];
  totalWeight?: number;
}

export function MetricBar({
  score,
  segments,
  className,
  ...props
}: MetricBarProps) {
  let cumulative = 0;
  return (
    <div className={cn("flex items-center gap-4", className)} {...props}>
      <div className="relative w-48 h-4 bg-stone-200 rounded-full overflow-hidden">
        {segments.map((segment, _index) => {
          const left = cumulative;
          cumulative += segment.pct;
          const colorClass =
            segment.color === "green"
              ? "bg-emerald-500"
              : segment.color === "yellow"
                ? "bg-amber-500"
                : "bg-red-500";
          return (
            <div
              key={segment.name}
              className={cn("absolute top-0 h-full rounded-full", colorClass)}
              style={{
                left: `${left}%`,
                width: `${segment.pct}%`,
              }}
              title={`${segment.name} ${segment.pct}%`}
            />
          );
        })}
      </div>
      <span className="font-mono text-stone-900 text-lg font-bold tracking-wider">
        {score}%
      </span>
    </div>
  );
}
