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
import {
  getAdminOverviewStats,
  getAdminPaymentsSummary,
} from "@/lib/admin-overview-api";
import {
  adminPeriodSubLabel,
  getAdminPeriodSince,
  resolveAdminPeriod,
} from "@/lib/admin-period";
import { buildAdminStateModel } from "@/lib/admin-state";
import { getAdminDataErrorKind } from "@/lib/admin-token-errors";
import { getBackofficeSessionToken } from "@/lib/backoffice-session.server";
import { buildAdminMetadata } from "@/lib/route-metadata";
import { AdminShellHeader } from "./_components/admin-shell-header";
import { AdminTokenState } from "./_components/admin-token-state";
import { type Period, PeriodSelector } from "./_components/period-selector";

export const metadata = buildAdminMetadata("Visao geral");

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
  const period = resolveAdminPeriod(rawPeriod);

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
          gridTemplateColumns: "repeat(5, 1fr)",
          gap: 12,
        }}
      >
        {[76, 77, 78, 79, 80].map((height) => (
          <div key={height} style={{ ...card, height }} />
        ))}
      </div>
      <div style={{ ...card, height: 200 }} />
    </div>
  );
}

async function OverviewContent({ period }: { period: Period }) {
  const since = getAdminPeriodSince(period);
  const sinceIso = since.toISOString();
  const subLabel = adminPeriodSubLabel(period);

  // Só agregados (COUNT/SUM no banco): a visão geral nunca carrega listas
  // de usuários, currículos, empresas, fontes ou pagamentos.
  const [statsResult, paymentsSummary] = await Promise.all([
    getAdminOverviewStats(sinceIso)
      .then((data) => ({ data, kind: "ok" }) as const)
      .catch(
        (error: unknown) => ({ kind: getAdminDataErrorKind(error) }) as const,
      ),
    getAdminPaymentsSummary(sinceIso).catch(() => null),
  ]);

  if (statsResult.kind !== "ok") {
    const state = buildAdminStateModel(statsResult.kind, "/admin");

    return (
      <div className="px-6 py-10 md:px-10">
        <AdminTokenState {...state} />
      </div>
    );
  }

  const { loggedInUsers, newUsers, totalAdaptedResumes, totalUsers } =
    statsResult.data;
  const approvedPaymentsCount = paymentsSummary?.approvedCount ?? 0;
  const revenueInCents = paymentsSummary?.revenueInCents ?? 0;
  // Pagamentos é só superadmin: sem summary (403), os cards mostram "—"
  // e não viram link pra uma tela que também seria negada.
  const approvedPaymentsHref = paymentsSummary
    ? `/admin/pagamentos?status=completed&period=${period}`
    : undefined;

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

      <AdminStatsRow cols={5}>
        <AdminStatCard
          href={`/admin/usuarios?createdPeriod=${period}`}
          label="Novos cadastros"
          value={String(newUsers)}
          sub={subLabel}
        />
        <AdminStatCard
          href={`/admin/usuarios?loginPeriod=${period}`}
          label="Usuários logados"
          tooltip="Usuários que entraram ou mantiveram sessão ativa no período"
          value={String(loggedInUsers)}
          sub={subLabel}
        />
        <AdminStatCard
          href={approvedPaymentsHref}
          label="Pagamentos aprovados"
          value={String(approvedPaymentsCount)}
          sub={subLabel}
        />
        <AdminStatCard
          href={approvedPaymentsHref}
          label="Receita"
          value={revenueInCents > 0 ? formatBRL(revenueInCents) : "—"}
          sub={subLabel}
        />
        <AdminStatCard
          href="/admin/curriculos?kind=adapted"
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
