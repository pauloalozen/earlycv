import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { AppHeader } from "@/components/app-header";
import { PageShell } from "@/components/page-shell";
import { ProgressRing } from "@/components/progress-ring";
import { getRouteAccessRedirectPath } from "@/lib/app-session";
import { getCurrentAppUserFromCookies } from "@/lib/app-session.server";
import { getCvAdaptationContent } from "@/lib/cv-adaptation-api";
import { extractDashboardAnalysisSignal } from "@/lib/dashboard-test-metrics";
import { toHeaderAvailableCredits } from "@/lib/header-credits";
import { getStatusConfig } from "@/lib/job-application-status";
import {
  getJobApplicationHighlightsSummary,
  listJobApplicationHighlights,
} from "@/lib/job-applications-api";
import { getMyPlan } from "@/lib/plans-api";
import { getMyMasterResume } from "@/lib/resumes-api";

export const metadata: Metadata = {
  robots: { follow: false, index: false },
  title: "Meu Perfil | EarlyCV",
};

function toNum(value: unknown): number | null {
  const n = Number(value);
  return value !== null && value !== undefined && !Number.isNaN(n) ? n : null;
}

async function resolveLegacyScore(adaptationId: string | null) {
  if (!adaptationId) return null;

  try {
    const payload = await getCvAdaptationContent(adaptationId);
    return toNum(
      extractDashboardAnalysisSignal(payload.adaptedContentJson).score,
    );
  } catch {
    return null;
  }
}

function Chevron() {
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 2l5 5-5 5" />
    </svg>
  );
}

