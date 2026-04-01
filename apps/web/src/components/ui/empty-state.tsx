import type { HTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/cn";

import { Card } from "./card";

export type EmptyStateProps = HTMLAttributes<HTMLDivElement> & {
  description?: ReactNode;
  title: ReactNode;
};

export function EmptyState({
  className,
  description,
  title,
  ...props
}: EmptyStateProps) {
  return (
    <Card
      className={cn(
        "flex flex-col items-center justify-center gap-3 text-center",
        className,
      )}
      padding="md"
      variant="muted"
      {...props}
    >
      <p className="text-lg font-bold tracking-tight text-stone-900">{title}</p>
      {description ? (
        <p className="max-w-xl text-sm leading-6 text-stone-500">
          {description}
        </p>
      ) : null}
    </Card>
  );
}
