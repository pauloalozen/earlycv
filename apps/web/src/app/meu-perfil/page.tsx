import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { PageShell } from "@/components/page-shell";
import { ProgressRing } from "@/components/progress-ring";
import { PublicFooter } from "@/components/public-footer";
import { apiRequest } from "@/lib/api-request";
import { getRouteAccessRedirectPath } from "@/lib/app-session";
import { getCurrentAppUserFromCookies } from "@/lib/app-session.server";
import { getCvAdaptationContent } from "@/lib/cv-adaptation-api";
import { extractDashboardAnalysisSignal } from "@/lib/dashboard-test-metrics";
import { toHeaderAvailableCredits } from "@/lib/header-credits";
import { getStatusConfig } from "@/lib/job-application-status";
import {
  getJobApplicationHighlightsSummary,
  type JobApplicationDto,
  listJobApplications,
} from "@/lib/job-applications-api";
import {
  canAccessJobsInGhostMode,
  isJobsGhostModeEnabled,
} from "@/lib/jobs-ghost-mode";
import { getMonitorCount, listMonitorRecommendations } from "@/lib/monitor-api";
import { hasAvailableCredits } from "@/lib/plan-credits";
import { getMyPlan } from "@/lib/plans-api";
import { getMyMasterResume } from "@/lib/resumes-api";
import { listSavedJobs } from "@/lib/saved-jobs-api";
import { GuestAnalysisClaimer } from "../dashboard/guest-analysis-claimer";
import {
  buildProfileBlockStates,
  type UserProfileRecord,
} from "../meu-cv-master/profile-blocks";
import { DashboardColumnTabs } from "./dashboard-column-tabs";
import {
  BriefcaseIcon,
  FileCheckIcon,
  RadarIcon,
  TrendUpIcon,
} from "./dashboard-icons";
import { DeleteAccountSection } from "./delete-account-section";
import { resolveHeroState } from "./hero-state";

export const metadata: Metadata = {
  robots: { follow: false, index: false },
  title: "Meu Perfil | EarlyCV",
};

const GEIST = "var(--font-geist), -apple-system, system-ui, sans-serif";
const SERIF = "var(--font-instrument-serif)";

function matchQualityLabel(score: number): string {
  if (score >= 90) return "Excelente";
  if (score >= 75) return "Ótimo";
  if (score >= 60) return "Bom";
  return "Regular";
}

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

function ColumnCard({
  title,
  icon,
  href,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  href: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="flex h-full flex-col rounded-[14px] border border-[rgba(10,10,10,0.08)] bg-[#fafaf6] p-5"
      style={{ boxShadow: "0 1px 2px rgba(10,10,10,0.02)" }}
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="flex items-center gap-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-[#8a8a85]">
          <span className="text-[#5a5a55]">{icon}</span>
          {title}
        </p>
        <Link
          href={href}
          className="flex shrink-0 items-center gap-1 text-[11.5px] font-medium text-[#8a8a85] transition-colors hover:text-[#0a0a0a]"
        >
          Ver tudo <Chevron />
        </Link>
      </div>
      <div className="flex flex-1 flex-col gap-3">{children}</div>
    </div>
  );
}

function EmptyColumnState({ label }: { label: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-1 py-6 text-center">
      <p className="text-[13px] text-[#8a8a85]">{label}</p>
    </div>
  );
}

function CompanyAvatar({ name }: { name: string }) {
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  return (
    <span
      className="flex size-8 shrink-0 items-center justify-center rounded-full font-mono text-[12px] font-semibold text-[#5a5a55]"
      style={{ background: "rgba(10,10,10,0.06)" }}
    >
      {initial}
    </span>
  );
}

