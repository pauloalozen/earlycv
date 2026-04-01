import Link from "next/link";

import { buttonVariants, Card } from "@/components/ui";
import {
  buildSuperadminStateModel,
  type SuperadminStateKind,
} from "@/lib/superadmin-state";

type SuperadminStateProps = {
  currentPath: string;
  kind: SuperadminStateKind;
};

export function SuperadminState({ currentPath, kind }: SuperadminStateProps) {
  const copy = buildSuperadminStateModel(kind, currentPath);

  return (
    <Card
      className="mx-auto max-w-3xl space-y-5 border-slate-200 bg-linear-to-br from-slate-950 via-slate-900 to-cyan-950 text-white"
      padding="lg"
    >
      <div className="space-y-2">
        <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-cyan-100/75">
          superadmin / acesso institucional
        </p>
        <h1 className="text-3xl font-bold tracking-tight text-white">
          {copy.title}
        </h1>
        <p className="max-w-2xl text-sm leading-7 text-slate-200">
          {copy.description}
        </p>
      </div>

      <div className="rounded-[24px] border border-white/10 bg-white/6 px-5 py-4 text-sm leading-6 text-slate-100">
        O acesso institucional agora usa uma sessao interna por cookie HttpOnly
        para continuar a navegacao com menos friccao.
      </div>

      {copy.actionHref && copy.actionLabel ? (
        <Link
          className={buttonVariants({ variant: "dark" })}
          href={copy.actionHref}
        >
          {copy.actionLabel}
        </Link>
      ) : null}
    </Card>
  );
}
