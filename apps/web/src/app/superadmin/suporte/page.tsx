import { Card } from "@/components/ui";
import { getBackofficeSessionToken } from "@/lib/backoffice-session.server";

import { SuperadminShellHeader } from "../_components/superadmin-shell-header";
import { SuperadminState } from "../_components/superadmin-state";

type SuperadminSupportPageProps = {
  searchParams: Promise<{ token?: string }>;
};

export default async function SuperadminSupportPage({
  searchParams,
}: SuperadminSupportPageProps) {
  await searchParams;
  const token = await getBackofficeSessionToken();

  if (!token) {
    return (
      <div className="px-6 py-10 md:px-10">
        <SuperadminState
          currentPath="/superadmin/suporte"
          kind="missing-token"
        />
      </div>
    );
  }

  return (
    <div className="px-6 py-10 md:px-10">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <SuperadminShellHeader
          eyebrow="superadmin / suporte"
          subtitle="Base para acompanhamento de incidentes internos e situacoes que cruzam operacao, produto e time."
          title="Suporte"
        />
        <div className="grid gap-4 md:grid-cols-2">
          <Card className="space-y-3" padding="lg">
            <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-slate-500">
              atendimento interno
            </p>
            <p className="text-sm leading-7 text-stone-600">
              Reservado para visao consolidada de casos que pedem articulacao
              entre operadores internos e ownership de plataforma.
            </p>
          </Card>
          <Card className="space-y-3" padding="lg">
            <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-slate-500">
              escalacao
            </p>
            <p className="text-sm leading-7 text-stone-600">
              Estrutura inicial para futuras rotas de escalacao, historico de
              contexto e decisoes mais sensiveis.
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}
