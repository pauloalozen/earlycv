import Link from "next/link";

import { listAdminPaymentRecoveryPending } from "@/lib/admin-payment-recovery-api";
import { buildAdminMetadata } from "@/lib/route-metadata";
import {
  ignoreRecoveryAction,
  sendRecoveryEmailAction,
  unignoreRecoveryAction,
} from "./actions";
import { RecoveryTableClient } from "./_components/recovery-table-client";

export const metadata = buildAdminMetadata("Recuperacao");

type SearchParams = {
  eligibilityStatus?: string;
  originAction?: string;
  alreadySent?: string;
  hasAvailableCredits?: string;
  ignored?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  page?: string;
};

export default async function AdminPaymentRecoveryPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const parsedPage = sp.page ? Number.parseInt(sp.page, 10) : 1;
  const page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;

  const normalized = {
    eligibilityStatus: sp.eligibilityStatus ?? "eligible",
    ignored: sp.ignored ?? "false",
  };

  const response = await listAdminPaymentRecoveryPending({
    eligibilityStatus: normalized.eligibilityStatus,
    originAction: sp.originAction,
    alreadySent: sp.alreadySent,
    hasAvailableCredits: sp.hasAvailableCredits,
    ignored: normalized.ignored,
    dateFrom: sp.dateFrom,
    dateTo: sp.dateTo,
    search: sp.search,
    page,
    pageSize: 20,
  });

  const localPagedSummaryEligible = response.items.filter(
    (item) => item.eligibilityStatus === "eligible" && !item.ignored,
  ).length;
  const localPagedSummaryIgnored = response.items.filter((item) => item.ignored).length;
  const localPagedSummaryAlreadySent = response.items.filter(
    (item) => item.alreadySent,
  ).length;

  const buildUrl = (overrides: Record<string, string | undefined>) => {
    const params = new URLSearchParams();
    const merged = {
      eligibilityStatus: normalized.eligibilityStatus,
      originAction: sp.originAction,
      alreadySent: sp.alreadySent,
      hasAvailableCredits: sp.hasAvailableCredits,
      ignored: normalized.ignored,
      dateFrom: sp.dateFrom,
      dateTo: sp.dateTo,
      search: sp.search,
      page: String(page),
      ...overrides,
    };
    for (const [key, value] of Object.entries(merged)) {
      if (value) params.set(key, value);
    }
    return `/admin/payment-recovery?${params.toString()}`;
  };

  return (
    <div className="max-w-7xl px-6 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-stone-900">Recuperacao de pedidos pendentes</h1>
        <p className="mt-1 text-sm text-stone-500">
          Revisao manual de pedidos pendentes para envio de email de recuperacao.
        </p>
      </div>

      <div className="mb-6 grid gap-3 md:grid-cols-3">
        <div className="rounded-xl border border-stone-200 bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-stone-500">Resumo local (pagina)</p>
          <p className="text-xl font-semibold text-stone-900">{localPagedSummaryEligible}</p>
          <p className="text-xs text-stone-500">Elegiveis para envio</p>
        </div>
        <div className="rounded-xl border border-stone-200 bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-stone-500">Resumo local (pagina)</p>
          <p className="text-xl font-semibold text-stone-900">{localPagedSummaryAlreadySent}</p>
          <p className="text-xs text-stone-500">Ja enviados</p>
        </div>
        <div className="rounded-xl border border-stone-200 bg-white p-4">
          <p className="text-xs uppercase tracking-wide text-stone-500">Resumo local (pagina)</p>
          <p className="text-xl font-semibold text-stone-900">{localPagedSummaryIgnored}</p>
          <p className="text-xs text-stone-500">Ignorados</p>
        </div>
      </div>

      <form action="/admin/payment-recovery" className="mb-6 flex flex-wrap gap-3" method="GET">
        <select className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-700" defaultValue={normalized.eligibilityStatus} name="eligibilityStatus">
          <option value="eligible">eligible</option>
          <option value="possibly_resolved">possibly_resolved</option>
          <option value="not_eligible">not_eligible</option>
        </select>
        <input className="w-48 rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-700" defaultValue={sp.originAction ?? ""} name="originAction" placeholder="originAction" />
        <select className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-700" defaultValue={sp.alreadySent ?? ""} name="alreadySent">
          <option value="">alreadySent: todos</option>
          <option value="true">alreadySent: true</option>
          <option value="false">alreadySent: false</option>
        </select>
        <select className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-700" defaultValue={sp.hasAvailableCredits ?? ""} name="hasAvailableCredits">
          <option value="">creditos: todos</option>
          <option value="true">creditos: true</option>
          <option value="false">creditos: false</option>
        </select>
        <select className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-700" defaultValue={normalized.ignored} name="ignored">
          <option value="false">ignored: false</option>
          <option value="true">ignored: true</option>
        </select>
        <input className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-700" defaultValue={sp.dateFrom ?? ""} name="dateFrom" type="date" />
        <input className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-700" defaultValue={sp.dateTo ?? ""} name="dateTo" type="date" />
        <input className="w-56 rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-700" defaultValue={sp.search ?? ""} name="search" placeholder="Buscar por usuario, email, pedido" />
        <button className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white" type="submit">Filtrar</button>
        <Link className="rounded-lg border border-stone-200 px-4 py-2 text-sm text-stone-600" href="/admin/payment-recovery">Limpar</Link>
      </form>

      <RecoveryTableClient
        items={response.items}
        onIgnore={ignoreRecoveryAction}
        onSendEmail={sendRecoveryEmailAction}
        onUnignore={unignoreRecoveryAction}
      />

      <div className="mt-4 flex items-center justify-between text-sm text-stone-500">
        <span>Pagina {response.page} de {response.totalPages}</span>
        <div className="flex gap-2">
          {response.page > 1 ? (
            <Link className="rounded-lg border border-stone-200 px-3 py-1.5 hover:bg-stone-100" href={buildUrl({ page: String(response.page - 1) })}>
              ← Anterior
            </Link>
          ) : null}
          {response.page < response.totalPages ? (
            <Link className="rounded-lg border border-stone-200 px-3 py-1.5 hover:bg-stone-100" href={buildUrl({ page: String(response.page + 1) })}>
              Proxima →
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  );
}
