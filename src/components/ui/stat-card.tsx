import type { HTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/cn";

import { Card } from "./card";

type StatTone = "accent" | "default" | "success";

const valueToneClassNames: Record<StatTone, string> = {
  accent: "text-orange-600",
  default: "text-stone-900",
  success: "text-emerald-600",
};

export type StatCardProps = HTMLAttributes<HTMLDivElement> & {
  label: ReactNode;
  tone?: StatTone;
  value: ReactNode;
};

export function StatCard({
  className,
  label,
  tone = "default",
  value,
  ...props
}: StatCardProps) {
  return (
    <Card
      className={cn("space-y-2", className)}
      padding="sm"
      variant="default"
      {...props}
    >
      <p className="text-sm font-medium text-stone-500">{label}</p>
      <p
        className={cn(
          "font-mono text-4xl font-bold tracking-tight",
          valueToneClassNames[tone],
        )}
      >
        {value}
      </p>
    </Card>
  );
}
