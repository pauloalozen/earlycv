import Link from "next/link";
import { buttonVariants } from "@/app/admin/_components/admin-button";
import {
  AdminPageWrap,
  AdminPill,
  AdminStatCard,
  AdminStatsRow,
  AT,
} from "@/app/admin/_components/admin-primitives";
import { EmptyState } from "@/components/ui";
import { buildPendingTypeLabel } from "@/lib/admin-operations";
import { listAdminPayments } from "@/lib/admin-payments-api";
import { getPhaseOneAdminDataSafely } from "@/lib/admin-phase-one-data";
import { buildAdminStateModel } from "@/lib/admin-state";
import { getBackofficeSessionToken } from "@/lib/backoffice-session.server";
import { buildAdminMetadata } from "@/lib/route-metadata";
import { AdminShellHeader } from "./_components/admin-shell-header";
import { AdminTokenState } from "./_components/admin-token-state";
import { type Period, PeriodSelector } from "./_components/period-selector";

export const metadata = buildAdminMetadata("Visao geral");

const VALID_PERIODS: Period[] = ["hoje", "7d", "30d", "mes"];

function resolvePeriod(raw?: string): Period {
  return VALID_PERIODS.includes(raw as Period) ? (raw as Period) : "30d";
}

function getSinceDate(period: Period): Date {
  const now = new Date();
  switch (period) {
    case "hoje":
      return new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
      );
    case "7d":
      return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    case "mes":
      return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    default:
      return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  }
}

function periodSubLabel(period: Period): string {
  switch (period) {
    case "hoje":
      return "hoje";
    case "7d":
      return "últimos 7 dias";
    case "30d":
      return "últimos 30 dias";
    case "mes":
      return "este mês";
  }
}

