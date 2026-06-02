import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { AppHeader } from "@/components/app-header";
import { PageShell } from "@/components/page-shell";
import { Card } from "@/components/ui/card";
import { getRouteAccessRedirectPath } from "@/lib/app-session";
import { getCurrentAppUserFromCookies } from "@/lib/app-session.server";
import { toHeaderAvailableCredits } from "@/lib/header-credits";
import { getStatusConfig } from "@/lib/job-application-status";
import { listJobApplicationHighlights } from "@/lib/job-applications-api";
import { getMyPlan } from "@/lib/plans-api";
import { getMyMasterResume } from "@/lib/resumes-api";

export const metadata: Metadata = {
  robots: { follow: false, index: false },
  title: "Meu Perfil | EarlyCV",
};

function formatSignedPercent(value: number | null) {
  if (value === null) return "—";
  return `${value > 0 ? "+" : ""}${value}%`;
}

export default async function MeuPerfilPage() {
  const user = await getCurrentAppUserFromCookies();
  const redirectPath = getRouteAccessRedirectPath("/meu-perfil", user);
  if (redirectPath) redirect(redirectPath);

  const [planResult, highlightsResult, masterResumeResult] =
    await Promise.allSettled([
      getMyPlan(),
      listJobApplicationHighlights(3),
      getMyMasterResume(),
    ]);

  const plan = planResult.status === "fulfilled" ? planResult.value : null;
  const applicationHighlights =
    highlightsResult.status === "fulfilled" ? highlightsResult.value : [];
  const masterResume =
    masterResumeResult.status === "fulfilled" ? masterResumeResult.value : null;

  const firstName = user?.name?.split(" ")[0] ?? "";
  const availableCredits = toHeaderAvailableCredits(plan);
  const scoredHighlights = applicationHighlights.filter(
    (item) => item.scorePresentation === "scored" && item.bestScore !== null,
  );
  const averageScore = scoredHighlights.length > 0
    ? Math.round(
        scoredHighlights.reduce((sum, item) => sum + (item.bestScore ?? 0), 0) /
          scoredHighlights.length,
      )
    : null;
  const bestScore =
    scoredHighlights.length > 0
      ? Math.max(...scoredHighlights.map((item) => item.bestScore ?? 0))
      : null;
  const recentImprovement =
    scoredHighlights.length >= 2
      ? (scoredHighlights[0]?.bestScore ?? 0) -
        (scoredHighlights[1]?.bestScore ?? 0)
      : null;
  const profileCompletion = masterResume ? 80 : 0;
  const profileSuggestions = masterResume ? 2 : 0;
  const profileDescription = masterResume
    ? "Perfil conectado ao CV Master e pronto para revisão."
    : "Cadastre o CV base para liberar o fluxo completo de adaptação.";

  return (
    <PageShell>
      <main className="min-h-screen bg-[#FAFAFA] text-[#111111]">
        <AppHeader
          userName={user?.name ?? undefined}
          userRole={user?.internalRole ?? null}
          availableCredits={availableCredits}
        />

        <div className="mx-auto max-w-[1100px] px-6 pb-20 pt-[88px] md:px-8 lg:px-10">
          <div className="space-y-5">
            <section className="space-y-3">
              <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-[#AAAAAA]">
                Meu Perfil
              </p>
              <h1 className="text-[clamp(28px,3.5vw,40px)] font-medium tracking-[-0.06em] text-[#111111]">
                Olá{firstName ? `, ${firstName}` : ""}
              </h1>
            </section>

            <section className="grid gap-4 lg:grid-cols-[1fr_1.1fr_1.1fr]">
              <Card className="flex h-full flex-col justify-between gap-6">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-[#AAAAAA]">
                    Créditos
                  </p>
                  <p className="mt-2 text-[28px] font-medium tracking-[-0.05em] text-[#111111]">
                    {availableCredits}
                  </p>
                  <p className="mt-1 text-sm text-[#666666]">
                    Créditos disponíveis
                  </p>
                </div>

                <div className="flex items-end justify-between gap-4">
                  <p className="max-w-[180px] text-sm text-[#666666]">
                    Use este saldo para seguir adaptando com rapidez.
                  </p>
                  <Link href="/planos" className="inline-flex h-11 items-center rounded-[10px] border border-[#E5E5E5] bg-white px-4 text-sm font-medium text-[#111111] transition-colors hover:bg-[#F5F5F5]">
                    Comprar créditos
                  </Link>
                </div>
              </Card>

              <Link href="/meu-cv-master" className="block h-full">
                <Card className="group flex h-full flex-col justify-between gap-6 transition-colors hover:border-[#CFCFCF]">
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-[#AAAAAA]">
                      Status do perfil
                    </p>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <span className="rounded-full border border-[#E5E5E5] bg-[#FAFAFA] px-2.5 py-1 text-[11px] font-semibold text-[#111111]">
                        Perfil {profileCompletion}% completo
                      </span>
                      <span className="text-[11px] uppercase tracking-[0.2em] text-[#888888]">
                        {profileSuggestions} sugestões
                      </span>
                    </div>
                    <p className="mt-4 text-[28px] font-medium tracking-[-0.05em] text-[#111111]">
                      Meu CV Master
                    </p>
                    <p className="mt-2 text-sm text-[#666666]">
                      {profileDescription}
                    </p>
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-medium text-[#111111] underline underline-offset-4">
                      Abrir CV Master
                    </span>
                    <span className="text-sm text-[#888888] transition-transform group-hover:translate-x-0.5">
                      →
                    </span>
                  </div>
                </Card>
              </Link>

              <Card
                variant="dark"
                className="flex h-full flex-col justify-between gap-6"
              >
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-[#8A8A85]">
                    Próximo passo
                  </p>
                  <h2 className="mt-3 text-[28px] font-medium tracking-[-0.05em] text-stone-50">Adaptar CV</h2>
                  <p className="mt-2 text-sm text-stone-300">Use seu perfil para adaptar o currículo sem recomeçar do zero.</p>
                </div>

                <Link
                  href="/adaptar"
                  className="inline-flex h-11 w-fit items-center rounded-[10px] bg-stone-50 px-4 text-sm font-medium text-stone-950 transition-colors hover:bg-stone-200"
                >
                  Adaptar CV
                </Link>
              </Card>
            </section>

            <section className="grid gap-4 md:grid-cols-3">
              {[
                {
                  label: "Vagas analisadas",
                  value: String(applicationHighlights.length),
                },
                {
                  label: "Melhoria recente",
                  value: formatSignedPercent(recentImprovement),
                },
                {
                  label: "Score médio",
                  value: bestScore === null ? "—" : `${averageScore ?? bestScore}%`,
                },
              ].map((metric) => (
                <Card key={metric.label} className="space-y-2">
                  <p className="text-sm text-[#666666]">{metric.label}</p>
                  <p className="text-[28px] font-medium tracking-[-0.05em] text-[#111111]">{metric.value}</p>
                </Card>
              ))}
            </section>

            <section className="space-y-4">
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-[#AAAAAA]">
                    Candidaturas recentes
                  </p>
                  <h2 className="mt-2 text-[28px] font-medium tracking-[-0.05em] text-[#111111]">
                    Histórico recente
                  </h2>
                </div>

                <Link
                  href="/candidaturas"
                  className="text-sm font-medium text-[#111111] underline underline-offset-4"
                >
                  Ver todas as candidaturas
                </Link>
              </div>

              {applicationHighlights.length === 0 ? (
                <Card className="text-center">
                  <p className="text-base font-medium text-[#111111]">
                    Você ainda não tem candidaturas
                  </p>
                  <p className="mt-1 text-sm text-[#666666]">
                    Comece pela primeira adaptação para preencher este painel.
                  </p>
                </Card>
              ) : (
                <div className="grid gap-4 lg:grid-cols-3">
                  {applicationHighlights.map((item) => {
                    const status = getStatusConfig(item.status);
                    const scoreText =
                      item.scorePresentation === "scored" &&
                      typeof item.bestScore === "number"
                        ? `${item.bestScore}%`
                        : "Sem score";

                    return (
                      <Link
                        key={item.id}
                        href={`/candidaturas/${item.id}`}
                        className="block h-full"
                      >
                        <Card className="group flex h-full flex-col justify-between gap-6 transition-colors hover:border-[#CFCFCF]">
                          <div>
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-[#AAAAAA]">
                                  {status.label}
                                </p>
                                <p className="mt-2 text-lg font-medium tracking-[-0.03em] text-[#111111]">
                                  {item.jobTitle}
                                </p>
                                <p className="mt-1 text-sm text-[#666666]">
                                  {item.companyName}
                                </p>
                              </div>
                              <span className="rounded-full border border-[#E5E5E5] bg-[#FAFAFA] px-2.5 py-1 text-[11px] font-semibold text-[#111111]">
                                {scoreText}
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center justify-between gap-3">
                            <span className="text-sm text-[#666666]">
                              {item.bestCvState === "ready"
                                ? "Pronta para análise"
                                : "Aguardando processamento"}
                            </span>
                            <span className="text-sm font-medium text-[#111111] underline underline-offset-4">
                              Abrir
                            </span>
                          </div>
                        </Card>
                      </Link>
                    );
                  })}
                </div>
              )}
            </section>

            <section className="grid gap-4 md:grid-cols-[1.2fr_0.8fr]">
              <Card className="space-y-3">
                <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-[#AAAAAA]">
                  Status da edição
                </p>
                <p className="text-lg font-medium tracking-[-0.03em] text-[#111111]">
                  {masterResume ? "CV Master sincronizado" : "CV Master pendente"}
                </p>
                <p className="text-sm text-[#666666]">
                  {masterResume
                    ? "Abra o CV Master para revisar blocos e lacunas antes de adaptar outra vaga."
                    : "Cadastre o CV base para liberar a revisão guiada."}
                </p>
              </Card>

              <Card variant="muted" className="space-y-3">
                <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-[#AAAAAA]">
                  Zona de perigo
                </p>
                  <p className="text-sm text-[#666666]">Exclua a conta apenas se quiser apagar seus dados e histórico.</p>
                <Link
                  href="/conta/excluir"
                  className="text-sm font-medium text-[#111111] underline underline-offset-4"
                >
                  Excluir conta
                </Link>
              </Card>
            </section>
          </div>
        </div>
      </main>
    </PageShell>
  );
}
