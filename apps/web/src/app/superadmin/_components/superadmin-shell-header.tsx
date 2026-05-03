import type { ReactNode } from "react";

import { buttonVariants } from "@/components/ui";

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
    <header className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-slate-300 bg-white p-6 md:p-8">
      <div className="space-y-3">
        <p className="inline-flex rounded-full border border-slate-300 bg-slate-50 px-3 py-1 font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-slate-700">
          conselho interno
        </p>
        {eyebrow ? (
          <p className="font-mono text-[11px] font-bold uppercase tracking-[0.22em] text-slate-500">
            {eyebrow}
          </p>
        ) : null}
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight text-slate-950 md:text-4xl">
            {title}
          </h1>
          {subtitle ? (
            <p className="max-w-3xl text-sm leading-7 text-slate-600">
              {subtitle}
            </p>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        {actions}
        <form action="/auth/logout" method="post">
          <button
            className={buttonVariants({ variant: "outline" })}
            type="submit"
          >
            Encerrar sessao admin
          </button>
        </form>
      </div>
    </header>
  );
}
