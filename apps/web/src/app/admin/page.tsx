import Link from "next/link";
import { Suspense } from "react";
import { buttonVariants } from "@/app/admin/_components/admin-button";
import {
  AdminPageWrap,
  AdminStatCard,
  AdminStatsRow,
  AdminTable,
  AdminTd,
  AdminTh,
  AT,
} from "@/app/admin/_components/admin-primitives";
import { DashboardAdapterTable } from "@/app/admin/_components/dashboard-adapter-table";
import { DashboardAlertsRow } from "@/app/admin/_components/dashboard-alerts-row";
import { RADAR_AREA_LABELS } from "@/app/radar/radar-ui";
import {
  type EnrichmentSummary,
  getEnrichmentSummary,
} from "@/lib/admin-dashboard-api";
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

function sectionLabel(text: string) {
  return (
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
      {text}
    </div>
  );
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
      <Suspense fallback={<OverviewSkeleton />}>
        <OverviewContent period={period} />
      </Suspense>
      <style>{`
        @media (max-width: 639px) {
          .admin-main-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </AdminPageWrap>
  );
}

function OverviewSkeleton() {
  const card = {
    background: AT.card,
    border: `1px solid ${AT.border}`,
    borderRadius: 10,
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div
        style={{
          height: 18,
          width: 200,
          background: AT.borderSoft,
          borderRadius: 4,
        }}
      />
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 12,
        }}
      >
        {[76, 77, 78, 79].map((height) => (
          <div key={height} style={{ ...card, height }} />
        ))}
      </div>
      <div style={{ ...card, height: 200 }} />
      <div style={{ ...card, height: 320 }} />
      <div style={{ ...card, height: 260 }} />
    </div>
  );
}

async function OverviewContent({ period }: { period: Period }) {
  const since = getSinceDate(period);
  const sinceIso = since.toISOString();
  const subLabel = periodSubLabel(period);

  const [overviewDataResult, paymentsResult, enrichmentSummary] =
    await Promise.all([
      getPhaseOneAdminDataSafely(),
      listAdminPayments({ from: sinceIso, limit: 1000 }).catch(() => null),
      getEnrichmentSummary().catch(() => null),
    ]);

  if (overviewDataResult.kind !== "ok") {
    const state = buildAdminStateModel(overviewDataResult.kind, "/admin");

    return (
      <div className="px-6 py-10 md:px-10">
        <AdminTokenState {...state} />
      </div>
    );
  }

  const { adminUsers, adminUserViews } = overviewDataResult.data;

  // ── Period-sensitive metrics ───────────────────────────────────
  const newUsers = adminUsers.filter((u) => u.createdAt >= sinceIso).length;

  const approved =
    paymentsResult?.items.filter(
      (p) => p.status === "approved" || p.status === "completed",
    ) ?? [];
  const approvedPaymentsCount = approved.length;
  const revenueInCents = approved.reduce(
    (sum, p) => sum + (p.amountInCents ?? 0),
    0,
  );

  // ── State metrics (current snapshot) ──────────────────────────
  const totalUsers = adminUsers.length;
  const totalAdaptedResumes = adminUserViews.reduce(
    (sum, u) => sum + u.adaptedResumeCount,
    0,
  );

  return (
    <>
      {/* ── Faixa 1: Negócio ───────────────────────────────────── */}
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
          label="CVs adaptados"
          value={String(totalAdaptedResumes)}
          sub="total acumulado"
        />
      </AdminStatsRow>

      {sectionLabel("PRODUTO · ESTADO ATUAL")}
      <AdminStatsRow cols={1}>
        <AdminStatCard
          label="Usuários cadastrados"
          value={String(totalUsers)}
          sub="total acumulado"
        />
      </AdminStatsRow>

      {/* ── Faixa 2: Alertas operacionais ──────────────────────── */}
      {sectionLabel("ALERTAS OPERACIONAIS")}
      <DashboardAlertsRow />

      {/* ── Faixa 3: Captura por adapter ───────────────────────── */}
      {sectionLabel("CAPTURA · POR ADAPTER")}
      <div style={{ marginBottom: 20 }}>
        <DashboardAdapterTable />
      </div>

      {/* ── Faixa 4: Enriquecimento ─────────────────────────────── */}
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          marginBottom: 12,
        }}
      >
        {sectionLabel("ENRIQUECIMENTO · ÚLTIMAS 24H")}
        <Link
          href="/admin/ingestion/filter"
          style={{
            fontSize: 12,
            color: AT.muted,
            textDecoration: "none",
            fontWeight: 500,
          }}
        >
          ver enriquecimento →
        </Link>
      </div>
      <EnrichmentSection summary={enrichmentSummary} />
    </>
  );
}

function EnrichmentSection({
  summary,
}: {
  summary: EnrichmentSummary | null;
}) {
  return (
    <>
      <div
        className="admin-main-grid"
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 16,
          marginBottom: 16,
        }}
      >
        <EnrichmentMetricsCard summary={summary} />
        <EnrichmentByAreaCard summary={summary} />
      </div>
      <PortalByAreaTable summary={summary} />
    </>
  );
}

function EnrichmentMetricsCard({
  summary,
}: {
  summary: EnrichmentSummary | null;
}) {
  const last24h = summary?.last24h;
  const tiles = [
    { label: "Enriquecidas", value: last24h?.enriched },
    { label: "Descartadas", value: last24h?.skipped },
    {
      label: "Taxa",
      value:
        last24h != null ? `${last24h.approvalRate.toFixed(1)}%` : undefined,
    },
    { label: "Pendentes", value: last24h?.pending },
  ];

  return (
    <div
      style={{
        background: AT.card,
        border: `1px solid ${AT.border}`,
        borderRadius: 10,
        padding: "18px",
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, 1fr)",
          gap: 14,
        }}
      >
        {tiles.map((tile) => (
          <div key={tile.label}>
            <div
              style={{
                fontFamily: '"Geist Mono", monospace',
                fontSize: 10,
                letterSpacing: 1.1,
                color: AT.muted2,
                fontWeight: 500,
                textTransform: "uppercase",
              }}
            >
              {tile.label}
            </div>
            <div
              style={{
                fontSize: 26,
                fontWeight: 500,
                letterSpacing: -1,
                color: AT.ink2,
                marginTop: 6,
              }}
            >
              {tile.value ?? "—"}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function EnrichmentByAreaCard({
  summary,
}: {
  summary: EnrichmentSummary | null;
}) {
  const byArea = summary?.byArea ?? [];
  const top = byArea.slice(0, 5);
  const restTotal = byArea
    .slice(5)
    .reduce((sum, item) => sum + item.count, 0);
  const items = [
    ...top.map((item) => ({
      label: RADAR_AREA_LABELS[item.area] ?? item.area,
      count: item.count,
    })),
    ...(restTotal > 0 ? [{ label: "Outros", count: restTotal }] : []),
  ];
  const max = Math.max(1, ...items.map((item) => item.count));

  return (
    <div
      style={{
        background: AT.card,
        border: `1px solid ${AT.border}`,
        borderRadius: 10,
        padding: "18px",
      }}
    >
      <div
        style={{
          fontFamily: '"Geist Mono", monospace',
          fontSize: 10,
          letterSpacing: 1.1,
          color: AT.muted2,
          fontWeight: 500,
          textTransform: "uppercase",
          marginBottom: 12,
        }}
      >
        Por área
      </div>
      {items.length === 0 ? (
        <div style={{ fontSize: 13, color: AT.muted }}>
          Sem vagas enriquecidas nas últimas 24h.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {items.map((item) => (
            <div
              key={item.label}
              style={{ display: "flex", alignItems: "center", gap: 10 }}
            >
              <div
                style={{ fontSize: 12, color: AT.ink2, width: 170, flexShrink: 0 }}
              >
                {item.label}
              </div>
              <div
                style={{
                  flex: 1,
                  background: AT.borderSoft,
                  borderRadius: 4,
                  height: 8,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    width: `${Math.round((item.count / max) * 100)}%`,
                    background: AT.ink2,
                    height: "100%",
                    borderRadius: 4,
                  }}
                />
              </div>
              <div
                style={{
                  fontFamily: '"Geist Mono", monospace',
                  fontSize: 12,
                  color: AT.muted,
                  width: 28,
                  textAlign: "right",
                  flexShrink: 0,
                }}
              >
                {item.count}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PortalByAreaTable({
  summary,
}: {
  summary: EnrichmentSummary | null;
}) {
  const portalByArea = summary?.portalByArea ?? [];
  const pendingEnrichment = summary?.pendingEnrichment ?? 0;

  const totalActive = portalByArea.reduce((sum, row) => sum + row.active, 0);
  const totalInactive = portalByArea.reduce(
    (sum, row) => sum + row.inactive,
    0,
  );
  const grandTotal = totalActive + totalInactive + pendingEnrichment;

  return (
    <div>
      <div
        style={{
          fontFamily: '"Geist Mono", monospace',
          fontSize: 10.5,
          letterSpacing: 1.2,
          color: AT.muted2,
          fontWeight: 500,
          margin: "16px 0 12px",
        }}
      >
        VAGAS NO PORTAL · POR ÁREA
      </div>
      <AdminTable>
        <thead>
          <tr>
            <AdminTh>Área</AdminTh>
            <AdminTh align="right">Ativas</AdminTh>
            <AdminTh align="right">Inativas</AdminTh>
            <AdminTh align="right">Aguard. enriq.</AdminTh>
            <AdminTh align="right">Total</AdminTh>
          </tr>
        </thead>
        <tbody>
          {portalByArea.length === 0 ? (
            <tr>
              <AdminTd muted>Sem dados de enriquecimento ainda.</AdminTd>
            </tr>
          ) : (
            portalByArea.map((row) => (
              <tr key={row.area}>
                <AdminTd>{row.areaLabel}</AdminTd>
                <AdminTd align="right" mono>
                  {row.active}
                </AdminTd>
                <AdminTd align="right" mono muted>
                  {row.inactive}
                </AdminTd>
                <AdminTd align="right" mono muted>
                  0
                </AdminTd>
                <AdminTd align="right" mono>
                  {row.total}
                </AdminTd>
              </tr>
            ))
          )}
          <tr>
            <AdminTd muted>Sem classificação (aguardando enriquecimento)</AdminTd>
            <AdminTd align="right" mono muted>
              0
            </AdminTd>
            <AdminTd align="right" mono muted>
              0
            </AdminTd>
            <AdminTd align="right" mono>
              {pendingEnrichment}
            </AdminTd>
            <AdminTd align="right" mono>
              {pendingEnrichment}
            </AdminTd>
          </tr>
          <tr>
            <AdminTd>
              <strong>Total</strong>
            </AdminTd>
            <AdminTd align="right" mono>
              <strong>{totalActive}</strong>
            </AdminTd>
            <AdminTd align="right" mono>
              <strong>{totalInactive}</strong>
            </AdminTd>
            <AdminTd align="right" mono>
              <strong>{pendingEnrichment}</strong>
            </AdminTd>
            <AdminTd align="right" mono>
              <strong>{grandTotal}</strong>
            </AdminTd>
          </tr>
        </tbody>
      </AdminTable>
    </div>
  );
}
