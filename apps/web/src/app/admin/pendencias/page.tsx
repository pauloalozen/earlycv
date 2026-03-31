import Link from "next/link";

import { buttonVariants, Card, EmptyState } from "@/components/ui";
import { getPhaseOneAdminData } from "@/lib/admin-phase-one-data";

import { AdminShellHeader } from "../_components/admin-shell-header";
import { AdminTokenState } from "../_components/admin-token-state";

type PendingPageProps = {
  searchParams: Promise<{ token?: string }>;
};

export default async function AdminPendingPage({
  searchParams,
}: PendingPageProps) {
  const { token } = await searchParams;

  if (!token) {
    return (
      <div className="px-6 py-10 md:px-10">
        <AdminTokenState
          description="Entre com um token valido para abrir a fila de pendencias."
          title="Token ausente"
        />
      </div>
    );
  }

  const { pendingItems } = await getPhaseOneAdminData(token);

  return (
    <div className="px-6 py-10 md:px-10">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <AdminShellHeader
          eyebrow="admin / pendencias"
          subtitle="Fila unica do que ainda falta concluir no operacional de captura."
          title="Pendencias"
        />

        {pendingItems.length === 0 ? (
          <EmptyState
            description="Nenhuma pendencia operacional aberta neste momento."
            title="Fila vazia"
          />
        ) : (
          <div className="grid gap-4">
            {pendingItems.map((item) => (
              <Card
                className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between"
                key={`${item.type}:${item.entityId}`}
              >
                <div className="space-y-2">
                  <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-stone-500">
                    {item.type} - prioridade {item.priority}
                  </p>
                  <h2 className="text-lg font-bold tracking-tight text-stone-950">
                    {item.title}
                  </h2>
                  <p className="text-sm leading-6 text-stone-600">
                    {item.description}
                  </p>
                </div>
                <Link className={buttonVariants()} href={item.href}>
                  {item.cta}
                </Link>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
