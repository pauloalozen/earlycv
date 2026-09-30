import Link from "next/link";
import { buttonVariants } from "@/app/admin/_components/admin-button";
import { Card, EmptyState, Input } from "@/components/ui";
import {
  listAdminPending,
  type PendingType,
} from "@/lib/admin-ingestion-api";
import {
  buildCompanyDetailHref,
  buildPendingTypeLabel,
  buildSourceDetailHref,
} from "@/lib/admin-operations";
import { buildAdminStateModel } from "@/lib/admin-state";
import { getAdminDataErrorKind } from "@/lib/admin-token-errors";
import { buildAdminUserDetailHref } from "@/lib/admin-users-operations";
import { getBackofficeSessionToken } from "@/lib/backoffice-session.server";
import { buildAdminMetadata } from "@/lib/route-metadata";
import { AdminShellHeader } from "../_components/admin-shell-header";
import { AdminTokenState } from "../_components/admin-token-state";

export const metadata = buildAdminMetadata("Pendencias");

const PAGE_SIZE = 20;

const PENDING_TYPE_VALUES: PendingType[] = [
  "company-missing-source",
  "source-missing-first-run",
  "source-failed-recent-run",
  "user-missing-profile",
  "user-incomplete-profile",
  "user-missing-master-resume",
];

function buildPendingHref(type: PendingType, entityId: string) {
  if (type === "company-missing-source") return buildCompanyDetailHref(entityId);
  if (type.startsWith("source-")) return buildSourceDetailHref(entityId);
  return buildAdminUserDetailHref(entityId);
}

function buildPageHref(params: {
  page: number;
  query?: string;
  type?: string;
}) {
  const qs = new URLSearchParams();
  qs.set("page", String(params.page));
  if (params.query) qs.set("query", params.query);
  if (params.type) qs.set("type", params.type);
  return `/admin/pendencias?${qs}`;
}

type PendingPageProps = {
  searchParams: Promise<{
    page?: string;
    query?: string;
    token?: string;
    type?: string;
  }>;
};

export default async function AdminPendingPage({
  searchParams,
}: PendingPageProps) {
  const { page, query, type } = await searchParams;
  const pageNum = Math.max(1, Number.parseInt(page ?? "1", 10) || 1);
  const typeFilter = PENDING_TYPE_VALUES.includes(type as PendingType)
    ? (type as PendingType)
    : undefined;
  const token = await getBackofficeSessionToken();

  if (!token) {
    const state = buildAdminStateModel("missing-token", "/admin/pendencias");

    return (
      <div className="px-6 py-10 md:px-10">
        <AdminTokenState {...state} />
      </div>
    );
  }

  // Fila montada e paginada NO SERVIDOR (uma janela de 20 itens sobre os
  // tipos de pendência); nada de carregar usuários/empresas/fontes inteiros.
  const pendingDataResult = await listAdminPending(
    {
      page: pageNum,
      pageSize: PAGE_SIZE,
      query: query || undefined,
      type: typeFilter,
    },
    token,
  )
    .then((data) => ({ data, kind: "ok" }) as const)
    .catch((error: unknown) => ({ kind: getAdminDataErrorKind(error) }) as const);

  if (pendingDataResult.kind !== "ok") {
    const state = buildAdminStateModel(
      pendingDataResult.kind,
      "/admin/pendencias",
    );

    return (
      <div className="px-6 py-10 md:px-10">
        <AdminTokenState {...state} />
      </div>
    );
  }

  const { items: filteredPendingItems, total, totalPages } =
    pendingDataResult.data;
  const safePageNum = Math.min(pageNum, totalPages);

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
            <option value="user-missing-master-resume">
              usuario sem cv master
            </option>
            <option value="user-missing-profile">usuario sem perfil</option>
            <option value="user-incomplete-profile">
              usuario com perfil incompleto
            </option>
          </select>
          <form className="contents" id="pending-filter" method="GET">
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
                  <p className="text-[11px] font-medium text-stone-400">
                    {buildPendingTypeLabel(item.type)} - prioridade{" "}
                    {item.priority}
                  </p>
                  <h2 className="text-lg font-bold tracking-tight text-stone-950">
                    {item.title}
                  </h2>
                  <p className="text-sm leading-6 text-stone-600">
                    {item.description}
                  </p>
                </div>
                <Link
                  className={buttonVariants()}
                  href={buildPendingHref(item.type, item.entityId)}
                >
                  {item.cta}
                </Link>
              </Card>
            ))}
          </div>
        )}

        {totalPages > 1 && total > 0 && (
          <div className="flex items-center justify-between text-sm text-stone-600">
            <span>
              Página {safePageNum} de {totalPages} · {total} pendências
            </span>
            <div className="flex gap-2">
              {safePageNum > 1 && (
                <Link
                  className={buttonVariants({ variant: "outline", size: "sm" })}
                  href={buildPageHref({
                    page: safePageNum - 1,
                    query,
                    type: typeFilter,
                  })}
                >
                  ← Anterior
                </Link>
              )}
              {safePageNum < totalPages && (
                <Link
                  className={buttonVariants({ variant: "outline", size: "sm" })}
                  href={buildPageHref({
                    page: safePageNum + 1,
                    query,
                    type: typeFilter,
                  })}
                >
                  Próxima →
                </Link>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
