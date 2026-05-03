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
      className="mx-auto max-w-3xl space-y-5 border-slate-300 bg-white"
      padding="lg"
    >
      <div className="space-y-2">
        <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-slate-500">
          superadmin / acesso institucional
        </p>
        <h1 className="text-3xl font-semibold tracking-tight text-slate-950">
          {copy.title}
        </h1>
        <p className="max-w-2xl text-sm leading-7 text-slate-600">
          {copy.description}
        </p>
      </div>

      <div className="rounded-[24px] border border-slate-300 bg-slate-50 px-5 py-4 text-sm leading-6 text-slate-700">
        O acesso institucional agora usa uma sessao interna por cookie HttpOnly
        para continuar a navegacao com menos friccao.
      </div>

      {copy.actionHref && copy.actionLabel ? (
        <Link
          className={buttonVariants({ variant: "outline" })}
          href={copy.actionHref}
        >
          {copy.actionLabel}
        </Link>
      ) : null}
    </Card>
  );
}
