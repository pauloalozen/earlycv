import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AppHeader } from "@/components/app-header";
import { PublicFooter } from "@/components/public-footer";
import {
  getDefaultAppRedirectPath,
  getRouteAccessRedirectPath,
} from "@/lib/app-session";
import { getCurrentAppUserFromCookies } from "@/lib/app-session.server";
import {
  getCvAdaptationContent,
  listCvAdaptations,
} from "@/lib/cv-adaptation-api";
import { DASHBOARD_METRIC_LABELS } from "@/lib/dashboard-copy";
import {
  buildDashboardTestMetrics,
  extractDashboardAnalysisSignal,
  getDashboardScoreColor,
} from "@/lib/dashboard-test-metrics";
import { toHeaderAvailableCredits } from "@/lib/header-credits";
import { getStatusConfig } from "@/lib/job-application-status";
import { listJobApplicationHighlights } from "@/lib/job-applications-api";
import { getMyPlan } from "@/lib/plans-api";
import { getMasterResumeFromList, listMyResumes } from "@/lib/resumes-api";
import { AvailableDownloadCredits } from "./available-download-credits";
import { CvMasterCard } from "./cv-master-card";
import { DeleteAccountDangerZone } from "./delete-account-danger-zone";
import { GuestAnalysisClaimer } from "./guest-analysis-claimer";

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

type DashboardPageProps = {
  searchParams: Promise<{ plan?: string }>;
};

export default async function DashboardPage({
  searchParams,
}: DashboardPageProps) {
  const user = await getCurrentAppUserFromCookies();
  const redirectPath = getRouteAccessRedirectPath("/dashboard", user);
  if (redirectPath) redirect(redirectPath);
  if (!user) redirect(getDefaultAppRedirectPath(null));

  const params = await searchParams;
  const showPlanActivated = params.plan === "activated";

  const [plan, adaptations, resumesResponse, highlightsResponse] =
    await Promise.allSettled([
      getMyPlan(),
      listCvAdaptations(1, 10),
      listMyResumes(),
      listJobApplicationHighlights(3),
    ]);

  const planInfo = plan.status === "fulfilled" ? plan.value : null;
  const adaptationList =
    adaptations.status === "fulfilled" ? adaptations.value.items : [];
  const applicationHighlights =
    highlightsResponse.status === "fulfilled" ? highlightsResponse.value : [];
  const resumeList =
    resumesResponse.status === "fulfilled" ? resumesResponse.value : [];
  const masterResume = await getMasterResumeFromList(resumeList);

  const availableDownloadCredits = toHeaderAvailableCredits(planInfo);

  const analysisSignalsById = new Map<
    string,
    {
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
        <AppHeader
          userName={user.name}
          userRole={user.internalRole}
          availableCredits={availableDownloadCredits}
        />

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
                  <AvailableDownloadCredits
                    initialDisplay={availableDownloadCredits}
                    initialCreditsRemaining={
                      typeof planInfo?.creditsRemaining === "number"
                        ? Math.max(0, planInfo.creditsRemaining)
                        : null
                    }
                  />
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
                  <title>Creditos</title>
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
                    <title>Adaptar</title>
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
                value: String(adaptationList.length),
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

          {/* Applications highlights */}
          <div style={{ ...CARD, overflow: "hidden" }}>
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
                  Suas candidaturas
                </p>
                <p style={{ fontSize: 12.5, color: "#8a8a85", margin: 0 }}>
                  Destaques recentes para você acompanhar seus próximos passos.
                </p>
              </div>

              <a
                href="/dashboard/candidaturas"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  textDecoration: "none",
                  border: "1px solid rgba(10,10,10,0.1)",
                  borderRadius: 10,
                  padding: "8px 12px",
                  background: "#fff",
                  color: "#0a0a0a",
                  fontSize: 12.5,
                  fontWeight: 500,
                }}
                className="dash-btn-outline"
              >
                Ver todas as candidaturas
              </a>
            </div>

            {applicationHighlights.length === 0 ? (
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
                  Você ainda não tem candidaturas
                </p>
                <p style={{ fontSize: 13.5, color: "#6a6560", margin: 0 }}>
                  Crie sua primeira adaptação para começar a organizar seu
                  funil.
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
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                  gap: 10,
                  padding: 10,
                }}
                className="dash-candidaturas-grid"
              >
                {applicationHighlights.map((item) => {
                  const status = getStatusConfig(item.status);
                  const scoreText =
                    item.scorePresentation === "scored" &&
                    typeof item.bestScore === "number"
                      ? `${item.bestScore}%`
                      : "Ainda não analisada";

                  return (
                    <a
                      key={item.id}
                      href={`/dashboard/candidaturas/${item.id}`}
                      style={{
                        background: "#fff",
                        border: "1px solid rgba(10,10,10,0.06)",
                        borderRadius: 12,
                        padding: "14px 14px 12px",
                        textDecoration: "none",
                        color: "#0a0a0a",
                        minWidth: 0,
                      }}
                    >
                      <p
                        style={{
                          margin: "0 0 8px",
                          fontSize: 13.5,
                          fontWeight: 500,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {item.jobTitle}
                      </p>
                      <p
                        style={{
                          margin: "0 0 10px",
                          fontFamily: MONO,
                          fontSize: 10.5,
                          color: "#8a8a85",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {item.companyName}
                      </p>

                      <div
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 6,
                          border: `1px solid ${status.border}`,
                          borderRadius: 999,
                          background: status.bg,
                          color: status.color,
                          padding: "4px 8px",
                          fontSize: 11,
                          fontWeight: 600,
                          marginBottom: 12,
                        }}
                      >
                        <span
                          aria-hidden
                          style={{
                            width: 7,
                            height: 7,
                            borderRadius: 999,
                            background: status.dot,
                          }}
                        />
                        {status.label}
                      </div>

                      <p
                        style={{
                          margin: 0,
                          fontFamily: MONO,
                          fontSize: 10,
                          color: "#8a8a85",
                        }}
                      >
                        MELHOR SCORE
                      </p>
                      <p
                        style={{
                          margin: "4px 0 0",
                          fontSize: 19,
                          fontWeight: 500,
                          letterSpacing: -0.6,
                          color:
                            item.scorePresentation === "scored" &&
                            typeof item.bestScore === "number"
                              ? getDashboardScoreColor(item.bestScore)
                              : "#6a6560",
                        }}
                      >
                        {scoreText}
                      </p>
                    </a>
                  );
                })}
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

      <PublicFooter />

      <style>{`
        .dash-btn-dark:hover { opacity: 0.82; }
        .dash-btn-outline:hover { background: rgba(10,10,10,0.04) !important; }
        .dash-cta-btn:hover { opacity: 0.88; }
        .dash-cta-arrow { display: inline-block; transition: transform 220ms cubic-bezier(.3,.9,.4,1); }
        .dash-cta-btn:hover .dash-cta-arrow { transform: translateX(4px); }
        @media (max-width: 768px) {
          .dashboard-content { padding: 12px 16px 60px !important; }
          .dash-candidaturas-grid { grid-template-columns: 1fr !important; }
        }
        @media (max-width: 680px) {
          .dash-top-grid { grid-template-columns: 1fr !important; }
          .dash-metrics-grid { grid-template-columns: repeat(2, 1fr) !important; }
          .dash-candidaturas-grid { grid-template-columns: 1fr !important; }
        }
        @media (max-width: 420px) {
          .dash-metrics-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </>
  );
}
