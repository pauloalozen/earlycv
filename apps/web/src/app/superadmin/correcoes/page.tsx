import { Card } from "@/components/ui";
import { getBackofficeSessionToken } from "@/lib/backoffice-session.server";

import { SuperadminShellHeader } from "../_components/superadmin-shell-header";
import { SuperadminState } from "../_components/superadmin-state";

type SuperadminCorrectionsPageProps = {
  searchParams: Promise<{ token?: string }>;
};

export default async function SuperadminCorrectionsPage({
  searchParams,
}: SuperadminCorrectionsPageProps) {
  await searchParams;
  const token = await getBackofficeSessionToken();

  if (!token) {
    return (
      <div className="px-6 py-10 md:px-10">
        <SuperadminState
          currentPath="/superadmin/correcoes"
          kind="missing-token"
        />
      </div>
    );
  }

  return (
    <div className="px-6 py-10 md:px-10">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <SuperadminShellHeader
          eyebrow="superadmin / correcoes"
          subtitle="Espaco inicial para filas de revisao mais delicadas e correcoes que pedem ownership institucional."
          title="Correcoes guiadas"
        />
        <Card className="space-y-4 border-slate-200 bg-slate-50" padding="lg">
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-slate-500">
            modulo inicial
          </p>
          <p className="text-sm leading-7 text-slate-700">
            A tela nasce como shell para separar revisoes sensiveis do restante
            do admin. A fila assistida, trilha de aprovacao e endurecimento de
            sessao continuam como follow-up ja rastreado fora desta tarefa.
          </p>
        </Card>
      </div>
    </div>
  );
}
