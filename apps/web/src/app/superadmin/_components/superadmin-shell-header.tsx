import type { ReactNode } from "react";

import { Badge, Card } from "@/components/ui";

type SuperadminShellHeaderProps = {
  actions?: ReactNode;
  eyebrow?: string;
  subtitle?: string;
  title: string;
};

export function SuperadminShellHeader({
  actions,
  eyebrow,
  subtitle,
  title,
}: SuperadminShellHeaderProps) {
  return (
    <Card
      className="overflow-hidden border-slate-200 bg-linear-to-br from-slate-950 via-slate-900 to-cyan-950 text-white"
      padding="lg"
    >
      <div className="absolute inset-y-0 right-0 hidden w-1/3 bg-radial from-cyan-300/18 via-transparent to-transparent lg:block" />
      <div className="relative flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-3">
          <Badge className="bg-white/10 text-cyan-100" variant="dark">
            conselho interno
          </Badge>
          {eyebrow ? (
            <p className="font-mono text-[11px] font-bold uppercase tracking-[0.22em] text-cyan-100/75">
              {eyebrow}
            </p>
          ) : null}
          <div className="space-y-2">
            <h1 className="text-4xl font-bold tracking-tight text-white">
              {title}
            </h1>
            {subtitle ? (
              <p className="max-w-3xl text-sm leading-7 text-slate-200">
                {subtitle}
              </p>
            ) : null}
          </div>
        </div>

        {actions ? <div className="flex flex-wrap gap-3">{actions}</div> : null}
      </div>
    </Card>
  );
}
