import Link from "next/link";
import { Suspense } from "react";
import { ActivityMetricsSection } from "@/app/admin/_components/activity-metrics-section";
import { buttonVariants } from "@/app/admin/_components/admin-button";
import {
  AdminPageWrap,
  AdminStatCard,
  AdminStatsRow,
  AT,
} from "@/app/admin/_components/admin-primitives";
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
    </div>
  );
}

async function OverviewContent({ period }: { period: Period }) {
  const since = getSinceDate(period);
  const sinceIso = since.toISOString();
  const subLabel = periodSubLabel(period);

  const [overviewDataResult, paymentsResult] = await Promise.all([
    getPhaseOneAdminDataSafely(),
    listAdminPayments({ from: sinceIso, limit: 1000 }).catch(() => null),
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

      <ActivityMetricsSection />

      {sectionLabel("PRODUTO · ESTADO ATUAL")}
      <AdminStatsRow cols={1}>
        <AdminStatCard
          label="Usuários cadastrados"
          value={String(totalUsers)}
          sub="total acumulado"
        />
      </AdminStatsRow>
    </>
  );
}
