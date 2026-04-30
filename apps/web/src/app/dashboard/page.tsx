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
import type { DashboardAdjustmentsData } from "@/lib/dashboard-adjustments";
import { DASHBOARD_METRIC_LABELS } from "@/lib/dashboard-copy";
import {
  buildDashboardTestHistoryView,
  buildDashboardTestMetrics,
  extractDashboardAnalysisSignal,
  getDashboardScoreColor,
} from "@/lib/dashboard-test-metrics";
import { hasAvailableCredits } from "@/lib/plan-credits";
import { getMyPlan } from "@/lib/plans-api";
import { getMasterResumeFromList, listMyResumes } from "@/lib/resumes-api";
import { CvMasterCard } from "./cv-master-card";
import { DeleteAccountDangerZone } from "./delete-account-danger-zone";
import { GuestAnalysisClaimer } from "./guest-analysis-claimer";
import { HistoryActionLinks } from "./history-action-links";

export const metadata: Metadata = {
  robots: { follow: false, index: false },
  title: "Dashboard | EarlyCV",
};

const GEIST = "var(--font-geist), -apple-system, system-ui, sans-serif";
const MONO = "var(--font-geist-mono), monospace";
const SERIF_ITALIC = "var(--font-instrument-serif), serif";

const CARD: React.CSSProperties = {
  background: "#fafaf6",
  border: "1px solid rgba(10,10,10,0.08)",
  borderRadius: 14,
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

  const [plan, adaptations, resumesResponse] = await Promise.allSettled([
    getMyPlan(),
    listCvAdaptations(currentPage, currentLimit),
    listMyResumes(),
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
  const resumeList =
    resumesResponse.status === "fulfilled" ? resumesResponse.value : [];
  const masterResume = await getMasterResumeFromList(resumeList);
  const resumeTitleById = new Map(
    resumeList.map((resume) => [resume.id, resume.title]),
  );

  const isPlanInfoUnavailable = !planInfo;
  const availableDownloadCredits = isPlanInfoUnavailable
    ? "—"
    : planInfo.creditsRemaining === null
      ? "∞"
      : planInfo.creditsRemaining;

  const analysisSignalsById = new Map<
    string,
    {
      adjustments: DashboardAdjustmentsData;
      selectedMissingKeywords: string[];
      score: number | null;
      improvement: number | null;
    }
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

  const firstName = user.name.split(" ")[0];

  return (
    <>
      {/* Grain */}
      <div
        aria-hidden
        style={{
          position: "fixed",
          inset: 0,
          pointerEvents: "none",
          opacity: 0.4,
          mixBlendMode: "multiply",
          zIndex: 0,
          backgroundImage: `url("data:image/svg+xml;utf8,<svg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.03 0'/></filter><rect width='100%25' height='100%25' filter='url(%23n)'/></svg>")`,
        }}
      />

      <main
        style={{
          fontFamily: GEIST,
          minHeight: "100dvh",
          background:
            "radial-gradient(ellipse 80% 60% at 50% 0%, #f9f8f4 0%, #ecebe5 100%)",
          color: "#0a0a0a",
          position: "relative",
        }}
      >
        <AppHeader userName={user.name} />

        <div
          className="dashboard-content"
          style={{
            maxWidth: 1100,
            margin: "0 auto",
            padding: "12px 32px 80px",
            position: "relative",
            zIndex: 2,
          }}
        >
          <GuestAnalysisClaimer />

          {/* Plan activated banner */}
          {showPlanActivated && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                background: "rgba(198,255,58,0.12)",
                border: "1px solid rgba(110,150,20,0.2)",
                borderRadius: 12,
                padding: "12px 16px",
                marginBottom: 16,
              }}
            >
              <span style={{ color: "#405410", fontSize: 14 }}>✔</span>
              <p
                style={{
                  fontSize: 13.5,
                  fontWeight: 500,
                  color: "#2a3a08",
                  margin: 0,
                }}
              >
                Plano ativado com sucesso!
              </p>
            </div>
          )}

          {/* Welcome */}
          <div style={{ padding: "8px 0 20px" }}>
            <h1
              style={{
                fontSize: "clamp(28px, 3.5vw, 40px)",
                fontWeight: 500,
                letterSpacing: -1.5,
                margin: 0,
                color: "#0a0a0a",
              }}
            >
              Olá, {firstName}{" "}
              <em
                style={{
                  fontFamily: SERIF_ITALIC,
                  fontStyle: "italic",
                  fontWeight: 400,
                }}
              >
                bem-vindo.
              </em>
            </h1>
          </div>

          {/* Credits bar */}
          <div
            style={{
              ...CARD,
              padding: "14px 20px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 16,
              marginBottom: 16,
            }}
          >
            <div>
              <p
                style={{
                  fontFamily: MONO,
                  fontSize: 10,
                  letterSpacing: 1.2,
                  color: "#8a8a85",
                  fontWeight: 500,
                  margin: "0 0 4px",
                }}
              >
                VISÃO GERAL
              </p>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                <span
                  style={{
                    fontSize: 13.5,
                    color: "#6a6560",
                  }}
                >
                  Créditos de download:
                </span>
                <span
                  style={{
                    fontSize: 18,
                    fontWeight: 500,
                    letterSpacing: -0.5,
                    color: "#0a0a0a",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {availableDownloadCredits}
                </span>
              </div>
            </div>
            <a
              href="/planos"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                background: "#0a0a0a",
                color: "#fafaf6",
                borderRadius: 10,
                padding: "10px 16px",
                fontSize: 13,
                fontWeight: 500,
                textDecoration: "none",
                flexShrink: 0,
                letterSpacing: -0.1,
              }}
              className="dash-btn-dark"
            >
              <span aria-hidden="true" style={{ display: "inline-flex" }}>
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M12 1v22" />
                  <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7H14.5a3.5 3.5 0 0 1 0 7H7" />
                </svg>
              </span>
              Comprar créditos
            </a>
          </div>

          {/* CV Master + CTA grid */}
          <div
            className="dash-top-grid"
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 14,
              marginBottom: 16,
            }}
          >
            {/* CV Master */}
            <CvMasterCard initialResume={masterResume ?? null} />

            {/* Analisar nova vaga — dark CTA card */}
            <section
              style={{
                background: "#0a0a0a",
                borderRadius: 14,
                padding: "24px 26px",
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
                color: "#fafaf6",
                boxShadow: "0 20px 50px -16px rgba(10,10,10,0.4)",
              }}
            >
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  fontFamily: MONO,
                  fontSize: 10,
                  letterSpacing: 1.2,
                  color: "#7a7a74",
                  fontWeight: 500,
                  marginBottom: 16,
                  width: "fit-content",
                }}
              >
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: "#c6ff3a",
                    boxShadow: "0 0 6px #c6ff3a",
                    flexShrink: 0,
                  }}
                />
                PRÓXIMO PASSO
              </div>
              <h2
                style={{
                  fontSize: 28,
                  fontWeight: 500,
                  letterSpacing: -1.2,
                  color: "#fafaf6",
                  margin: "0 0 6px",
                  lineHeight: 1.05,
                }}
              >
                Analisar{" "}
                <em
                  style={{
                    fontFamily: SERIF_ITALIC,
                    fontStyle: "italic",
                    fontWeight: 400,
                    color: "#c6ff3a",
                  }}
                >
                  nova vaga.
                </em>
              </h2>
              <p
                style={{
                  fontSize: 13.5,
                  color: "#a0a098",
                  margin: "0 0 22px",
                }}
              >
                Leva menos de 2 minutos
              </p>
              <a
                href="/adaptar"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  background: "#c6ff3a",
                  color: "#0a0a0a",
                  borderRadius: 10,
                  padding: "12px 18px",
                  fontSize: 14,
                  fontWeight: 600,
                  textDecoration: "none",
                  letterSpacing: -0.2,
                  width: "fit-content",
                  boxShadow: "0 6px 14px rgba(198,255,58,0.2)",
                }}
                className="dash-cta-btn"
              >
                <span aria-hidden="true" style={{ display: "inline-flex" }}>
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                    <path d="M16 3h5v5" />
                    <path d="M10 14 21 3" />
                  </svg>
                </span>
                Adaptar meu CV
                <span className="dash-cta-arrow">→</span>
              </a>
            </section>
          </div>

          {/* Metrics */}
          <div
            className="dash-metrics-grid"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: 14,
              marginBottom: 16,
            }}
          >
            {[
              {
                label: DASHBOARD_METRIC_LABELS.matchCount,
                value: String(adaptationTotal),
                color: "#0a0a0a",
              },
              {
                label: DASHBOARD_METRIC_LABELS.recentImprovement,
                value: `+${metrics.evolutionPercentage}%`,
                color: "#405410",
              },
              {
                label: DASHBOARD_METRIC_LABELS.averageScore,
                value: `${metrics.averageScore}%`,
                color: getDashboardScoreColor(metrics.averageScore),
              },
            ].map((metric) => (
              <article key={metric.label} style={{ ...CARD, padding: "20px" }}>
                <p
                  style={{
                    fontSize: 12.5,
                    color: "#6a6560",
                    margin: "0 0 6px",
                    lineHeight: 1.4,
                  }}
                >
                  {metric.label}
                </p>
                <p
                  style={{
                    fontSize: 32,
                    fontWeight: 500,
                    letterSpacing: -1.2,
                    color: metric.color,
                    margin: 0,
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {metric.value}
                </p>
              </article>
            ))}
          </div>

          {/* History */}
          <div style={{ ...CARD, overflow: "hidden" }}>
            {/* Header */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                padding: "16px 20px",
                borderBottom: "1px solid rgba(10,10,10,0.06)",
                flexWrap: "wrap",
              }}
            >
              <div>
                <p
                  style={{
                    fontFamily: MONO,
                    fontSize: 10,
                    letterSpacing: 1.2,
                    color: "#8a8a85",
                    fontWeight: 500,
                    margin: "0 0 3px",
                  }}
                >
                  HISTÓRICO DE ANÁLISES
                </p>
                <p style={{ fontSize: 12.5, color: "#8a8a85", margin: 0 }}>
                  {adaptationTotal === 0
                    ? "Nenhuma análise registrada"
                    : `Mostrando ${startItem}–${endItem} de ${adaptationTotal}`}
                </p>
              </div>

              {/* Page size selector */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  background: "rgba(10,10,10,0.04)",
                  border: "1px solid rgba(10,10,10,0.08)",
                  borderRadius: 8,
                  padding: "3px",
                }}
              >
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
                      style={{
                        display: "block",
                        padding: "4px 10px",
                        borderRadius: 6,
                        fontFamily: MONO,
                        fontSize: 11,
                        fontWeight: 600,
                        textDecoration: "none",
                        background: isActive ? "#0a0a0a" : "transparent",
                        color: isActive ? "#fafaf6" : "#6a6560",
                        transition: "all 150ms",
                      }}
                    >
                      {size}
                    </a>
                  );
                })}
              </div>
            </div>

            {/* Items */}
            {adaptationList.length === 0 ? (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 10,
                  padding: "48px 24px",
                  textAlign: "center",
                }}
              >
                <p
                  style={{
                    fontSize: 15,
                    fontWeight: 500,
                    color: "#0a0a0a",
                    margin: 0,
                  }}
                >
                  Nenhuma análise ainda
                </p>
                <p style={{ fontSize: 13.5, color: "#6a6560", margin: 0 }}>
                  Envie seu CV e a descrição de uma vaga para começar.
                </p>
                <a
                  href="/adaptar"
                  style={{
                    marginTop: 8,
                    background: "#0a0a0a",
                    color: "#fafaf6",
                    borderRadius: 10,
                    padding: "11px 20px",
                    fontSize: 13.5,
                    fontWeight: 500,
                    textDecoration: "none",
                    letterSpacing: -0.1,
                  }}
                  className="dash-btn-dark"
                >
                  Analisar meu CV
                </a>
              </div>
            ) : (
              <div style={{ padding: "10px" }}>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                  }}
                >
                  {adaptationList.map((item) => {
                    const actions = getHistoryActions(
                      item,
                      analysisSignalsById.get(item.id)?.selectedMissingKeywords,
                    );
                    const history = buildDashboardTestHistoryView({
                      id: item.id,
                      score: analysisSignalsById.get(item.id)?.score ?? null,
                      improvement:
                        analysisSignalsById.get(item.id)?.improvement ?? null,
                    });
                    const adjustments = analysisSignalsById.get(item.id)
                      ?.adjustments ?? {
                      notes: null,
                      scoreBefore: null,
                      scoreFinal: null,
                    };

                    return (
                      <article
                        key={item.id}
                        style={{
                          background: "#fff",
                          border: "1px solid rgba(10,10,10,0.06)",
                          borderRadius: 12,
                          padding: "16px 18px",
                        }}
                      >
                        <div
                          className="dash-history-row"
                          style={{
                            display: "flex",
                            alignItems: "flex-start",
                            justifyContent: "space-between",
                            gap: 12,
                            flexWrap: "wrap",
                          }}
                        >
                          <div style={{ minWidth: 0 }}>
                            <p
                              style={{
                                fontSize: 13.5,
                                fontWeight: 500,
                                color: "#0a0a0a",
                                margin: "0 0 3px",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {item.jobTitle ?? "Vaga sem título"}
                              {item.companyName ? ` · ${item.companyName}` : ""}
                            </p>
                            <p
                              style={{
                                fontFamily: MONO,
                                fontSize: 10.5,
                                color: "#8a8a85",
                                margin: 0,
                              }}
                            >
                              {formatDate(item.createdAt)}
                            </p>
                          </div>

                          <div
                            className="dash-history-score"
                            style={{
                              textAlign: "right",
                              flexShrink: 0,
                              display: "flex",
                              flexDirection: "column",
                              alignItems: "flex-end",
                              gap: 2,
                            }}
                          >
                            <p
                              style={{
                                fontFamily: MONO,
                                fontSize: 10,
                                color: "#8a8a85",
                                margin: "0 0 2px",
                              }}
                            >
                              SCORE
                            </p>
                            <p
                              style={{
                                fontSize: 22,
                                fontWeight: 500,
                                letterSpacing: -0.8,
                                margin: "0 0 2px",
                                fontVariantNumeric: "tabular-nums",
                                color:
                                  history.score !== null
                                    ? getDashboardScoreColor(history.score)
                                    : "#0a0a0a",
                              }}
                            >
                              {history.score !== null
                                ? `${history.score}%`
                                : "—"}
                            </p>
                            {history.improvement !== null && (
                              <p
                                style={{
                                  fontFamily: MONO,
                                  fontSize: 10.5,
                                  fontWeight: 600,
                                  color: "#405410",
                                  margin: "-7px 0 10px",
                                }}
                              >
                                +{history.improvement}% após ajustes
                              </p>
                            )}
                          </div>
                        </div>

                        <div
                          style={{
                            display: "flex",
                            alignItems: "flex-end",
                            justifyContent: "space-between",
                            gap: 12,
                            flexWrap: "wrap",
                          }}
                        >
                          <HistoryActionLinks
                            actions={actions}
                            hasCredits={hasCredits}
                            adjustments={adjustments}
                            analysisContext={{
                              jobTitle: item.jobTitle,
                              masterResumeTitle:
                                resumeTitleById.get(item.masterResumeId) ?? null,
                            }}
                            hideBaseCvAction
                            removeTopMargin
                          />

                          {actions.canDownloadBaseCv ? (
                            <a
                              href={actions.baseCvHref}
                              title="Baixa o CV base usado na analise e adaptacao (apenas para conferencia)."
                              className="inline-flex h-8 w-full appearance-none items-center justify-center gap-1.5 whitespace-nowrap rounded-[10px] border border-[#DADADA] bg-white px-3 [font-family:var(--font-sans)] text-xs leading-none font-semibold text-[#757570] transition-colors hover:border-[#BEBEBE] sm:w-auto"
                              style={{ color: "#757570" }}
                            >
                              <span aria-hidden="true" style={{ display: "inline-flex" }}>
                                <svg
                                  width="12"
                                  height="12"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                >
                                  <path d="M12 3v12" />
                                  <path d="m7 10 5 5 5-5" />
                                  <path d="M5 21h14" />
                                </svg>
                              </span>
                              <span>CV usado na análise</span>
                            </a>
                          ) : null}
                        </div>
                      </article>
                    );
                  })}
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "flex-end",
                      gap: 8,
                      padding: "12px 4px 4px",
                    }}
                  >
                    {safeCurrentPage > 1 ? (
                      <a
                        href={buildDashboardQuery({
                          plan: params.plan,
                          page: safeCurrentPage - 1,
                          limit: currentLimit,
                        })}
                        style={{
                          background: "#fafaf6",
                          border: "1px solid rgba(10,10,10,0.1)",
                          borderRadius: 8,
                          padding: "6px 14px",
                          fontFamily: MONO,
                          fontSize: 11,
                          fontWeight: 600,
                          color: "#0a0a0a",
                          textDecoration: "none",
                        }}
                        className="dash-page-btn"
                      >
                        ← Anterior
                      </a>
                    ) : (
                      <span
                        style={{
                          background: "rgba(10,10,10,0.03)",
                          border: "1px solid rgba(10,10,10,0.06)",
                          borderRadius: 8,
                          padding: "6px 14px",
                          fontFamily: MONO,
                          fontSize: 11,
                          fontWeight: 600,
                          color: "#c0beb4",
                        }}
                      >
                        ← Anterior
                      </span>
                    )}

                    <span
                      style={{
                        fontFamily: MONO,
                        fontSize: 11,
                        color: "#8a8a85",
                        padding: "0 4px",
                      }}
                    >
                      {safeCurrentPage} / {totalPages}
                    </span>

                    {safeCurrentPage < totalPages ? (
                      <a
                        href={buildDashboardQuery({
                          plan: params.plan,
                          page: safeCurrentPage + 1,
                          limit: currentLimit,
                        })}
                        style={{
                          background: "#fafaf6",
                          border: "1px solid rgba(10,10,10,0.1)",
                          borderRadius: 8,
                          padding: "6px 14px",
                          fontFamily: MONO,
                          fontSize: 11,
                          fontWeight: 600,
                          color: "#0a0a0a",
                          textDecoration: "none",
                        }}
                        className="dash-page-btn"
                      >
                        Próxima →
                      </a>
                    ) : (
                      <span
                        style={{
                          background: "rgba(10,10,10,0.03)",
                          border: "1px solid rgba(10,10,10,0.06)",
                          borderRadius: 8,
                          padding: "6px 14px",
                          fontFamily: MONO,
                          fontSize: 11,
                          fontWeight: 600,
                          color: "#c0beb4",
                        }}
                      >
                        Próxima →
                      </span>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          <div style={{ marginTop: 16 }}>
            <DeleteAccountDangerZone
              creditsRemaining={
                typeof planInfo?.creditsRemaining === "number"
                  ? Math.max(0, planInfo.creditsRemaining)
                  : 0
              }
            />
          </div>
        </div>
      </main>

      <style>{`
        .dash-btn-dark:hover { opacity: 0.82; }
        .dash-btn-outline:hover { background: rgba(10,10,10,0.04) !important; }
        .dash-cta-btn:hover { opacity: 0.88; }
        .dash-cta-arrow { display: inline-block; transition: transform 220ms cubic-bezier(.3,.9,.4,1); }
        .dash-cta-btn:hover .dash-cta-arrow { transform: translateX(4px); }
        .dash-page-btn:hover { background: rgba(10,10,10,0.05) !important; }
        @media (max-width: 768px) {
          .dashboard-content { padding: 12px 16px 60px !important; }
        }
        @media (max-width: 680px) {
          .dash-top-grid { grid-template-columns: 1fr !important; }
          .dash-metrics-grid { grid-template-columns: repeat(2, 1fr) !important; }
          .dash-history-row { align-items: flex-start !important; }
          .dash-history-score { margin-left: auto !important; text-align: right !important; }
        }
        @media (max-width: 420px) {
          .dash-metrics-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </>
  );
}
