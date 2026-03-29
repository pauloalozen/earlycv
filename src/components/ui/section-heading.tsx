import type { HTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/cn";

export type SectionHeadingProps = HTMLAttributes<HTMLDivElement> & {
  description?: ReactNode;
  eyebrow?: ReactNode;
  title: ReactNode;
};

export function SectionHeading({
  className,
  description,
  eyebrow,
  title,
  ...props
}: SectionHeadingProps) {
  return (
    <div className={cn("space-y-3", className)} {...props}>
      {eyebrow ? (
        <p className="font-mono text-xs font-bold uppercase tracking-[0.22em] text-orange-600">
          {eyebrow}
        </p>
      ) : null}
      <div className="space-y-3">
        <h2 className="max-w-3xl text-3xl font-bold tracking-tight text-stone-950 sm:text-4xl">
          {title}
        </h2>
        {description ? (
          <p className="max-w-3xl text-base leading-7 text-stone-500">
            {description}
          </p>
        ) : null}
      </div>
    </div>
  );
}