function JobPreviewRow({
  title,
  subtitle,
  tag,
}: {
  title: string;
  subtitle: string;
  tag?: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <CompanyAvatar name={subtitle} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium leading-tight text-[#0a0a0a]">
          {title}
        </p>
        <p className="truncate text-[11px] text-[#8a8a85]">{subtitle}</p>
      </div>
      {tag && (
        <span className="shrink-0 text-[11px] font-medium text-[#3a5008]">
          {tag}
        </span>
      )}
    </div>
  );
}

export default async function MeuPerfilPage() {
  const user = await getCurrentAppUserFromCookies();
  const redirectPath = getRouteAccessRedirectPath("/meu-perfil", user);
  if (redirectPath) redirect(redirectPath);

  const hasJobsAccess =
    !isJobsGhostModeEnabled() ||
    canAccessJobsInGhostMode(user?.internalRole ?? null);

  const [
    planResult,
    applicationsResult,
    summaryResult,
    masterResumeResult,
    profileResult,
    monitorCountResult,
    monitorRecommendationsResult,
    savedJobsResult,
  ] = await Promise.allSettled([
    getMyPlan(),
    listJobApplications(1, 50, false),
    getJobApplicationHighlightsSummary(),
    getMyMasterResume(),
    apiRequest("GET", "/users/profile")
      .then(async (r) => {
        if (!r.ok) return null;
        const body = await r.text();
        return body.trim() ? (JSON.parse(body) as UserProfileRecord) : null;
      })
      .catch(() => null),
    hasJobsAccess ? getMonitorCount() : Promise.resolve(null),
    hasJobsAccess ? listMonitorRecommendations(1, 3) : Promise.resolve(null),
    hasJobsAccess ? listSavedJobs(1, 3) : Promise.resolve(null),
  ]);

  const plan = planResult.status === "fulfilled" ? planResult.value : null;
  const applications: JobApplicationDto[] =
    applicationsResult.status === "fulfilled"
      ? applicationsResult.value.items
      : [];
  const applicationsError = applicationsResult.status === "rejected";
  const highlightsSummary =
    summaryResult.status === "fulfilled" ? summaryResult.value : null;
  const masterResume =
    masterResumeResult.status === "fulfilled" ? masterResumeResult.value : null;
  const profile =
    profileResult.status === "fulfilled" ? profileResult.value : null;
  const monitorCount =
    monitorCountResult.status === "fulfilled" ? monitorCountResult.value : null;
  const monitorFeed =
    monitorRecommendationsResult.status === "fulfilled"
      ? monitorRecommendationsResult.value
      : null;
  const savedJobs =
    savedJobsResult.status === "fulfilled" ? savedJobsResult.value : null;

  const firstName = user?.name?.split(" ")[0] ?? "";
  const availableCredits = toHeaderAvailableCredits(plan);
  const kpisAvailable = highlightsSummary !== null;

  const blockStates = profile ? buildProfileBlockStates(profile) : [];
  const totalFields = blockStates.reduce((sum, b) => sum + b.fields.length, 0);
  const missingTotal = blockStates.reduce((sum, b) => sum + b.missingCount, 0);
  const profileCompletion =
    totalFields > 0
      ? Math.round(((totalFields - missingTotal) / totalFields) * 100)
      : 0;

  // Candidaturas recentes exibidas na coluna, com score resolvido (mesma
  // lógica legada de fallback pra análises antigas sem bestScore direto).
  const recentApplications = applications.slice(0, 3);
  const recentApplicationsWithScores = await Promise.all(
    recentApplications.map(async (item) => {
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

  // Waterfall do card "Próxima ação" — ver hero-state.ts para as 6
  // condições e a ordem de prioridade.
  const now = new Date();
  const nearestInterview =
    applications
      .filter(
        (a) =>
          a.status === "INTERVIEW" &&
          a.nextActionAt &&
          new Date(a.nextActionAt) > now,
      )
      .sort(
        (a, b) =>
          new Date(a.nextActionAt as string).getTime() -
          new Date(b.nextActionAt as string).getTime(),
      )[0] ?? null;

  const cvReadyUnsubmitted =
    applications.find((a) => a.status === "CV_READY") ?? null;

  const topRecommendation = monitorFeed?.items[0]
    ? {
        jobTitle: monitorFeed.items[0].job.title,
        companyName: monitorFeed.items[0].job.company,
        score: Math.round(monitorFeed.items[0].score),
      }
    : null;

  const hasAnyApplication =
    applications.length > 0 || (highlightsSummary?.analyzedCvsCount ?? 0) > 0;

  const lastActivityAt = applications[0]?.updatedAt ?? null;

  const heroState = resolveHeroState({
    hasAnyApplication,
    nearestInterview: nearestInterview
      ? {
          id: nearestInterview.id,
          jobTitle: nearestInterview.jobTitle,
          companyName: nearestInterview.companyName,
          nextActionAt: nearestInterview.nextActionAt as string,
        }
      : null,
    cvReadyUnsubmitted: cvReadyUnsubmitted
      ? {
          id: cvReadyUnsubmitted.id,
          jobTitle: cvReadyUnsubmitted.jobTitle,
          companyName: cvReadyUnsubmitted.companyName,
        }
      : null,
    hasAvailableCredits: hasAvailableCredits(plan),
    topRecommendation,
    lastActivityAt,
    now,
  });

  // Delta de score da candidatura mais recente com antes/depois — não é
  // uma tendência histórica (não existe snapshot ao longo do tempo), é o
  // ganho real da última adaptação feita.
  const scoreDeltaSource = applications.find(
    (a) => a.scoreBefore !== null && a.scoreAfter !== null,
  );
  const scoreDelta =
    scoreDeltaSource &&
    scoreDeltaSource.scoreBefore !== null &&
    scoreDeltaSource.scoreAfter !== null
      ? Math.round(scoreDeltaSource.scoreAfter - scoreDeltaSource.scoreBefore)
      : null;

  // Seu CV — "última adaptação" é a candidatura mais recentemente tocada
  // que já tem um CV vinculado (applications já vem ordenado por
  // updatedAt desc); "carta gerada recente" varre o histórico de eventos
  // por COVER_LETTER_GENERATED, já incluído em cada candidatura.
  const lastAdaptationApp =
    applications.find((a) => a.bestCvAdaptationId || a.currentCvAdaptationId) ??
    null;

  const lastCoverLetter =
    applications
      .flatMap((a) =>
        a.events
          .filter((ev) => ev.eventType === "COVER_LETTER_GENERATED")
          .map((ev) => ({
            jobTitle: a.jobTitle,
            companyName: a.companyName,
            applicationId: a.id,
            createdAt: ev.createdAt,
          })),
      )
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      )[0] ?? null;

  const candidaturasColumn = (
    <ColumnCard
      title="Candidaturas"
      icon={<BriefcaseIcon />}
      href="/candidaturas"
    >
      {applicationsError ? (
        <EmptyColumnState label="Não foi possível carregar as candidaturas." />
      ) : recentApplicationsWithScores.length === 0 ? (
        <EmptyColumnState label="Você ainda não tem candidaturas." />
      ) : (
        recentApplicationsWithScores.map((item) => {
          const status = getStatusConfig(item.status);
          const scoreNum = item.displayScore;
          const scoreText =
            scoreNum !== null ? `${Math.round(scoreNum)}%` : "—";

          return (
            <Link
              key={item.id}
              href={`/candidaturas/${item.id}`}
              className="flex items-center gap-3 border-t border-[rgba(10,10,10,0.06)] pt-3 first:border-t-0 first:pt-0 transition-opacity hover:opacity-75"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13.5px] font-medium leading-tight tracking-[-0.01em] text-[#0a0a0a]">
                  {item.jobTitle}
                </p>
                <p className="mt-0.5 truncate font-mono text-[10px] text-[#8a8a85]">
                  {item.companyName}
                </p>
              </div>
              <span
                className="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-[3px] font-mono text-[9.5px] font-medium"
                style={{
                  background: status.bg,
                  color: status.color,
                  border: `1px solid ${status.border}`,
                }}
              >
                <span
                  className="size-1 rounded-full"
                  style={{ background: status.dot }}
                />
                {status.label}
              </span>
              <span
                className="w-9 shrink-0 text-right text-[13px] font-medium tabular-nums"
                style={{ color: scoreNum !== null ? "#2a6a10" : "#8a8a85" }}
              >
                {scoreText}
              </span>
            </Link>
          );
        })
      )}
    </ColumnCard>
  );

  const descobertaColumn = (
    <ColumnCard title="Descoberta" icon={<RadarIcon />} href="/radar">
      {!hasJobsAccess ? (
        <EmptyColumnState label="Em breve por aqui." />
      ) : (
        <>
          <div className="rounded-[10px] border border-[rgba(10,10,10,0.07)] px-3 py-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="font-mono text-[9.5px] font-semibold uppercase tracking-[0.08em] text-[#8a8a85]">
                Radar
              </p>
              {savedJobs && savedJobs.total > 0 && (
                <span className="rounded-full bg-[rgba(10,10,10,0.06)] px-2 py-[2px] font-mono text-[9.5px] font-medium text-[#5a5a55]">
                  {savedJobs.total} salva{savedJobs.total === 1 ? "" : "s"}
                </span>
              )}
            </div>
            {savedJobs && savedJobs.items.length > 0 ? (
              <div className="flex flex-col gap-2.5">
                {savedJobs.items.slice(0, 2).map((item) => (
                  <JobPreviewRow
                    key={item.savedJobId}
                    title={item.job.title}
                    subtitle={item.job.company}
                  />
                ))}
              </div>
            ) : (
              <Link
                href="/radar"
                className="text-[13.5px] font-medium text-[#0a0a0a] hover:underline"
              >
                Explorar vagas abertas
              </Link>
            )}
          </div>

          <div
            className="rounded-[10px] border border-[rgba(10,10,10,0.07)] px-3 py-3"
            style={
              monitorCount && monitorCount.count > 0
                ? {
                    background: "rgba(198,255,58,0.10)",
                    borderColor: "rgba(110,150,20,0.22)",
                  }
                : undefined
            }
          >
            <div className="mb-2 flex items-center justify-between">
              <p className="font-mono text-[9.5px] font-semibold uppercase tracking-[0.08em] text-[#8a8a85]">
                Meu Monitor
              </p>
              {monitorCount && monitorCount.count > 0 && (
                <span className="rounded-full bg-[rgba(110,150,20,0.18)] px-2 py-[2px] font-mono text-[9.5px] font-medium text-[#3a5008]">
                  {monitorCount.count} pendente
                  {monitorCount.count === 1 ? "" : "s"}
                </span>
              )}
            </div>
            {monitorFeed && monitorFeed.items.length > 0 ? (
              <div className="flex flex-col gap-2.5">
                {monitorFeed.items.slice(0, 2).map((item) => (
                  <JobPreviewRow
                    key={item.recommendationId}
                    title={item.job.title}
                    subtitle={item.job.company}
                    tag={matchQualityLabel(item.score)}
                  />
                ))}
              </div>
            ) : (
              <p className="text-[13px] text-[#8a8a85]">
                Nenhuma recomendação nova
              </p>
            )}
            <Link
              href="/alerta-vaga-certa"
              className="mt-2.5 inline-block text-[11.5px] font-medium text-[#5a5a55] hover:text-[#0a0a0a]"
            >
              Abrir Meu Monitor →
            </Link>
          </div>
        </>
      )}
    </ColumnCard>
  );

  const seuCvColumn = (
    <ColumnCard title="Seu CV" icon={<FileCheckIcon />} href="/analises">
      <Link
        href="/meu-cv-master"
        className="group flex items-center gap-3 rounded-[10px] border border-[rgba(10,10,10,0.07)] px-3 py-3 transition-colors hover:border-[rgba(10,10,10,0.15)]"
      >
        <ProgressRing value={profileCompletion} size={64} stroke={5} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13.5px] font-medium text-[#0a0a0a]">
            {masterResume ? masterResume.title : "Nenhum CV cadastrado ainda"}
          </p>
          <span className="flex items-center gap-1 text-[11px] text-[#8a8a85] transition-colors group-hover:text-[#0a0a0a]">
            Abrir Meu CV Master
            <Chevron />
          </span>
        </div>
      </Link>

      {lastAdaptationApp && (
        <Link
          href={`/candidaturas/${lastAdaptationApp.id}`}
          className="rounded-[10px] border border-[rgba(10,10,10,0.07)] px-3 py-3 transition-colors hover:border-[rgba(10,10,10,0.15)]"
        >
          <p className="font-mono text-[9.5px] font-semibold uppercase tracking-[0.08em] text-[#8a8a85]">
            Última adaptação
          </p>
          <p className="mt-1 truncate text-[13px] font-medium text-[#0a0a0a]">
            {lastAdaptationApp.jobTitle}
          </p>
          <p className="truncate text-[11px] text-[#8a8a85]">
            {lastAdaptationApp.companyName}
          </p>
        </Link>
      )}

      <Link
        href={
          lastCoverLetter
            ? `/candidaturas/${lastCoverLetter.applicationId}`
            : "/carta-de-apresentacao"
        }
        className="rounded-[10px] border border-[rgba(10,10,10,0.07)] px-3 py-3 transition-colors hover:border-[rgba(10,10,10,0.15)]"
      >
        <p className="font-mono text-[9.5px] font-semibold uppercase tracking-[0.08em] text-[#8a8a85]">
          {lastCoverLetter ? "Carta gerada recente" : "Carta de apresentação"}
        </p>
        {lastCoverLetter ? (
          <>
            <p className="mt-1 truncate text-[13px] font-medium text-[#0a0a0a]">
              {lastCoverLetter.jobTitle}
            </p>
            <p className="truncate text-[11px] text-[#8a8a85]">
              {lastCoverLetter.companyName}
            </p>
          </>
        ) : (
          <p className="mt-1 text-[13px] font-medium text-[#0a0a0a]">
            Gerar pra uma candidatura
          </p>
        )}
      </Link>
    </ColumnCard>
  );

  return (
    <PageShell>
      <main
        className="min-h-screen text-[#0a0a0a]"
        style={{
          background:
            "radial-gradient(ellipse 80% 40% at 50% 0%, #f9f8f4 0%, #ecebe5 100%)",
          fontFamily: GEIST,
        }}
      >
        <AppHeader
          userName={user?.name ?? undefined}
          userRole={user?.internalRole ?? null}
          availableCredits={availableCredits}
        />

        <div className="mx-auto max-w-[1320px] px-6 pb-20 pt-[88px] md:px-8 lg:px-12">
          <GuestAnalysisClaimer />

          <div className="space-y-4">
            {/* 1 · Saudação */}
            <h1 className="text-[clamp(36px,4vw,44px)] font-medium leading-none tracking-[-0.04em]">
              Olá{firstName ? `, ${firstName}` : ""}{" "}
              <em
                className="not-italic font-normal"
                style={{ fontFamily: SERIF }}
              >
                tudo certo por aqui.
              </em>
            </h1>

            {/* 2 · Próxima ação (waterfall) — card único, largura total */}
            <Link
              href={heroState.ctaHref}
              className="group flex flex-col gap-5 rounded-[14px] p-6 md:flex-row md:items-center md:justify-between md:gap-8"
              style={{
                background:
                  "radial-gradient(120% 140% at 100% 0%, rgba(198,255,58,0.10) 0%, rgba(198,255,58,0) 45%), #0a0a0a",
                color: "#fafaf6",
                boxShadow: "0 20px 50px -18px rgba(10,10,10,0.4)",
              }}
            >
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-[#7a7a74]">
                  <span className="size-1.5 shrink-0 rounded-full bg-[#c6ff3a]" />
                  {heroState.eyebrow}
                  <span className="text-[#4a4a45]">·</span>
                  {heroState.eyebrowQualifier}
                </p>
                <p className="mt-4 text-[28px] font-medium leading-tight tracking-[-0.05em] md:text-[32px]">
                  {heroState.titlePlain}{" "}
                  <em
                    className="not-italic text-[#c6ff3a]"
                    style={{ fontFamily: SERIF }}
                  >
                    {heroState.titleEmphasis}
                  </em>
                </p>
                <p className="mt-2 max-w-[520px] text-[13.5px] leading-relaxed text-[#a0a098]">
                  {heroState.description}
                </p>
              </div>
              <span
                className="inline-flex w-fit shrink-0 items-center gap-2 rounded-[10px] px-[18px] py-3 text-[14px] font-semibold transition-opacity group-hover:opacity-90"
                style={{
                  background: "#c6ff3a",
                  color: "#0a0a0a",
                  boxShadow: "0 6px 14px rgba(198,255,58,0.2)",
                }}
              >
                {heroState.ctaLabel}
              </span>
            </Link>

            {/* 3 · KPIs */}
            <div
              className={
                hasJobsAccess
                  ? "grid grid-cols-2 gap-3 lg:grid-cols-4"
                  : "grid gap-3 md:grid-cols-3"
              }
            >
              <Link
                href="/candidaturas"
                className="group rounded-[12px] border border-[rgba(10,10,10,0.08)] bg-[#fafaf6] px-5 py-4 transition-[border-color,box-shadow,transform] duration-150 hover:-translate-y-px hover:border-[rgba(10,10,10,0.16)] hover:shadow-[0_8px_20px_-10px_rgba(10,10,10,0.18)] block"
              >
                <p className="font-mono text-[10px] font-medium uppercase tracking-[0.1em] text-[#8a8a85]">
                  Candidaturas ativas
                </p>
                <p className="mt-1.5 text-[32px] font-medium leading-none tracking-[-0.05em] tabular-nums text-[#0a0a0a]">
                  {kpisAvailable
                    ? String(highlightsSummary.activeApplicationsCount)
                    : "Erro ao carregar"}
                </p>
              </Link>

              <Link
                href="/analises"
                className="group rounded-[12px] border border-[rgba(10,10,10,0.08)] bg-[#fafaf6] px-5 py-4 transition-[border-color,box-shadow,transform] duration-150 hover:-translate-y-px hover:border-[rgba(10,10,10,0.16)] hover:shadow-[0_8px_20px_-10px_rgba(10,10,10,0.18)] block"
              >
                <p className="font-mono text-[10px] font-medium uppercase tracking-[0.1em] text-[#8a8a85]">
                  CVs analisados
                </p>
                <p
                  className="mt-1.5 text-[32px] font-medium leading-none tracking-[-0.05em] tabular-nums"
                  style={{
                    color:
                      kpisAvailable && highlightsSummary.analyzedCvsCount > 0
                        ? "#2a6a10"
                        : "#0a0a0a",
                  }}
                >
                  {kpisAvailable
                    ? String(highlightsSummary.analyzedCvsCount)
                    : "Erro ao carregar"}
                </p>
              </Link>

              <div className="rounded-[12px] border border-[rgba(10,10,10,0.08)] bg-[#fafaf6] px-5 py-4">
                <p className="font-mono text-[10px] font-medium uppercase tracking-[0.1em] text-[#8a8a85]">
                  Score médio
                </p>
                <div className="mt-1.5 flex items-baseline gap-2">
                  <p
                    className="text-[32px] font-medium leading-none tracking-[-0.05em] tabular-nums"
                    style={{
                      color:
                        kpisAvailable && highlightsSummary.averageScore !== null
                          ? "#2a6a10"
                          : "#0a0a0a",
                    }}
                  >
                    {!kpisAvailable
                      ? "Erro ao carregar"
                      : highlightsSummary.averageScore === null
                        ? "—"
                        : `${highlightsSummary.averageScore}%`}
                  </p>
                  {scoreDelta !== null && scoreDelta > 0 && (
                    <span
                      className="flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-mono text-[10.5px] font-semibold"
                      style={{
                        background: "rgba(198,255,58,0.28)",
                        color: "#3a5008",
                      }}
                    >
                      <TrendUpIcon size={11} />+{scoreDelta}%
                    </span>
                  )}
                </div>
              </div>

              {hasJobsAccess && (
                <Link
                  href="/alerta-vaga-certa"
                  className="group rounded-[12px] border border-[rgba(10,10,10,0.08)] bg-[#fafaf6] px-5 py-4 transition-[border-color,box-shadow,transform] duration-150 hover:-translate-y-px hover:border-[rgba(10,10,10,0.16)] hover:shadow-[0_8px_20px_-10px_rgba(10,10,10,0.18)] block"
                >
                  <p className="font-mono text-[10px] font-medium uppercase tracking-[0.1em] text-[#8a8a85]">
                    Recomendações novas
                  </p>
                  <p
                    className="mt-1.5 text-[32px] font-medium leading-none tracking-[-0.05em] tabular-nums"
                    style={{
                      color:
                        monitorCount && monitorCount.count > 0
                          ? "#2a6a10"
                          : "#0a0a0a",
                    }}
                  >
                    {monitorCount ? String(monitorCount.count) : "—"}
                  </p>
                </Link>
              )}
            </div>

            {/* 4 · Grid operacional — Candidaturas / Descoberta / Seu CV */}
            <DashboardColumnTabs
              tabs={[
                {
                  id: "candidaturas",
                  label: "Candidaturas",
                  icon: <BriefcaseIcon size={13} />,
                },
                {
                  id: "descoberta",
                  label: "Descoberta",
                  icon: <RadarIcon size={13} />,
                },
                {
                  id: "seu-cv",
                  label: "Seu CV",
                  icon: <FileCheckIcon size={13} />,
                },
              ]}
              columns={{
                candidaturas: candidaturasColumn,
                descoberta: descobertaColumn,
                "seu-cv": seuCvColumn,
              }}
            />

            {/* 5 · Créditos */}
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

            {/* 6 · Zona de perigo */}
            <div className="mt-8">
              <div className="mb-6 flex items-center gap-4">
                <div className="h-px flex-1 bg-[rgba(154,61,40,0.18)]" />
                <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-[#9a3d28]">
                  Zona de perigo
                </p>
                <div className="h-px flex-1 bg-[rgba(154,61,40,0.18)]" />
              </div>
              <DeleteAccountSection
                creditsRemaining={plan?.creditsRemaining ?? 0}
              />
            </div>
          </div>
        </div>
      </main>
      <PublicFooter />
    </PageShell>
  );
}