export default async function MeuPerfilPage() {
  const user = await getCurrentAppUserFromCookies();
  const redirectPath = getRouteAccessRedirectPath("/meu-perfil", user);
  if (redirectPath) redirect(redirectPath);

  const [planResult, highlightsResult, summaryResult, masterResumeResult] =
    await Promise.allSettled([
      getMyPlan(),
      listJobApplicationHighlights(3),
      getJobApplicationHighlightsSummary(),
      getMyMasterResume(),
    ]);

  const plan = planResult.status === "fulfilled" ? planResult.value : null;
  const applicationHighlights =
    highlightsResult.status === "fulfilled" ? highlightsResult.value : [];
  const highlightsSummary =
    summaryResult.status === "fulfilled" ? summaryResult.value : null;
  const highlightsError = highlightsResult.status === "rejected";
  const masterResume =
    masterResumeResult.status === "fulfilled" ? masterResumeResult.value : null;

  const firstName = user?.name?.split(" ")[0] ?? "";
  const availableCredits = toHeaderAvailableCredits(plan);
  const highlightsWithScores = await Promise.all(
    applicationHighlights.map(async (item) => {
      const directScore = toNum(item.bestScore);
      if (directScore !== null) {
        return { ...item, displayScore: directScore };
      }

      return {
        ...item,
        displayScore: await resolveLegacyScore(
          item.bestCvAdaptationId ?? item.currentCvAdaptationId,
        ),
      };
    }),
  );
  const kpisAvailable = highlightsSummary !== null;
  const profileCompletion = masterResume ? 80 : 0;
  const profileSuggestions = masterResume ? 2 : 0;

  return (
    <PageShell>
      <main
        className="min-h-screen text-[#0a0a0a]"
        style={{
          background:
            "radial-gradient(ellipse 80% 40% at 50% 0%, #f9f8f4 0%, #ecebe5 100%)",
        }}
      >
        <AppHeader
          userName={user?.name ?? undefined}
          userRole={user?.internalRole ?? null}
          availableCredits={availableCredits}
        />

        <div className="mx-auto max-w-[1100px] px-6 pb-20 pt-[88px] md:px-8 lg:px-10">
          <div className="space-y-4">
            {/* 1 · Saudação */}
            <h1 className="text-[clamp(36px,4vw,44px)] font-medium leading-none tracking-[-0.04em]">
              Olá{firstName ? `, ${firstName}` : ""}{" "}
              <em
                className="not-italic font-normal text-[#5a5a55]"
                style={{ fontFamily: "var(--font-instrument-serif)" }}
              >
                tudo certo por aqui.
              </em>
            </h1>

            {/* 2 · Créditos */}
            <div className="flex flex-wrap items-center justify-between gap-4 rounded-[14px] border border-[rgba(10,10,10,0.08)] bg-[#fafaf6] px-5 py-4">
              <div>
                <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-[#8a8a85]">
                  Créditos de download
                </p>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="text-2xl font-semibold tracking-tight tabular-nums text-[#0a0a0a]">
                    {availableCredits}
                  </span>
                  <span className="text-[13.5px] text-[#5a5a55]">
                    créditos disponíveis
                  </span>
                </div>
              </div>
              <Link
                href="/planos"
                className="shrink-0 rounded-[8px] bg-[#0a0a0a] px-4 py-2.5 text-[13px] font-medium transition-colors hover:bg-[#1a1a1a]"
                style={{ color: "#fafaf6" }}
              >
                Comprar créditos
              </Link>
            </div>

            {/* 3 + 4 · Status do perfil + Adaptar CV */}
            <div className="grid gap-4 lg:grid-cols-[1fr_0.62fr]">
              {/* Status — clicável, roteia para Meu CV Master */}
              <Link href="/meu-cv-master" className="group block">
                <div className="flex h-full flex-col gap-5 rounded-[14px] border border-[rgba(10,10,10,0.08)] bg-[#fafaf6] p-6 transition-[border-color,box-shadow,transform] duration-150 group-hover:-translate-y-px group-hover:border-[rgba(10,10,10,0.16)] group-hover:shadow-[0_12px_32px_-14px_rgba(10,10,10,0.22)]">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-[#8a8a85]">
                      Status do perfil
                    </p>
                    <span className="flex items-center gap-1.5 text-[12.5px] font-medium text-[#8a8a85] transition-[gap,color] duration-150 group-hover:gap-2.5 group-hover:text-[#0a0a0a]">
                      Abrir Meu CV Master
                      <Chevron />
                    </span>
                  </div>

                  <div className="flex items-center gap-6">
                    <ProgressRing value={profileCompletion} />
                    <div className="flex-1">
                      <p className="text-[23px] font-medium leading-tight tracking-[-0.03em]">
                        Perfil {profileCompletion}%{" "}
                        <em
                          className="not-italic font-normal"
                          style={{ fontFamily: "var(--font-instrument-serif)" }}
                        >
                          completo.
                        </em>
                      </p>
                      <p className="mt-1.5 max-w-[440px] text-[13px] leading-relaxed text-[#5a5a55]">
                        {masterResume
                          ? "Você confere e corrige o que a IA extraiu do seu PDF. Quanto mais completo, melhores as adaptações."
                          : "Cadastre o CV base para liberar o fluxo completo de adaptação."}
                      </p>
                      {profileSuggestions > 0 && (
                        <div className="mt-3.5 flex flex-wrap items-center gap-2">
                          <span className="font-mono text-[10px] tracking-[0.03em] text-[#8a8a85]">
                            {profileSuggestions} sugestões da IA:
                          </span>
                          <span
                            className="rounded-full px-[11px] py-[5px] text-[12px] font-medium"
                            style={{
                              color: "#3a5008",
                              background: "rgba(198,255,58,0.18)",
                              border: "1px solid rgba(110,150,20,0.22)",
                            }}
                          >
                            Adicione seu telefone
                          </span>
                          <span
                            className="rounded-full px-[11px] py-[5px] text-[12px] font-medium"
                            style={{
                              color: "#3a5008",
                              background: "rgba(198,255,58,0.18)",
                              border: "1px solid rgba(110,150,20,0.22)",
                            }}
                          >
                            Fortaleça seu resumo
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </Link>

              {/* Próximo passo — Adaptar CV */}
              <div
                className="flex flex-col justify-center rounded-[14px] p-6"
                style={{
                  background: "#0a0a0a",
                  color: "#fafaf6",
                  boxShadow: "0 20px 50px -18px rgba(10,10,10,0.4)",
                }}
              >
                <p className="flex items-center gap-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-[#7a7a74]">
                  <span className="size-1.5 rounded-full bg-[#c6ff3a]" />
                  Próximo passo
                </p>
                <p className="mt-4 text-[30px] font-medium leading-tight tracking-[-0.05em]">
                  Analisar{" "}
                  <em
                    className="not-italic text-[#c6ff3a]"
                    style={{ fontFamily: "var(--font-instrument-serif)" }}
                  >
                    nova vaga.
                  </em>
                </p>
                <p className="mt-2 text-[13.5px] leading-relaxed text-[#a0a098]">
                  Leva menos de 2 minutos
                </p>
                <Link
                  href="/adaptar"
                  className="mt-5 inline-flex w-fit items-center gap-2 rounded-[10px] px-[18px] py-3 text-[14px] font-semibold transition-opacity hover:opacity-90"
                  style={{
                    background: "#c6ff3a",
                    color: "#0a0a0a",
                    boxShadow: "0 6px 14px rgba(198,255,58,0.2)",
                  }}
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 14 14"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M3 11L11 3M11 3H6M11 3v5" />
                  </svg>
                  Adaptar meu CV →
                </Link>
              </div>
            </div>

            {/* 5 · KPIs */}
            <div className="grid gap-3 md:grid-cols-3">
              {[
                {
                  label: "Candidaturas ativas",
                  value: kpisAvailable
                    ? String(highlightsSummary.activeApplicationsCount)
                    : "Erro ao carregar",
                  accent: false,
                },
                {
                  label: "CVs analisados",
                  value: kpisAvailable
                    ? String(highlightsSummary.analyzedCvsCount)
                    : "Erro ao carregar",
                  accent:
                    kpisAvailable && highlightsSummary.analyzedCvsCount > 0,
                },
                {
                  label: "Score médio",
                  value: !kpisAvailable
                    ? "Erro ao carregar"
                    : highlightsSummary.averageScore === null
                      ? "—"
                      : `${highlightsSummary.averageScore}%`,
                  accent:
                    kpisAvailable && highlightsSummary.averageScore !== null,
                },
              ].map((kpi) => (
                <div
                  key={kpi.label}
                  className="rounded-[12px] border border-[rgba(10,10,10,0.08)] bg-[#fafaf6] px-5 py-4"
                >
                  <p className="font-mono text-[10px] font-medium uppercase tracking-[0.1em] text-[#8a8a85]">
                    {kpi.label}
                  </p>
                  <p
                    className="mt-1.5 text-[32px] font-medium leading-none tracking-[-0.05em] tabular-nums"
                    style={{ color: kpi.accent ? "#2a6a10" : "#0a0a0a" }}
                  >
                    {kpi.value}
                  </p>
                </div>
              ))}
            </div>

            {/* 6 · Candidaturas recentes */}
            <div>
              <div className="mb-3 flex items-center justify-between">
                <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-[#8a8a85]">
                  Candidaturas recentes
                </p>
                <Link
                  href="/candidaturas"
                  className="flex items-center gap-1.5 text-[12.5px] font-medium text-[#5a5a55] transition-colors hover:text-[#0a0a0a]"
                >
                  Ver todas <Chevron />
                </Link>
              </div>

              <div className="rounded-[14px] border border-[rgba(10,10,10,0.08)] bg-[#fafaf6] px-6 py-2">
                {highlightsError ? (
                  <div className="py-6 text-center">
                    <p className="text-[13px] text-[#5a5a55]">
                      Não foi possível carregar as candidaturas. Recarregue a
                      página.
                    </p>
                  </div>
                ) : highlightsWithScores.length === 0 ? (
                  <div className="py-8 text-center">
                    <p className="text-[14.5px] font-medium text-[#0a0a0a]">
                      Você ainda não tem candidaturas
                    </p>
                    <p className="mt-1 text-[13px] text-[#5a5a55]">
                      Comece pela primeira adaptação para preencher este painel.
                    </p>
                  </div>
                ) : (
                  highlightsWithScores.map((item) => {
                    const status = getStatusConfig(item.status);
                    const scoreNum = item.displayScore;
                    const scoreText =
                      scoreNum !== null ? `${Math.round(scoreNum)}%` : "—";

                    return (
                      <Link
                        key={item.id}
                        href={`/candidaturas/${item.id}`}
                        className="flex items-center gap-4 border-t border-[rgba(10,10,10,0.06)] py-[22px] first:border-t-0 transition-opacity hover:opacity-75"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-[14.5px] font-medium leading-tight tracking-[-0.01em] text-[#0a0a0a]">
                            {item.jobTitle}
                          </p>
                          <p className="mt-0.5 font-mono text-[10.5px] text-[#8a8a85]">
                            {item.companyName}
                          </p>
                        </div>
                        <span
                          className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-[10px] py-[4px] font-mono text-[10.5px] font-medium"
                          style={{
                            background: status.bg,
                            color: status.color,
                            border: `1px solid ${status.border}`,
                          }}
                        >
                          <span
                            className="size-1.5 rounded-full"
                            style={{ background: status.dot }}
                          />
                          {status.label}
                        </span>
                        <div className="w-14 shrink-0 text-right">
                          <p className="font-mono text-[9px] text-[#8a8a85]">
                            SCORE
                          </p>
                          <p
                            className="text-[17px] font-medium leading-tight tracking-[-0.03em] tabular-nums"
                            style={{
                              color: scoreNum !== null ? "#2a6a10" : "#8a8a85",
                            }}
                          >
                            {scoreText}
                          </p>
                        </div>
                        <svg
                          width="12"
                          height="12"
                          viewBox="0 0 12 12"
                          fill="none"
                          stroke="#8a8a85"
                          strokeWidth="1.7"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="shrink-0"
                          aria-hidden="true"
                        >
                          <path d="M3 2l5 5-5 5" />
                        </svg>
                      </Link>
                    );
                  })
                )}
              </div>
            </div>

            {/* 7 · Zona de perigo */}
            <div className="mt-8">
              <div className="mb-6 flex items-center gap-4">
                <div className="h-px flex-1 bg-[rgba(154,61,40,0.18)]" />
                <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-[#9a3d28]">
                  Zona de perigo
                </p>
                <div className="h-px flex-1 bg-[rgba(154,61,40,0.18)]" />
              </div>
            <div
              className="flex flex-wrap items-center justify-between gap-5 rounded-[12px] px-5 py-4"
              style={{
                background: "rgba(154,61,40,0.06)",
                border: "1px solid rgba(154,61,40,0.28)",
              }}
            >
              <div>
                <p className="text-[15px] font-semibold tracking-[-0.01em] text-[#9a3d28]">
                  Excluir conta
                </p>
                <p className="mt-0.5 max-w-[520px] text-[12.5px] leading-relaxed text-[#5a5a55]">
                  Remove seu CV Master, análises e candidaturas. Esta ação é
                  permanente, não dá para desfazer.
                </p>
              </div>
              <Link
                href="/conta/excluir"
                className="shrink-0 rounded-[8px] px-4 py-2.5 text-[13px] font-medium transition-colors hover:bg-[rgba(154,61,40,0.1)]"
                style={{
                  color: "#9a3d28",
                  border: "1px solid rgba(154,61,40,0.28)",
                }}
              >
                Excluir conta
              </Link>
            </div>
            </div>
          </div>
        </div>
      </main>
    </PageShell>
  );
}
