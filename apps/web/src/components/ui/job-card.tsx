import type { HTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/cn";

import { Badge } from "./badge";
import { Card } from "./card";

export type JobCardProps = HTMLAttributes<HTMLDivElement> & {
  company: ReactNode;
  fitLabel?: ReactNode;
  meta: ReactNode;
  signal?: ReactNode;
  title: ReactNode;
};

export function JobCard({
  className,
  company,
  fitLabel,
  meta,
  signal,
  title,
  ...props
}: JobCardProps) {
  return (
    <Card
      className={cn(
        "flex flex-col gap-5 md:flex-row md:items-start md:justify-between",
        className,
      )}
      padding="md"
      variant="default"
      {...props}
    >
      <div className="space-y-2">
        <p className="font-mono text-xs font-bold uppercase tracking-[0.18em] text-stone-500">
          {company}
        </p>
        <h3 className="text-xl font-bold tracking-tight text-stone-900">
          {title}
        </h3>
        <p className="max-w-2xl text-sm leading-6 text-stone-500">{meta}</p>
      </div>
      <div className="flex shrink-0 flex-col items-start gap-2 md:items-end">
        {fitLabel ? <Badge variant="success">{fitLabel}</Badge> : null}
        {signal ? <Badge variant="accent">{signal}</Badge> : null}
      </div>
    </Card>
  );
}
