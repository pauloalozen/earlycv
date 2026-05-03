import type { ReactNode } from "react";

import { buttonVariants } from "@/components/ui";

type AdminShellHeaderProps = {
  actions?: ReactNode;
  eyebrow?: string;
  subtitle?: string;
  title: string;
};

export function AdminShellHeader({
  actions,
  eyebrow,
  subtitle,
  title,
}: AdminShellHeaderProps) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-stone-200 bg-white p-6 md:p-8">
      <div className="space-y-2">
        {eyebrow ? (
          <p className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-stone-500">
            {eyebrow}
          </p>
        ) : null}
        <h1 className="text-3xl font-semibold tracking-tight text-stone-950 md:text-4xl">
          {title}
        </h1>
        {subtitle ? (
          <p className="max-w-3xl text-sm leading-7 text-stone-600">
            {subtitle}
          </p>
        ) : null}
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
