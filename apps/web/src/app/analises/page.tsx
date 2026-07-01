import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AppHeader } from "@/components/app-header";
import { PageShell } from "@/components/page-shell";
import { PublicFooter } from "@/components/public-footer";
import { getRouteAccessRedirectPath } from "@/lib/app-session";
import { getCurrentAppUserFromCookies } from "@/lib/app-session.server";
import { getHistoryActions } from "@/lib/cv-adaptation-actions";
import {
  getCvAdaptationContent,
  listCvAdaptations,
} from "@/lib/cv-adaptation-api";
import type { DashboardAdjustmentsData } from "@/lib/dashboard-adjustments";
import {
  buildDashboardTestHistoryView,
  extractDashboardAnalysisSignal,
  getDashboardScoreColor,
} from "@/lib/dashboard-test-metrics";
import { toHeaderAvailableCredits } from "@/lib/header-credits";
import { hasAvailableCredits } from "@/lib/plan-credits";
import { getMyPlan } from "@/lib/plans-api";
import { getMasterResumeFromList, listMyResumes } from "@/lib/resumes-api";
import { HistoryActionLinks } from "../dashboard/history-action-links";

export const metadata: Metadata = {
  robots: { follow: false, index: false },
  title: "Análises | EarlyCV",
};

const GEIST = "var(--font-geist), -apple-system, system-ui, sans-serif";
const MONO = "var(--font-geist-mono), monospace";
const SERIF = "var(--font-instrument-serif), serif";

const PAGE_SIZES = [10, 20, 50] as const;
type FilterKey = "todas" | "liberadas" | "nao_liberadas";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "todas", label: "Todas" },
  { key: "liberadas", label: "CV Liberado" },
  { key: "nao_liberadas", label: "Não Liberado" },
];

