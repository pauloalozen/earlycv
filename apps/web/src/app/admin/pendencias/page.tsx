import Link from "next/link";

import { buttonVariants, Card, EmptyState, Input } from "@/components/ui";
import { filterPendingItems } from "@/lib/admin-operations";
import { getPhaseOneAdminData } from "@/lib/admin-phase-one-data";

import { AdminShellHeader } from "../_components/admin-shell-header";
import { AdminTokenState } from "../_components/admin-token-state";

type PendingPageProps = {
  searchParams: Promise<{ query?: string; token?: string; type?: string }>;
};

export default async function AdminPendingPage({
  searchParams,
}: PendingPageProps) {
  const { query, token, type } = await searchParams;

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
  const filteredPendingItems = filterPendingItems(pendingItems, {
    query,
    type,
  });

  return (
    <div className="px-6 py-10 md:px-10">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
        <AdminShellHeader
          eyebrow="admin / pendencias"
          subtitle="Fila unica do que ainda falta concluir no operacional de captura."
          title="Pendencias"
        />

        <Card
          className="grid gap-3 md:grid-cols-[1.4fr_1fr_auto]"
          padding="sm"
          variant="ghost"
        >
          <Input
            defaultValue={query}
            form="pending-filter"
            name="query"
            placeholder="Buscar pendencia"
          />
          <select
            className="h-12 rounded-lg border border-stone-200 bg-white px-4 text-sm font-medium text-stone-900"
            defaultValue={type ?? ""}
            form="pending-filter"
            name="type"
          >
            <option value="">Todos os tipos</option>
            <option value="company-missing-source">empresa sem fonte</option>
            <option value="source-missing-first-run">
              fonte sem primeiro run
            </option>
            <option value="source-failed-recent-run">
              falha recente da fonte
            </option>
          </select>
          <form className="contents" id="pending-filter" method="GET">
            <input name="token" type="hidden" value={token} />
            <button
              className={buttonVariants({ variant: "outline" })}
              type="submit"
            >
              Filtrar
            </button>
          </form>
        </Card>

        {filteredPendingItems.length === 0 ? (
          <EmptyState
            description="Nenhuma pendencia corresponde aos filtros atuais."
            title="Nenhum resultado"
          />
        ) : (
          <div className="grid gap-4">
            {filteredPendingItems.map((item) => (
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
