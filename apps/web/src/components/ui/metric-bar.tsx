import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

interface MetricBarProps extends ComponentProps<"div"> {
  label: string;
  value: number;
}

export function MetricBar({
  label,
  value,
  className,
  ...props
}: MetricBarProps) {
  return (
    <div
      className={cn("w-full", className)}
      data-testid={`metric-bar-${label.toLowerCase().replace(/\s+/g, "-")} `}
      {...props}
    >
      <div className="relative h-4 w-full overflow-hidden rounded-full bg-[#EEEEEE]">
        <div
          className="absolute inset-y-0 left-0 rounded-full transition-all duration-700"
          style={{
            width: `${value}%`,
            background:
              "linear-gradient(to right, #ef4444 0%, #f59e0b 50%, #84cc16 100%)",
            backgroundSize: "100vw 100%",
            backgroundPosition: "left center",
          }}
        />
      </div>
      <div className="relative mt-2 h-5 w-full text-[10px] font-semibold">
        <span className="absolute left-0 text-[#AAAAAA]">0</span>
        <span
          className="absolute -translate-x-1/2 whitespace-nowrap"
          style={{ left: `${value}%` }}
        >
          {value}
        </span>
        <span className="absolute right-0 text-[#AAAAAA]">100</span>
      </div>
    </div>
  );
}
