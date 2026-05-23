import Link from "next/link";
import { buttonVariants } from "@/app/admin/_components/admin-button";
import {
  AdminPageWrap,
  AdminStatCard,
  AdminStatsRow,
} from "@/app/admin/_components/admin-primitives";
import { listAdminPaymentRecoveryPending } from "@/lib/admin-payment-recovery-api";
import { buildAdminMetadata } from "@/lib/route-metadata";
import { AdminShellHeader } from "../_components/admin-shell-header";
import { RecoveryTableClient } from "./_components/recovery-table-client";
import {
  ignoreRecoveryAction,
  sendRecoveryEmailAction,
  unignoreRecoveryAction,
} from "./actions";

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
  const localPagedSummaryIgnored = response.items.filter(
    (item) => item.ignored,
  ).length;
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
    <AdminPageWrap>
      <AdminShellHeader
        actions={
          <Link
            className={buttonVariants({ variant: "outline" })}
            href="/admin/payment-recovery"
          >
            ↓ Exportar CSV
          </Link>
        }
        eyebrow="admin · recuperação de pedidos"
        subtitle="Revisão manual de pedidos pendentes para envio de email de recuperação. Aplique filtros e dispare por linha."
        title="Recuperação de pedidos pendentes."
      />

      <AdminStatsRow>
        <AdminStatCard
          label="Elegíveis para envio"
          value={String(localPagedSummaryEligible)}
          sub="nesta página"
        />
        <AdminStatCard
          label="Já enviados"
          value={String(localPagedSummaryAlreadySent)}
          sub="nesta página"
        />
        <AdminStatCard
          label="Ignorados"
          value={String(localPagedSummaryIgnored)}
        />
        <AdminStatCard
          label="Total na página"
          value={String(response.items.length)}
        />
      </AdminStatsRow>

      <form
        action="/admin/payment-recovery"
        className="mb-4 flex flex-wrap gap-2"
        method="GET"
      >
        <select
          className="h-9 rounded-md border px-3 text-[12.5px]"
          style={{
            borderColor: "rgba(10,10,10,0.08)",
            background: "#fafaf6",
            color: "#2a2620",
          }}
          defaultValue={normalized.eligibilityStatus}
          name="eligibilityStatus"
        >
          <option value="eligible">eligible</option>
          <option value="possibly_resolved">possibly_resolved</option>
          <option value="not_eligible">not_eligible</option>
        </select>
        <input
          className="h-9 w-48 rounded-md border px-3 text-[12.5px]"
          style={{
            borderColor: "rgba(10,10,10,0.08)",
            background: "#fafaf6",
            color: "#2a2620",
          }}
          defaultValue={sp.originAction ?? ""}
          name="originAction"
          placeholder="originAction"
        />
        <select
          className="h-9 rounded-md border px-3 text-[12.5px]"
          style={{
            borderColor: "rgba(10,10,10,0.08)",
            background: "#fafaf6",
            color: "#2a2620",
          }}
          defaultValue={sp.alreadySent ?? ""}
          name="alreadySent"
        >
          <option value="">enviado: todos</option>
          <option value="true">enviado: sim</option>
          <option value="false">enviado: não</option>
        </select>
        <select
          className="h-9 rounded-md border px-3 text-[12.5px]"
          style={{
            borderColor: "rgba(10,10,10,0.08)",
            background: "#fafaf6",
            color: "#2a2620",
          }}
          defaultValue={sp.hasAvailableCredits ?? ""}
          name="hasAvailableCredits"
        >
          <option value="">créditos: todos</option>
          <option value="true">créditos: sim</option>
          <option value="false">créditos: não</option>
        </select>
        <select
          className="h-9 rounded-md border px-3 text-[12.5px]"
          style={{
            borderColor: "rgba(10,10,10,0.08)",
            background: "#fafaf6",
            color: "#2a2620",
          }}
          defaultValue={normalized.ignored}
          name="ignored"
        >
          <option value="false">ignorado: false</option>
          <option value="true">ignorado: true</option>
        </select>
        <input
          className="h-9 rounded-md border px-3 text-[12.5px]"
          style={{
            borderColor: "rgba(10,10,10,0.08)",
            background: "#fafaf6",
            color: "#2a2620",
          }}
          defaultValue={sp.dateFrom ?? ""}
          name="dateFrom"
          type="date"
        />
        <input
          className="h-9 rounded-md border px-3 text-[12.5px]"
          style={{
            borderColor: "rgba(10,10,10,0.08)",
            background: "#fafaf6",
            color: "#2a2620",
          }}
          defaultValue={sp.dateTo ?? ""}
          name="dateTo"
          type="date"
        />
        <input
          className="h-9 w-56 rounded-md border px-3 text-[12.5px]"
          style={{
            borderColor: "rgba(10,10,10,0.08)",
            background: "#fafaf6",
            color: "#2a2620",
          }}
          defaultValue={sp.search ?? ""}
          name="search"
          placeholder="Buscar por usuário, email, pedido"
        />
        <button className={buttonVariants()} type="submit">
          Filtrar
        </button>
        <Link
          className={buttonVariants({ variant: "outline" })}
          href="/admin/payment-recovery"
        >
          Limpar
        </Link>
      </form>

      <RecoveryTableClient
        items={response.items}
        onIgnore={ignoreRecoveryAction}
        onSendEmail={sendRecoveryEmailAction}
        onUnignore={unignoreRecoveryAction}
      />

      <div
        className="mt-4 flex items-center justify-between"
        style={{
          fontSize: 12,
          color: "#8a8580",
          fontFamily: '"Geist Mono", monospace',
        }}
      >
        <span>
          página {response.page} de {response.totalPages}
        </span>
        <div className="flex gap-2">
          {response.page > 1 ? (
            <Link
              className={buttonVariants({ size: "sm", variant: "outline" })}
              href={buildUrl({ page: String(response.page - 1) })}
            >
              ← anterior
            </Link>
          ) : null}
          {response.page < response.totalPages ? (
            <Link
              className={buttonVariants({ size: "sm", variant: "outline" })}
              href={buildUrl({ page: String(response.page + 1) })}
            >
              próxima →
            </Link>
          ) : null}
        </div>
      </div>
    </AdminPageWrap>
  );
}