function parsePage(value: string | undefined) {
  const parsed = Number.parseInt(value ?? "1", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function parseLimit(value: string | undefined) {
  const parsed = Number.parseInt(value ?? "10", 10);
  return PAGE_SIZES.includes(parsed as (typeof PAGE_SIZES)[number])
    ? parsed
    : 10;
}

function parseFilter(value: string | undefined): FilterKey {
  if (value === "liberadas" || value === "nao_liberadas") return value;
  return "todas";
}

function buildQuery(params: {
  page: number;
  limit: number;
  filter: FilterKey;
}) {
  const query = new URLSearchParams();
  query.set("page", String(params.page));
  query.set("limit", String(params.limit));
  if (params.filter !== "todas") query.set("filter", params.filter);
  return `/analises?${query.toString()}`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function isReleased(item: { isUnlocked: boolean; paymentStatus: string }) {
  return item.isUnlocked || item.paymentStatus === "completed";
}

type Props = {
  searchParams: Promise<{ page?: string; limit?: string; filter?: string }>;
};

export default async function AnalisesPage({ searchParams }: Props) {
  const user = await getCurrentAppUserFromCookies();
  const redirectPath = getRouteAccessRedirectPath("/analises", user);
  if (redirectPath) redirect(redirectPath);

  const params = await searchParams;
  const currentPage = parsePage(params.page);
  const currentLimit = parseLimit(params.limit);
  const currentFilter = parseFilter(params.filter);

  // Fetch a large page to enable client counts and server-side filter
  const [allAdaptationsResult, planResult, resumesResult] =
    await Promise.allSettled([
      listCvAdaptations(1, 500),
      getMyPlan(),
      listMyResumes(),
    ]);

  const planInfo = planResult.status === "fulfilled" ? planResult.value : null;
  const hasCredits =
    planResult.status === "fulfilled"
      ? hasAvailableCredits(planResult.value)
      : null;
  const allAdaptations =
    allAdaptationsResult.status === "fulfilled"
      ? allAdaptationsResult.value.items
      : [];

  const resumeList =
    resumesResult.status === "fulfilled" ? resumesResult.value : [];
  const resumeTitleById = new Map(
    resumeList.map((resume) => [resume.id, resume.title]),
  );
  await getMasterResumeFromList(resumeList);

  const availableCredits = toHeaderAvailableCredits(planInfo);

  // Counts per filter
  const counts = {
    todas: allAdaptations.length,
    liberadas: allAdaptations.filter(isReleased).length,
    nao_liberadas: allAdaptations.filter((a) => !isReleased(a)).length,
  };

  // Apply filter then paginate
  const filtered =
    currentFilter === "todas"
      ? allAdaptations
      : currentFilter === "liberadas"
        ? allAdaptations.filter(isReleased)
        : allAdaptations.filter((a) => !isReleased(a));

  const adaptationTotal = filtered.length;
  const totalPages = Math.max(1, Math.ceil(adaptationTotal / currentLimit));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const startItem =
    adaptationTotal === 0 ? 0 : (safeCurrentPage - 1) * currentLimit + 1;
  const endItem = Math.min(adaptationTotal, safeCurrentPage * currentLimit);
  const adaptationList = filtered.slice(
    (safeCurrentPage - 1) * currentLimit,
    safeCurrentPage * currentLimit,
  );

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

  return (
    <PageShell>
      <main
        style={{
          fontFamily: GEIST,
          minHeight: "100dvh",
          background:
            "radial-gradient(ellipse 80% 40% at 50% 0%, #f9f8f4 0%, #ecebe5 100%)",
          color: "#0a0a0a",
        }}
      >
        <AppHeader
          userName={user?.name ?? undefined}
          userRole={user?.internalRole ?? null}
          availableCredits={availableCredits}
        />

        <div
          className="analises-content"
          style={{
            maxWidth: 1100,
            margin: "0 auto",
            padding: "12px 32px 80px",
          }}
        >
          <div className="analises-top-spacer" style={{ paddingTop: 72 }} />

          {/* Page header */}
          <div style={{ marginBottom: 36 }}>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                fontFamily: MONO,
                fontSize: 10.5,
                letterSpacing: 1.2,
                background: "rgba(10,10,10,0.04)",
                border: "1px solid rgba(10,10,10,0.06)",
                borderRadius: 999,
                padding: "5px 12px 5px 10px",
                fontWeight: 500,
                color: "#555",
                marginBottom: 18,
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
              {counts.todas === 0
                ? "0 ANÁLISES"
                : `${counts.todas} ANÁLISE${counts.todas !== 1 ? "S" : ""}`}
            </div>

            <h1
              style={{
                fontSize: "clamp(32px, 4vw, 48px)",
                fontWeight: 500,
                letterSpacing: -2,
                margin: "0 0 14px",
                color: "#0a0a0a",
                lineHeight: 1,
              }}
            >
              Histórico de{" "}
              <em
                style={{
                  fontFamily: SERIF,
                  fontStyle: "italic",
                  fontWeight: 400,
                }}
              >
                análises.
              </em>
            </h1>
            <p
              style={{
                margin: 0,
                fontSize: 15.5,
                color: "#5a5a55",
                maxWidth: 620,
                lineHeight: 1.5,
              }}
            >
              Todas as análises feitas, ordenadas da mais recente para a mais
              antiga. Acesse o resultado, baixe o CV adaptado ou veja os ajustes
              aplicados.
            </p>
          </div>

          {/* Filter badges */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginBottom: 24,
              flexWrap: "wrap",
            }}
          >
            {FILTERS.map((f) => {
              const isActive = currentFilter === f.key;
              return (
                <a
                  key={f.key}
                  href={buildQuery({
                    page: 1,
                    limit: currentLimit,
                    filter: f.key,
                  })}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "7px 13px 7px 12px",
                    borderRadius: 999,
                    border: isActive
                      ? "1px solid #0a0a0a"
                      : "1px solid rgba(10,10,10,0.10)",
                    background: isActive ? "#0a0a0a" : "#fff",
                    color: isActive ? "#fafaf6" : "#3a3a36",
                    fontSize: 13,
                    fontWeight: 500,
                    textDecoration: "none",
                    fontFamily: GEIST,
                  }}
                >
                  {f.label}
                  <span
                    style={{
                      fontFamily: MONO,
                      fontSize: 10.5,
                      fontWeight: 500,
                      color: isActive ? "rgba(250,250,246,0.7)" : "#8a8a85",
                    }}
                  >
                    {counts[f.key]}
                  </span>
                </a>
              );
            })}
          </div>

          {/* History card */}
          <div
            style={{
              background: "#fafaf6",
              border: "1px solid rgba(10,10,10,0.08)",
              borderRadius: 14,
              overflow: "hidden",
            }}
          >
            {/* Card header */}
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
                {PAGE_SIZES.map((size) => {
                  const isActive = currentLimit === size;
                  return (
                    <a
                      key={size}
                      href={buildQuery({
                        page: 1,
                        limit: size,
                        filter: currentFilter,
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
                  {currentFilter === "todas"
                    ? "Nenhuma análise ainda"
                    : "Nenhuma análise neste filtro"}
                </p>
                <p style={{ fontSize: 13.5, color: "#6a6560", margin: 0 }}>
                  {currentFilter === "todas"
                    ? "Envie seu CV e a descrição de uma vaga para começar."
                    : "Tente selecionar outro filtro."}
                </p>
                {currentFilter === "todas" && (
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
                  >
                    Analisar meu CV
                  </a>
                )}
              </div>
            ) : (
              <div style={{ padding: "10px" }}>
                <div
                  style={{ display: "flex", flexDirection: "column", gap: 8 }}
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
                          className="analises-history-row"
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
                                margin: "0 0 2px",
                              }}
                            >
                              {formatDate(item.createdAt)}
                            </p>
                            <p
                              style={{
                                fontFamily: MONO,
                                fontSize: 11,
                                color: "#c0beb4",
                                margin: "5px 0 0",
                              }}
                            >
                              ID: {item.id}
                            </p>
                          </div>

                          <div
                            className="analises-history-score"
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
                                resumeTitleById.get(item.masterResumeId) ??
                                null,
                            }}
                            jobApplicationId={item.jobApplicationId}
                            adaptationId={item.id}
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
                              <span
                                aria-hidden="true"
                                style={{ display: "inline-flex" }}
                              >
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
                                  <title>Download</title>
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
                        href={buildQuery({
                          page: safeCurrentPage - 1,
                          limit: currentLimit,
                          filter: currentFilter,
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
                        className="analises-page-btn"
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
                        href={buildQuery({
                          page: safeCurrentPage + 1,
                          limit: currentLimit,
                          filter: currentFilter,
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
                        className="analises-page-btn"
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
        </div>
      </main>

      <style>{`
        .analises-page-btn:hover { background: rgba(10,10,10,0.05) !important; }
        @media (max-width: 768px) {
          .analises-content { padding: 12px 16px 60px !important; }
          .analises-top-spacer { padding-top: 54px !important; }
        }
        @media (max-width: 680px) {
          .analises-history-row { align-items: flex-start !important; }
          .analises-history-score { margin-left: auto !important; text-align: right !important; }
        }
      `}</style>
      <PublicFooter />
    </PageShell>
  );
}