function formatBRL(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

type AdminOverviewPageProps = {
  searchParams: Promise<{ period?: string; token?: string }>;
};

export default async function AdminOverviewPage({
  searchParams,
}: AdminOverviewPageProps) {
  const { period: rawPeriod } = await searchParams;
  const period = resolvePeriod(rawPeriod);

  const token = await getBackofficeSessionToken();

  if (!token) {
    const state = buildAdminStateModel("missing-token", "/admin");

    return (
      <div className="px-6 py-10 md:px-10">
        <AdminTokenState {...state} />
      </div>
    );
  }

  const overviewDataResult = await getPhaseOneAdminDataSafely();

  if (overviewDataResult.kind !== "ok") {
    const state = buildAdminStateModel(overviewDataResult.kind, "/admin");

    return (
      <div className="px-6 py-10 md:px-10">
        <AdminTokenState {...state} />
      </div>
    );
  }

  const {
    adminUsers,
    adminUserViews,
    companyViews,
    companies,
    jobs,
    orderedRuns,
    pendingItems,
    sourceViews,
  } = overviewDataResult.data;

  // ── Period cutoff ──────────────────────────────────────────────
  const since = getSinceDate(period);
  const sinceIso = since.toISOString();
  const subLabel = periodSubLabel(period);

  // ── Period-sensitive metrics ───────────────────────────────────
  const newUsers = adminUsers.filter((u) => u.createdAt >= sinceIso).length;
  const runsInPeriod = orderedRuns.filter(
    (r) => r.startedAt != null && r.startedAt >= sinceIso,
  ).length;
  const failedRunsInPeriod = orderedRuns.filter(
    (r) =>
      r.startedAt != null && r.startedAt >= sinceIso && r.status === "failed",
  ).length;

  let approvedPaymentsCount = 0;
  let revenueInCents = 0;
  try {
    const paymentsResult = await listAdminPayments({
      from: sinceIso,
      limit: 1000,
    });
    const approved = paymentsResult.items.filter(
      (p) => p.status === "approved" || p.status === "completed",
    );
    approvedPaymentsCount = approved.length;
    revenueInCents = approved.reduce(
      (sum, p) => sum + (p.amountInCents ?? 0),
      0,
    );
  } catch {
    // payments API indisponível — mantém zeros
  }

  // ── State metrics (current snapshot) ──────────────────────────
  const totalUsers = adminUsers.length;
  const totalAdaptedResumes = adminUserViews.reduce(
    (sum, u) => sum + u.adaptedResumeCount,
    0,
  );
  const incompleteCompanies = companyViews.filter(
    (item) => item.status.label !== "completa",
  ).length;
  const sourcesAwaitingRun = sourceViews.filter(
    (item) => item.status.label === "aguardando primeiro run",
  ).length;
  const failedRunsTotal = orderedRuns.filter(
    (r) => r.status === "failed",
  ).length;

  return (
    <AdminPageWrap>
      <AdminShellHeader
        actions={
          <>
            <Link
              className={buttonVariants({ variant: "outline" })}
              href="/admin/empresas/nova"
            >
              + Empresa e fonte
            </Link>
            <Link className={buttonVariants()} href="/admin/pendencias">
              Ver pendências
            </Link>
          </>
        }
        eyebrow="admin · visão geral"
        subtitle="Acompanhe o estado do produto, captura e operação financeira sem sair do backoffice."
        title="Central operacional."
      />

      {/* ── Métricas por período ───────────────────────────────── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 12,
        }}
      >
        <div
          style={{
            fontFamily: '"Geist Mono", monospace',
            fontSize: 10.5,
            letterSpacing: 1.2,
            color: AT.muted2,
            fontWeight: 500,
          }}
        >
          NEGÓCIO · PERÍODO
        </div>
        <PeriodSelector current={period} />
      </div>

      <AdminStatsRow cols={4}>
        <AdminStatCard
          label="Novos cadastros"
          value={String(newUsers)}
          sub={subLabel}
        />
        <AdminStatCard
          label="Pagamentos aprovados"
          value={String(approvedPaymentsCount)}
          sub={subLabel}
        />
        <AdminStatCard
          label="Receita"
          value={revenueInCents > 0 ? formatBRL(revenueInCents) : "—"}
          sub={subLabel}
        />
        <AdminStatCard
          label="Runs executados"
          value={String(runsInPeriod)}
          sub={
            failedRunsInPeriod > 0
              ? `${failedRunsInPeriod} com falha`
              : subLabel
          }
        />
      </AdminStatsRow>

      {/* ── Estado atual (snapshot) ────────────────────────────── */}
      <div
        style={{
          fontFamily: '"Geist Mono", monospace',
          fontSize: 10.5,
          letterSpacing: 1.2,
          color: AT.muted2,
          fontWeight: 500,
          margin: "4px 0 12px",
        }}
      >
        PRODUTO · ESTADO ATUAL
      </div>

      <AdminStatsRow cols={4}>
        <AdminStatCard
          label="Usuários cadastrados"
          value={String(totalUsers)}
          sub="total acumulado"
        />
        <AdminStatCard
          label="CVs adaptados"
          value={String(totalAdaptedResumes)}
          sub="total acumulado"
        />
        <AdminStatCard
          label="Vagas catalogadas"
          value={String(jobs.length)}
          sub="total acumulado"
        />
        <AdminStatCard
          label="Pendências abertas"
          value={String(pendingItems.length)}
          sub={pendingItems.length === 0 ? "tudo ok" : "requer atenção"}
        />
      </AdminStatsRow>

      {/* ── Pendências + Sinais ────────────────────────────────── */}
      <div
        className="admin-main-grid"
        style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 16 }}
      >
        {/* Pendências */}
        <div
          style={{
            background: AT.card,
            border: `1px solid ${AT.border}`,
            borderRadius: 10,
            padding: "18px 18px 14px",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "baseline",
              marginBottom: 14,
            }}
          >
            <div>
              <div
                style={{
                  fontFamily: '"Geist Mono", monospace',
                  fontSize: 10.5,
                  letterSpacing: 1.2,
                  color: AT.muted2,
                  fontWeight: 500,
                  marginBottom: 4,
                }}
              >
                PENDÊNCIAS PRIORIZADAS · {pendingItems.length}
              </div>
              <div style={{ fontSize: 15, fontWeight: 600, color: AT.ink2 }}>
                Próximas ações operacionais
              </div>
            </div>
            <Link
              href="/admin/pendencias"
              style={{
                fontSize: 12,
                color: AT.muted,
                textDecoration: "none",
                fontWeight: 500,
              }}
            >
              abrir fila completa →
            </Link>
          </div>

          {pendingItems.length === 0 ? (
            <EmptyState
              description="Nenhuma pendencia operacional aberta no momento."
              title="Tudo sob controle"
            />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
              {pendingItems.slice(0, 5).map((item, i) => (
                <div
                  key={`${item.type}:${item.entityId}`}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 14,
                    padding: "12px 0",
                    borderTop: `1px solid ${i === 0 ? AT.border : AT.borderSoft}`,
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        display: "flex",
                        gap: 8,
                        alignItems: "center",
                        marginBottom: 3,
                      }}
                    >
                      <AdminPill tone="warn" mono>
                        {buildPendingTypeLabel(item.type)}
                      </AdminPill>
                      <span
                        style={{
                          fontSize: 13,
                          fontWeight: 600,
                          color: AT.ink2,
                        }}
                      >
                        {item.title}
                      </span>
                    </div>
                    <div
                      style={{
                        fontSize: 11.5,
                        color: AT.muted,
                        fontFamily: '"Geist Mono", monospace',
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {item.description}
                    </div>
                  </div>
                  <Link
                    className={buttonVariants({
                      size: "sm",
                      variant: "outline",
                    })}
                    href={item.href}
                  >
                    {item.cta}
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Sinais rápidos */}
        <div
          style={{
            background: AT.card,
            border: `1px solid ${AT.border}`,
            borderRadius: 10,
            padding: "18px 18px 8px",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "baseline",
              marginBottom: 14,
            }}
          >
            <div>
              <div
                style={{
                  fontFamily: '"Geist Mono", monospace',
                  fontSize: 10.5,
                  letterSpacing: 1.2,
                  color: AT.muted2,
                  fontWeight: 500,
                  marginBottom: 4,
                }}
              >
                CAPTURA · SAÚDE
              </div>
              <div style={{ fontSize: 15, fontWeight: 600, color: AT.ink2 }}>
                Estado da ingestão
              </div>
            </div>
            <Link
              href="/admin/ingestion"
              style={{
                fontSize: 12,
                color: AT.muted,
                textDecoration: "none",
                fontWeight: 500,
              }}
            >
              ver ingestão →
            </Link>
          </div>

          {[
            {
              label: "Empresas incompletas",
              value: incompleteCompanies,
              note: "sem dados completos",
              alertIfNonZero: true,
            },
            {
              label: "Fontes aguardando run",
              value: sourcesAwaitingRun,
              note: "agendamento pendente",
              alertIfNonZero: true,
            },
            {
              label: "Runs com falha (total)",
              value: failedRunsTotal,
              note: "verificar logs",
              alertIfNonZero: true,
            },
            {
              label: "Empresas configuradas",
              value: companies.length,
              note: "total",
              alertIfNonZero: false,
            },
          ].map((s) => (
            <div
              key={s.label}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline",
                padding: "14px 0",
                borderTop: `1px solid ${AT.borderSoft}`,
              }}
            >
              <div>
                <div style={{ fontSize: 13, fontWeight: 500, color: AT.ink2 }}>
                  {s.label}
                </div>
                <div style={{ fontSize: 11.5, color: AT.muted2, marginTop: 2 }}>
                  {s.note}
                </div>
              </div>
              <div
                style={{
                  fontFamily: '"Geist", sans-serif',
                  fontSize: 22,
                  fontWeight: 500,
                  letterSpacing: -0.8,
                  color:
                    s.alertIfNonZero && s.value > 0
                      ? AT.warn
                      : s.value === 0
                        ? AT.ok
                        : AT.ink2,
                }}
              >
                {s.value}
              </div>
            </div>
          ))}
        </div>
      </div>
      <style>{`
        @media (max-width: 639px) {
          .admin-main-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </AdminPageWrap>
  );
}
