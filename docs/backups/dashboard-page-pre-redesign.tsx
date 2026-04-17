import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AppHeader } from "@/components/app-header";
import {
  getDefaultAppRedirectPath,
  getRouteAccessRedirectPath,
} from "@/lib/app-session";
import { getCurrentAppUserFromCookies } from "@/lib/app-session.server";
import { getHistoryActions } from "@/lib/cv-adaptation-actions";
import {
  getCvAdaptationContent,
  listCvAdaptations,
} from "@/lib/cv-adaptation-api";
import { DASHBOARD_METRIC_LABELS } from "@/lib/dashboard-copy";
import {
  buildDashboardTestHistoryView,
  buildDashboardTestMetrics,
  extractDashboardAnalysisSignal,
  getDashboardScoreColor,
} from "@/lib/dashboard-test-metrics";
import { hasAvailableCredits } from "@/lib/plan-credits";
import { getMyPlan } from "@/lib/plans-api";
import { getMyMasterResume } from "@/lib/resumes-api";
import { GuestAnalysisClaimer } from "./guest-analysis-claimer";
import { HistoryActionLinks } from "./history-action-links";

export const metadata: Metadata = {
  robots: { follow: false, index: false },
  title: "Dashboard | EarlyCV",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

type DashboardPageProps = {
  searchParams: Promise<{ plan?: string; page?: string; limit?: string }>;
};

const DASHBOARD_PAGE_SIZES = [10, 20, 50] as const;

function parsePage(value: string | undefined) {
  const parsed = Number.parseInt(value ?? "1", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function parseLimit(value: string | undefined) {
  const parsed = Number.parseInt(value ?? "10", 10);
  return DASHBOARD_PAGE_SIZES.includes(
    parsed as (typeof DASHBOARD_PAGE_SIZES)[number],
  )
    ? parsed
    : 10;
}

function buildDashboardQuery(params: {
  plan?: string;
  page: number;
  limit: number;
}) {
  const query = new URLSearchParams();
  if (params.plan) query.set("plan", params.plan);
  query.set("page", String(params.page));
  query.set("limit", String(params.limit));
  return `/dashboard?${query.toString()}`;
}

export default async function DashboardPage({
  searchParams,
}: DashboardPageProps) {
  const user = await getCurrentAppUserFromCookies();
  const redirectPath = getRouteAccessRedirectPath("/dashboard", user);
  if (redirectPath) redirect(redirectPath);

  if (!user) redirect(getDefaultAppRedirectPath(null));

  const params = await searchParams;
  const showPlanActivated = params.plan === "activated";
  const currentPage = parsePage(params.page);
  const currentLimit = parseLimit(params.limit);

  const [plan, adaptations, masterResumeResponse] = await Promise.allSettled([
    getMyPlan(),
    listCvAdaptations(currentPage, currentLimit),
    getMyMasterResume(),
  ]);

  const planInfo = plan.status === "fulfilled" ? plan.value : null;
  const hasCredits =
    plan.status === "fulfilled" ? hasAvailableCredits(plan.value) : null;
  const adaptationList =
    adaptations.status === "fulfilled" ? adaptations.value.items : [];
  const adaptationTotal =
    adaptations.status === "fulfilled" ? adaptations.value.total : 0;
  const totalPages = Math.max(1, Math.ceil(adaptationTotal / currentLimit));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const startItem =
    adaptationTotal === 0 ? 0 : (safeCurrentPage - 1) * currentLimit + 1;
  const endItem = Math.min(adaptationTotal, safeCurrentPage * currentLimit);
  const masterResume =
    masterResumeResponse.status === "fulfilled"
      ? masterResumeResponse.value
      : null;

  const isPlanInfoUnavailable = !planInfo;
  const availableDownloadCredits = isPlanInfoUnavailable
    ? "—"
    : planInfo.creditsRemaining === null
      ? "Ilimitado"
      : planInfo.creditsRemaining;
  const analysisSignalsById = new Map<
    string,
    { score: number | null; improvement: number | null }
  >();

  const contentResponses = await Promise.allSettled(
    adaptationList.map(async (item) => {
      const content = await getCvAdaptationContent(item.id);
      return {
        id: item.id,
        signal: extractDashboardAnalysisSignal(content.adaptedContentJson),
      };
    }),
  );

  for (const response of contentResponses) {
    if (response.status === "fulfilled") {
      analysisSignalsById.set(response.value.id, response.value.signal);
    }
  }

  const metrics = buildDashboardTestMetrics(
    adaptationList.map((item) => ({
      id: item.id,
      score: analysisSignalsById.get(item.id)?.score ?? null,
      improvement: analysisSignalsById.get(item.id)?.improvement ?? null,
    })),
  );

  return (
    <main className="min-h-screen bg-[#FAFAFA] text-[#111111]">
      <AppHeader userName={user.name} backgroundColor="#FAFAFA" />

      <div className="mx-auto max-w-[860px] space-y-8 px-6 pb-20 pt-4">
        <GuestAnalysisClaimer />

        {showPlanActivated && (
          <div className="flex items-center gap-2 rounded-xl border border-lime-200 bg-lime-50 px-5 py-3">
            <span className="text-lime-600">✔</span>
            <p className="text-sm font-semibold text-lime-800">
              Plano ativado com sucesso!
            </p>
          </div>
        )}

        <div className="px-1 pt-2">
          <h1 className="text-2xl font-bold tracking-tight text-[#111111]">
            Olá, {user.name.split(" ")[0]}
          </h1>
        </div>

        <section className="rounded-xl border border-[#E5E7EB] bg-white px-5 py-4 shadow-sm">
          <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-[#BBBBBB]">
            Visão geral
          </p>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-xs text-[#999999]">Créditos de download</p>
              <p className="mt-0.5 text-lg font-bold leading-none text-[#111111]">
                {availableDownloadCredits}
              </p>
            </div>
            <a
              href="/planos"
              style={{ color: "#ffffff" }}
              className="shrink-0 rounded-[10px] bg-[#111111] px-4 py-2 text-sm font-medium"
            >
              Comprar créditos
            </a>
          </div>
        </section>

        <div className="grid gap-4 md:grid-cols-2">
          <section className="rounded-xl border border-[#E5E7EB] bg-white p-6 shadow-sm">
            {masterResume ? (
              <div className="space-y-4">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-widest text-[#AAAAAA]">
                    CV Master
                  </p>
                  <h2 className="mt-2 text-xl font-bold text-[#111111]">
                    Seu CV base está pronto
                  </h2>
                  <p className="mt-1 text-sm text-[#666666]">
                    Você pode usá-lo em novas análises
                  </p>
                </div>

                <div className="rounded-xl border border-[#F2F2F2] bg-[#FAFAFA] p-4">
                  <p className="truncate text-sm font-semibold text-[#111111]">
                    {masterResume.title}
                  </p>
                  {masterResume.sourceFileName && (
                    <p className="mt-1 truncate text-sm text-[#666666]">
                      Arquivo: {masterResume.sourceFileName}
                    </p>
                  )}
                  <p className="mt-1 text-sm text-[#666666]">
                    Atualizado em {formatDate(masterResume.updatedAt)}
                  </p>
                </div>

                <div className="flex flex-wrap gap-3">
                  <a
                    href="/cv-base"
                    style={{ color: "#ffffff" }}
                    className="inline-flex h-11 items-center rounded-[10px] bg-[#111111] px-5 text-sm font-medium"
                  >
                    Atualizar CV
                  </a>
                  <a
                    href={`/api/resumes/${masterResume.id}/download`}
                    target="_blank"
                    rel="noreferrer"
                    style={{ color: "#111111" }}
                    className="inline-flex h-11 items-center rounded-[10px] border border-[#E5E5E5] bg-white px-5 text-sm font-medium"
                  >
                    Ver CV
                  </a>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-widest text-[#AAAAAA]">
                    CV Master
                  </p>
                  <h2 className="mt-2 text-xl font-bold text-[#111111]">
                    Cadastre seu CV base
                  </h2>
                  <p className="mt-1 text-sm text-[#666666]">
                    Evite subir seu currículo toda vez. Use um CV base para
                    todas as análises.
                  </p>
                </div>

                <a
                  href="/cv-base"
                  style={{ color: "#ffffff" }}
                  className="inline-flex h-11 items-center rounded-[10px] bg-[#111111] px-5 text-sm font-medium"
                >
                  Cadastrar CV
                </a>
              </div>
            )}
          </section>

          <section className="rounded-xl border border-[#E5E7EB] bg-white p-8 shadow-sm flex flex-col items-center justify-center text-center">
            <p className="text-[11px] font-bold uppercase tracking-widest text-[#AAAAAA]">
              Próximo passo
            </p>
            <h2 className="mt-2 text-2xl font-bold text-[#111111]">
              Analisar nova vaga
            </h2>
            <p className="mt-1 text-sm text-[#666666]">
              Leva menos de 2 minutos
            </p>
            <a
              href="/adaptar"
              style={{ color: "#ffffff" }}
              className="mt-6 inline-flex h-14 items-center justify-center rounded-[14px] bg-[#111111] px-10 text-sm font-semibold"
            >
              Analisar nova vaga
            </a>
          </section>
        </div>

        <section className="grid gap-4 md:grid-cols-3">
          <article className="rounded-xl border border-[#E5E7EB] bg-white p-6 shadow-sm">
            <p className="text-sm text-[#666666]">
              {DASHBOARD_METRIC_LABELS.averageScore}
            </p>
            <p
              className="mt-2 text-3xl font-bold"
              style={{ color: getDashboardScoreColor(metrics.averageScore) }}
            >
              {metrics.averageScore}%
            </p>
          </article>

          <article className="rounded-xl border border-[#E5E7EB] bg-white p-6 shadow-sm">
            <p className="text-sm text-[#666666]">
              {DASHBOARD_METRIC_LABELS.matchCount}
            </p>
            <p className="mt-2 text-3xl font-bold text-[#111111]">
              {metrics.highCompatibilityCount}
            </p>
          </article>

          <article className="rounded-xl border border-[#E5E7EB] bg-white p-6 shadow-sm">
            <p className="text-sm text-[#666666]">
              {DASHBOARD_METRIC_LABELS.recentImprovement}
            </p>
            <p className="mt-2 text-3xl font-bold text-lime-600">
              +{metrics.evolutionPercentage}%
            </p>
          </article>
        </section>

        <div className="rounded-xl bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#F2F2F2] px-6 py-4">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-widest text-[#AAAAAA]">
                Histórico de análises
              </p>
              <p className="mt-1 text-xs text-[#888888]">
                {adaptationTotal === 0
                  ? "Nenhuma análise registrada"
                  : `Mostrando ${startItem}-${endItem} de ${adaptationTotal}`}
              </p>
            </div>

            <div className="flex items-center gap-1.5 rounded-lg border border-[#EDEDED] bg-[#FAFAFA] p-1">
              {DASHBOARD_PAGE_SIZES.map((size) => {
                const isActive = currentLimit === size;
                return (
                  <a
                    key={size}
                    href={buildDashboardQuery({
                      plan: params.plan,
                      page: 1,
                      limit: size,
                    })}
                    style={{ color: isActive ? "#FFFFFF" : "#666666" }}
                    className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${
                      isActive ? "bg-[#111111]" : "hover:bg-white"
                    }`}
                  >
                    {size}
                  </a>
                );
              })}
            </div>
          </div>

          {adaptationList.length === 0 ? (
            <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
              <p className="text-base font-medium text-[#111111]">
                Nenhuma análise ainda
              </p>
              <p className="text-sm text-[#666666]">
                Envie seu CV e a descrição de uma vaga para começar.
              </p>
              <a
                href="/adaptar"
                style={{ color: "#ffffff" }}
                className="mt-2 rounded-[14px] bg-[#111111] px-6 py-3 text-sm font-medium"
              >
                Analisar meu CV
              </a>
            </div>
          ) : (
            <div className="space-y-3 p-3">
              {adaptationList.map((item) => {
                const actions = getHistoryActions(item);
                const history = buildDashboardTestHistoryView({
                  id: item.id,
                  score: analysisSignalsById.get(item.id)?.score ?? null,
                  improvement:
                    analysisSignalsById.get(item.id)?.improvement ?? null,
                });

                return (
                  <article
                    key={item.id}
                    className="rounded-xl border border-[#F2F2F2] bg-white p-5"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-[#111111]">
                          {item.jobTitle ?? "Vaga sem título"}
                          {item.companyName ? ` · ${item.companyName}` : ""}
                        </p>
                        <p className="mt-1 text-xs text-[#6B7280]">
                          {formatDate(item.createdAt)}
                        </p>
                      </div>

                      <div className="text-right">
                        <p className="text-xs text-[#6B7280]">Score</p>
                        <p
                          className="text-lg font-bold"
                          style={{
                            color:
                              history.score !== null
                                ? getDashboardScoreColor(history.score)
                                : "#111111",
                          }}
                        >
                          {history.score !== null ? `${history.score}%` : "—"}
                        </p>
                        <p className="text-xs font-semibold text-lime-600">
                          {history.improvement !== null
                            ? `+${history.improvement}% após otimização`
                            : "Evolução indisponível"}
                        </p>
                      </div>
                    </div>

                    <HistoryActionLinks
                      actions={actions}
                      hasCredits={hasCredits}
                    />
                  </article>
                );
              })}

              {totalPages > 1 && (
                <div className="flex items-center justify-end gap-2 px-2 pt-2">
                  {safeCurrentPage > 1 ? (
                    <a
                      href={buildDashboardQuery({
                        plan: params.plan,
                        page: safeCurrentPage - 1,
                        limit: currentLimit,
                      })}
                      className="rounded-lg border border-[#E5E5E5] bg-white px-3 py-1.5 text-xs font-semibold text-[#111111]"
                    >
                      Anterior
                    </a>
                  ) : (
                    <span className="rounded-lg border border-[#EFEFEF] bg-[#F9F9F9] px-3 py-1.5 text-xs font-semibold text-[#BBBBBB]">
                      Anterior
                    </span>
                  )}

                  <span className="px-2 text-xs font-semibold text-[#666666]">
                    Página {safeCurrentPage} de {totalPages}
                  </span>

                  {safeCurrentPage < totalPages ? (
                    <a
                      href={buildDashboardQuery({
                        plan: params.plan,
                        page: safeCurrentPage + 1,
                        limit: currentLimit,
                      })}
                      className="rounded-lg border border-[#E5E5E5] bg-white px-3 py-1.5 text-xs font-semibold text-[#111111]"
                    >
                      Próxima
                    </a>
                  ) : (
                    <span className="rounded-lg border border-[#EFEFEF] bg-[#F9F9F9] px-3 py-1.5 text-xs font-semibold text-[#BBBBBB]">
                      Próxima
                    </span>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
