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
import {
  buildDashboardTestHistoryView,
  buildDashboardTestMetrics,
  extractDashboardAnalysisSignal,
  getDashboardScoreColor,
} from "@/lib/dashboard-test-metrics";
import { hasAvailableCredits } from "@/lib/plan-credits";
import { getMyPlan } from "@/lib/plans-api";
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

export default async function DashboardPage() {
  const user = await getCurrentAppUserFromCookies();
  const redirectPath = getRouteAccessRedirectPath("/dashboard", user);
  if (redirectPath) redirect(redirectPath);

  if (!user) redirect(getDefaultAppRedirectPath(null));

  const [plan, adaptations] = await Promise.allSettled([
    getMyPlan(),
    listCvAdaptations(1, 20),
  ]);

  const planInfo = plan.status === "fulfilled" ? plan.value : null;
  const hasCredits =
    plan.status === "fulfilled" ? hasAvailableCredits(plan.value) : null;
  const adaptationList =
    adaptations.status === "fulfilled" ? adaptations.value.items : [];

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

  const analyzedCount = adaptationList.length;
  const generatedCount = adaptationList.filter(
    (item) => item.paymentStatus === "completed",
  ).length;
  const metrics = buildDashboardTestMetrics(
    adaptationList.map((item) => ({
      id: item.id,
      score: analysisSignalsById.get(item.id)?.score ?? null,
      improvement: analysisSignalsById.get(item.id)?.improvement ?? null,
    })),
  );

  const firstName = user.name.split(" ")[0];
  const isFreePlan = planInfo?.planType === "free";
  const freeTotalAnalyses =
    planInfo?.planType === "free" && planInfo.creditsRemaining !== null
      ? analyzedCount + planInfo.creditsRemaining
      : analyzedCount;
  const creditsAvailableLabel =
    planInfo?.creditsRemaining === null
      ? "Ilimitado"
      : String(planInfo?.creditsRemaining ?? 0);

  return (
    <main className="min-h-screen bg-[#F7F7F7] text-[#111827]">
      <AppHeader userName={user.name} />

      <div className="mx-auto max-w-[980px] space-y-8 px-6 pb-16 pt-5">
        <GuestAnalysisClaimer hasCredits={hasCredits} />

        <section className="grid gap-4 rounded-xl border border-[#E5E7EB] bg-white p-6 shadow-sm md:grid-cols-4">
          <div className="md:col-span-1">
            <p className="text-sm text-[#6B7280]">Ola, {firstName}</p>
            <p className="text-xl font-bold text-[#111827]">
              Seu resumo rapido
            </p>
          </div>
          <div>
            <p className="text-sm text-[#6B7280]">CVs analisados</p>
            <p className="text-2xl font-bold text-[#111827]">{analyzedCount}</p>
          </div>
          <div>
            <p className="text-sm text-[#6B7280]">CVs gerados</p>
            <p className="text-2xl font-bold text-[#111827]">
              {generatedCount}
            </p>
          </div>
          <div>
            <p className="text-sm text-[#6B7280]">Creditos disponiveis</p>
            <div className="mt-2 flex flex-col items-start gap-2">
              <p className="text-2xl font-bold text-[#111827]">
                {creditsAvailableLabel}
              </p>
              <a
                href="/planos"
                style={{ color: "#ffffff" }}
                className="inline-flex h-9 items-center rounded-[10px] bg-[#111827] px-4 text-sm font-semibold hover:bg-[#1F2937]"
              >
                Comprar mais creditos
              </a>
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          <article className="rounded-xl border border-[#E5E7EB] bg-white p-6 shadow-sm">
            <p className="text-sm text-[#6B7280]">Score medio dos seus CVs</p>
            <p
              className="mt-2 text-3xl font-bold"
              style={{ color: getDashboardScoreColor(metrics.averageScore) }}
            >
              {metrics.averageScore}%
            </p>
          </article>
          <article className="rounded-xl border border-[#E5E7EB] bg-white p-6 shadow-sm">
            <p className="text-sm text-[#6B7280]">
              Vagas com alta compatibilidade
            </p>
            <p className="mt-2 text-3xl font-bold text-[#111827]">
              {metrics.highCompatibilityCount}
            </p>
          </article>
          <article className="rounded-xl border border-[#E5E7EB] bg-white p-6 shadow-sm">
            <p className="text-sm text-[#6B7280]">Evolucao do CV</p>
            <p className="mt-2 text-3xl font-bold text-lime-600">
              +{metrics.evolutionPercentage}%
            </p>
          </article>
        </section>

        <section className="rounded-xl border border-[#E5E7EB] bg-white p-8 shadow-md">
          <p className="text-sm font-semibold text-[#6B7280]">Proximo passo</p>
          <h1 className="mt-2 text-2xl font-bold text-[#111827]">
            Comece uma nova analise
          </h1>
          <p className="mt-1 text-base text-[#6B7280]">
            Leva menos de 2 minutos
          </p>
          <a
            href="/adaptar"
            style={{ color: "#ffffff" }}
            className="mt-6 inline-flex h-11 items-center rounded-[12px] bg-[#111827] px-6 text-sm font-semibold transition-colors hover:bg-[#1F2937]"
          >
            Analisar nova vaga
          </a>
        </section>

        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-[#111827]">
              Historico de analises
            </h2>
            <a
              href="/adaptar"
              style={{ color: "#111827" }}
              className="inline-flex h-9 items-center rounded-[10px] border border-[#E5E7EB] bg-white px-4 text-sm font-semibold"
            >
              Analisar nova vaga
            </a>
          </div>

          {adaptationList.length === 0 ? (
            <div className="rounded-xl border border-[#E5E7EB] bg-white p-8 text-center shadow-sm">
              <p className="text-base font-semibold text-[#111827]">
                Nenhuma analise ainda
              </p>
              <p className="mt-1 text-sm text-[#6B7280]">
                Envie seu CV e a descricao da vaga para ver seu primeiro
                resultado.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
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
                    className="rounded-xl border border-[#E5E7EB] bg-white p-5 shadow-sm"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-[#111827]">
                          {item.jobTitle ?? "Vaga sem titulo"}
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
                                : "#111827",
                          }}
                        >
                          {history.score !== null ? `${history.score}%` : "—"}
                        </p>
                        <p className="text-xs font-semibold text-lime-600">
                          {history.improvement !== null
                            ? `+${history.improvement}% apos otimizacao`
                            : "Evolucao indisponivel"}
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
            </div>
          )}
        </section>

        <section className="rounded-xl border border-[#E5E7EB] bg-white p-6 shadow-sm">
          {isFreePlan ? (
            <>
              <p className="text-sm font-semibold text-[#111827]">
                Voce usou {analyzedCount} de {Math.max(freeTotalAnalyses, 1)}{" "}
                analises gratuitas
              </p>
              <p className="mt-1 text-sm text-[#6B7280]">
                Ative um plano para liberar mais CVs e acelerar candidaturas.
              </p>
              <a
                href="/planos"
                style={{ color: "#111827" }}
                className="mt-4 inline-flex h-9 items-center rounded-[10px] border border-[#E5E7EB] px-4 text-sm font-semibold"
              >
                Ver planos
              </a>
            </>
          ) : (
            <>
              <p className="text-sm font-semibold text-[#111827]">
                Plano Pro ativo
              </p>
              <p className="mt-1 text-sm text-[#6B7280]">
                Continue gerando versoes otimizadas para cada vaga do seu funil.
              </p>
              <a
                href="/adaptar"
                style={{ color: "#111827" }}
                className="mt-4 inline-flex h-9 items-center rounded-[10px] border border-[#E5E7EB] px-4 text-sm font-semibold"
              >
                Gerar CV otimizado
              </a>
            </>
          )}
        </section>
      </div>
    </main>
  );
}
