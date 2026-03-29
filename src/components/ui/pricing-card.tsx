import type { HTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/cn";

import { Badge } from "./badge";
import { Button } from "./button";
import { Card } from "./card";

export type PricingCardProps = HTMLAttributes<HTMLDivElement> & {
  ctaLabel?: ReactNode;
  description: ReactNode;
  featured?: boolean;
  plan: ReactNode;
  price: ReactNode;
};

export function PricingCard({
  className,
  ctaLabel = "Escolher plano",
  description,
  featured = false,
  plan,
  price,
  ...props
}: PricingCardProps) {
  return (
    <Card
      className={cn("flex h-full flex-col gap-6", className)}
      padding="md"
      variant={featured ? "accent" : "default"}
      {...props}
    >
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-2xl font-bold tracking-tight">{plan}</h3>
          {featured ? <Badge variant="dark">mais rapido</Badge> : null}
        </div>
        <p
          className={cn(
            "text-sm leading-6",
            featured ? "text-white/82" : "text-stone-500",
          )}
        >
          {description}
        </p>
      </div>
      <div className="mt-auto flex items-end justify-between gap-3">
        <p
          className={cn(
            "font-mono text-3xl font-bold",
            featured ? "text-white" : "text-stone-950",
          )}
        >
          {price}
        </p>
        <Button variant={featured ? "secondary" : "outline"}>{ctaLabel}</Button>
      </div>
    </Card>
  );
}
