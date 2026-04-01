import Link from "next/link";

import { buttonVariants, Card } from "@/components/ui";
import { getBackofficeSessionToken } from "@/lib/backoffice-session.server";

import { SuperadminShellHeader } from "../_components/superadmin-shell-header";
import { SuperadminState } from "../_components/superadmin-state";

type SuperadminSettingsPageProps = {
  searchParams: Promise<{ token?: string }>;
};

export default async function SuperadminSettingsPage({
  searchParams,
}: SuperadminSettingsPageProps) {
  await searchParams;
  const token = await getBackofficeSessionToken();

  if (!token) {
    return (
      <div className="px-6 py-10 md:px-10">
        <SuperadminState
          currentPath="/superadmin/configuracoes"
          kind="missing-token"
        />
      </div>
    );
  }

  return (
    <div className="px-6 py-10 md:px-10">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <SuperadminShellHeader
          actions={
            <Link
              className={buttonVariants({ variant: "outline" })}
              href={`/superadmin/equipe`}
            >
              Ver equipe
            </Link>
          }
          eyebrow="superadmin / configuracoes"
          subtitle="Base inicial para configuracoes mais sensiveis e governanca de templates internos."
          title="Configuracoes e templates"
        />

        <div className="grid gap-4 xl:grid-cols-3">
          {[
            {
              description:
                "Espaco reservado para templates administrados diretamente por superadmin, sem misturar com o fluxo operacional do admin.",
              title: "Biblioteca institucional de templates",
            },
            {
              description:
                "Area para politicas, limites e parametros com impacto transversal nas operacoes internas.",
              title: "Guardrails de configuracao",
            },
            {
              description:
                "Painel inicial separado para futuras aprovacoes e ownership de mudancas sensiveis.",
              title: "Governanca de alteracoes",
            },
          ].map((item) => (
            <Card className="space-y-3" key={item.title} padding="lg">
              <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-slate-500">
                superadmin
              </p>
              <h2 className="text-xl font-bold tracking-tight text-stone-950">
                {item.title}
              </h2>
              <p className="text-sm leading-7 text-stone-600">
                {item.description}
              </p>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
