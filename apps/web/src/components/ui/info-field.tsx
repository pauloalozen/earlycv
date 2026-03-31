import type { HTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/cn";

import { Card } from "./card";

export type InfoFieldProps = HTMLAttributes<HTMLDivElement> & {
  description?: ReactNode;
  label: ReactNode;
};

export function InfoField({
  className,
  description,
  label,
  ...props
}: InfoFieldProps) {
  return (
    <Card
      className={cn("space-y-2", className)}
      padding="sm"
      variant="muted"
      {...props}
    >
      <p className="text-sm font-semibold text-stone-900">{label}</p>
      {description ? (
        <p className="text-sm leading-6 text-stone-500">{description}</p>
      ) : null}
    </Card>
  );
}
