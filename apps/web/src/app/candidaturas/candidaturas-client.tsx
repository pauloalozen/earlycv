"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useState,
  useTransition,
} from "react";
import { PageShell } from "@/components/page-shell";
import { PublicFooter } from "@/components/public-footer";
import { trackEvent } from "@/lib/analytics-tracking";
import { extractDashboardAnalysisSignal } from "@/lib/dashboard-test-metrics";
import { IN_PROCESS_STATUSES } from "@/lib/job-application-status";
import type {
  JobApplicationDto,
  JobApplicationStatus,
} from "@/lib/job-applications-api";
import {
  matchesBoardFilters,
  QUICK_FILTERS,
  type QuickFilterKey,
} from "./board-logic";
import { CompanyFilter } from "./company-filter";
import { CreateApplicationModal } from "./create-modal";
import { KanbanBoard } from "./kanban-board";

const GEIST = "var(--font-geist), -apple-system, system-ui, sans-serif";
const MONO = "var(--font-geist-mono), monospace";
const SERIF = "var(--font-instrument-serif), serif";

type SegmentKey = "ativas" | "arquivadas";

function EmptyState({
  segment,
  onAdd,
}: {
  segment: SegmentKey;
  onAdd: () => void;
}) {
  if (segment === "arquivadas") {
    return (
      <div
        style={{
          border: "1.5px dashed rgba(10,10,10,0.14)",
          borderRadius: 18,
          padding: "52px 40px 44px",
          textAlign: "center",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
        }}
      >
        <p
          style={{
            fontSize: 15,
            fontWeight: 500,
            color: "#45443e",
            margin: "0 0 8px",
          }}
        >
          Nenhuma candidatura arquivada
        </p>
        <p
          style={{ fontSize: 13.5, color: "#8a8a85", margin: 0, maxWidth: 360 }}
        >
          Quando você arquivar candidaturas na página de detalhes, elas
          aparecerão aqui.
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
      <div
        style={{
          background: "#fafaf6",
          border: "1.5px dashed rgba(10,10,10,0.14)",
          borderRadius: 18,
          padding: "52px 40px 44px",
          textAlign: "center",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
        }}
      >
        <svg
          width="40"
          height="40"
          viewBox="0 0 40 40"
          fill="none"
          aria-hidden="true"
          style={{ marginBottom: 22, opacity: 0.9 }}
        >
          <rect x="0" y="0" width="12" height="6.5" rx="2" fill="#0a0a0a" />
          <rect x="16" y="0" width="12" height="6.5" rx="2" fill="#0a0a0a" />
          <rect x="32" y="0" width="8" height="6.5" rx="2" fill="#c6ff3a" />
          <rect x="0" y="11.2" width="16" height="6.5" rx="2" fill="#c6ff3a" />
          <rect x="20" y="11.2" width="18" height="6.5" rx="2" fill="#0a0a0a" />
          <rect x="0" y="22.4" width="7" height="6.5" rx="2" fill="#0a0a0a" />
          <rect x="11" y="22.4" width="16" height="6.5" rx="2" fill="#c6ff3a" />
          <rect x="30" y="22.4" width="8" height="6.5" rx="2" fill="#0a0a0a" />
          <rect x="0" y="33.5" width="22" height="6.5" rx="2" fill="#0a0a0a" />
          <rect
            x="26"
            y="33.5"
            width="9"
            height="6.5"
            rx="2"
            fill="rgba(10,10,10,0.14)"
          />
        </svg>

        <div
          style={{
            fontFamily: MONO,
            fontSize: 10.5,
            letterSpacing: 1.2,
            color: "#8a8a85",
            fontWeight: 500,
            marginBottom: 14,
          }}
        >
          NADA POR AQUI AINDA
        </div>

        <p
          style={{
            margin: "0 0 14px",
            fontSize: 36,
            fontWeight: 500,
            letterSpacing: -1.4,
            lineHeight: 1.05,
            color: "#0a0a0a",
          }}
        >
          Toda análise concluída vira{" "}
          <em
            style={{ fontFamily: SERIF, fontStyle: "italic", fontWeight: 400 }}
          >
            uma candidatura.
          </em>
        </p>
        <p
          style={{
            margin: "0 auto 24px",
            fontSize: 15,
            color: "#5a5a55",
            maxWidth: 540,
            lineHeight: 1.55,
          }}
        >
          Quando você termina uma análise de vaga, a candidatura é criada
          automaticamente — com score, link da vaga e o CV adaptado já
          vinculados.
        </p>

        <div style={{ display: "inline-flex", gap: 10 }}>
          <Link
            href="/adaptar"
            style={{
              background: "#0a0a0a",
              color: "#fff",
              borderRadius: 10,
              padding: "12px 20px",
              fontSize: 13.5,
              fontWeight: 500,
              fontFamily: GEIST,
              textDecoration: "none",
              boxShadow: "0 4px 12px rgba(0,0,0,0.12)",
            }}
          >
            Analisar uma vaga →
          </Link>
          <button
            type="button"
            onClick={onAdd}
            style={{
              background: "#fff",
              color: "#0a0a0a",
              border: "1px solid rgba(10,10,10,0.15)",
              borderRadius: 10,
              padding: "12px 18px",
              fontSize: 13.5,
              fontWeight: 500,
              cursor: "pointer",
              fontFamily: GEIST,
            }}
          >
            + Adicionar manualmente
          </button>
        </div>
      </div>

      {/* Flow steps */}
      <div className="cand-flow-steps" style={{ display: "flex", gap: 10 }}>
        {(
          [
            {
              n: "01",
              title: "Análise",
              body: "Cole a vaga ou importe pelo link. Score e gaps são gerados em segundos.",
              accent: false,
            },
            {
              n: "02",
              title: "CV adaptado",
              body: "Gere a versão otimizada do seu CV. O score sobe e fica vinculado.",
              accent: false,
            },
            {
              n: "03",
              title: "Envio",
              body: "Marque como enviada quando se candidatar. O EarlyCV registra a data.",
              accent: false,
            },
            {
              n: "04",
              title: "Entrevista",
              body: "Em processo ou entrevista? Prepare-se com IA usando vaga + CV.",
              accent: true,
            },
          ] as const
        ).flatMap((step, i, arr) => [
          <div
            key={step.n}
            className="cand-flow-step"
            style={{
              flex: 1,
              background: "#fafaf6",
              border: step.accent
                ? "1px solid rgba(110,150,20,0.32)"
                : "1px solid rgba(10,10,10,0.06)",
              borderRadius: 12,
              padding: "14px 16px",
              boxShadow: step.accent
                ? "inset 0 0 0 1px rgba(198,255,58,0.22)"
                : "none",
            }}
          >
            <div
              style={{
                fontFamily: MONO,
                fontSize: 10,
                letterSpacing: 1,
                color: step.accent ? "#3a5008" : "#8a8a85",
                fontWeight: 500,
                marginBottom: 6,
              }}
            >
              {step.n}
            </div>
            <div
              style={{
                fontSize: 14,
                fontWeight: 500,
                letterSpacing: -0.2,
                marginBottom: 4,
                color: "#0a0a0a",
              }}
            >
              {step.title}
            </div>
            <div style={{ fontSize: 12.5, color: "#5a5a55", lineHeight: 1.5 }}>
              {step.body}
            </div>
          </div>,
          ...(i < arr.length - 1
            ? [
                <div
                  key={`arrow-${step.n}`}
                  className="cand-flow-arrow"
                  style={{
                    flex: "0 0 auto",
                    color: "#c0beb4",
                    fontSize: 14,
                    alignSelf: "center",
                  }}
                >
                  →
                </div>,
              ]
            : []),
        ])}
      </div>
    </div>
  );
}

type Props = {
  initialApplications: JobApplicationDto[];
  initialArchivedApplications?: JobApplicationDto[];
  initialView?: SegmentKey;
  applicationsLoadError?: string | null;
  hasMasterResume: boolean;
  hasCredits: boolean;
  header: ReactNode;
};

export function CandidaturasClient({
  initialApplications,
  initialArchivedApplications = [],
  initialView = "ativas",
  applicationsLoadError = null,
  hasMasterResume,
  hasCredits,
  header,
}: Props) {
  const router = useRouter();
  const [segment, setSegment] = useState<SegmentKey>(initialView);
  const [showCreate, setShowCreate] = useState(false);
  const [, startTransition] = useTransition();
  const [archivedApplications, setArchivedApplications] = useState(
    initialArchivedApplications,
  );
  const [derivedScores, setDerivedScores] = useState<
    Record<string, { scoreBefore: number | null; scoreAfter: number | null }>
  >({});

  const [companyFilter, setCompanyFilter] = useState("");
  const [quickFilters, setQuickFilters] = useState<QuickFilterKey[]>([]);
  // Ativas no quadro (kanban) — muda ao arquivar/finalizar sem recarregar.
  const [activeCount, setActiveCount] = useState(initialApplications.length);

  useEffect(() => {
    void trackEvent({ eventName: "candidaturas_page_viewed", eventVersion: 1 });
  }, []);

  useEffect(() => {
    const allApplications = [...initialApplications, ...archivedApplications];
    const targets = allApplications.filter((application) =>
      Boolean(application.currentCvAdaptationId),
    );

    if (targets.length === 0) return;

    let mounted = true;

    const loadDerivedScores = async () => {
      const updates: Record<
        string,
        { scoreBefore: number | null; scoreAfter: number | null }
      > = {};

      await Promise.all(
        targets.map(async (application) => {
          try {
            const adaptationId = application.currentCvAdaptationId;
            if (!adaptationId) return;

            const response = await fetch(
              `/api/cv-adaptation/${adaptationId}/content`,
              { cache: "no-store" },
            );
            if (!response.ok) return;

            const payload = (await response.json()) as {
              adaptedContentJson?: unknown;
            };
            const signal = extractDashboardAnalysisSignal(
              payload.adaptedContentJson,
            );
            updates[application.id] = {
              scoreBefore: signal.adjustments.scoreBefore,
              scoreAfter: signal.score,
            };
          } catch {
            // no-op
          }
        }),
      );

      if (!mounted || Object.keys(updates).length === 0) return;
      setDerivedScores((current) => ({ ...current, ...updates }));
    };

    void loadDerivedScores();
    return () => {
      mounted = false;
    };
  }, [initialApplications, archivedApplications]);

  const scopedApplications =
    segment === "arquivadas" ? archivedApplications : initialApplications;

  const segmentCount =
    segment === "ativas" ? activeCount : archivedApplications.length;

  const inProcessCount = scopedApplications.filter((a) =>
    IN_PROCESS_STATUSES.includes(a.status as JobApplicationStatus),
  ).length;

  const handleRestored = useCallback(
    (applicationId: string) => {
      setArchivedApplications((current) =>
        current.filter((application) => application.id !== applicationId),
      );
      startTransition(() => {
        router.refresh();
      });
    },
    [router],
  );

  const handleCreated = useCallback(() => {
    setShowCreate(false);
    startTransition(() => {
      router.refresh();
    });
  }, [router]);

  const handleArchivedFromBoard = useCallback(
    (application: JobApplicationDto) => {
      setArchivedApplications((current) => [
        application,
        ...current.filter((item) => item.id !== application.id),
      ]);
    },
    [],
  );

  const handleUnarchivedFromBoard = useCallback((applicationId: string) => {
    setArchivedApplications((current) =>
      current.filter((application) => application.id !== applicationId),
    );
  }, []);

  const handleDeleted = useCallback((applicationId: string) => {
    setArchivedApplications((current) =>
      current.filter((application) => application.id !== applicationId),
    );
  }, []);

  const companies = Array.from(
    new Set(scopedApplications.map((a) => a.companyName)),
  ).sort();

  const filteredApplications = scopedApplications.filter((a) =>
    matchesBoardFilters(a, companyFilter, quickFilters),
  );
  const hasActiveFilters = companyFilter !== "" || quickFilters.length > 0;

  const toggleQuickFilter = (key: QuickFilterKey) =>
    setQuickFilters((current) =>
      current.includes(key)
        ? current.filter((k) => k !== key)
        : [...current, key],
    );

  const clearFilters = () => {
    setCompanyFilter("");
    setQuickFilters([]);
  };

  const boardMatchesFilter = useCallback(
    (application: JobApplicationDto) =>
      matchesBoardFilters(application, companyFilter, quickFilters),
    [companyFilter, quickFilters],
  );

  return (
    <PageShell>
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
        {header}

        <style>{`
          @media (max-width: 767px) {
            .cand-wrapper { padding: 12px 14px 60px !important; }
            .cand-top-spacer { padding-top: 54px !important; }
            .cand-flow-steps { flex-direction: column !important; }
            .cand-flow-step { min-width: 0 !important; }
            .cand-flow-arrow { display: none !important; }
          }
        `}</style>
        <div
          className="cand-wrapper"
          style={{
            // Quadro (kanban) — ativas e arquivadas com a mesma largura (4
            // colunas de 300px), pra trocar de aba sem nada mudar de lugar.
            maxWidth: 1300,
            margin: "0 auto",
            padding: "12px 32px 80px",
            position: "relative",
            zIndex: 2,
          }}
        >
          <div className="cand-top-spacer" style={{ paddingTop: 72 }} />

          {applicationsLoadError && (
            <div
              style={{
                marginBottom: 18,
                padding: "12px 14px",
                borderRadius: 10,
                border: "1px solid rgba(185,28,28,0.25)",
                background: "rgba(254,242,242,0.9)",
                color: "#7f1d1d",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                fontSize: 13,
                fontFamily: GEIST,
              }}
            >
              <span>{applicationsLoadError}</span>
              <button
                type="button"
                onClick={() => router.refresh()}
                style={{
                  border: "1px solid rgba(127,29,29,0.3)",
                  background: "#fff",
                  color: "#7f1d1d",
                  borderRadius: 8,
                  padding: "6px 10px",
                  fontSize: 12,
                  fontWeight: 500,
                  cursor: "pointer",
                  fontFamily: GEIST,
                  whiteSpace: "nowrap",
                }}
              >
                Tentar novamente
              </button>
            </div>
          )}

          {/* Page header */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-end",
              gap: 16,
              flexWrap: "wrap",
              marginBottom: 44,
            }}
          >
            <div>
              {/* Kicker chip */}
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
                {segmentCount === 0
                  ? "0 CANDIDATURAS"
                  : `${segmentCount} CANDIDATURAS${inProcessCount > 0 ? ` · ${inProcessCount} EM PROCESSO` : ""}`}
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
                Minhas{" "}
                <em
                  style={{
                    fontFamily: SERIF,
                    fontStyle: "italic",
                    fontWeight: 400,
                  }}
                >
                  candidaturas.
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
                Cada vaga analisada vira uma candidatura. Acompanhe etapas,
                recupere o CV adaptado e prepare suas entrevistas.
              </p>
            </div>

            {segment === "ativas" && (
              <button
                type="button"
                onClick={() => setShowCreate(true)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "12px 18px",
                  borderRadius: 10,
                  background: "#0a0a0a",
                  color: "#fafaf6",
                  fontSize: 13.5,
                  fontWeight: 500,
                  cursor: "pointer",
                  border: "none",
                  fontFamily: GEIST,
                  flexShrink: 0,
                  boxShadow:
                    "0 4px 12px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.08)",
                }}
              >
                <span style={{ fontSize: 16, lineHeight: 1 }}>+</span>
                Adicionar candidatura
              </button>
            )}
          </div>

          {/* Filtros (esquerda) + abas Ativas/Arquivadas (direita), numa
              linha só. As abas aparecem sempre — mesmo com a aba vazia. */}
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              gap: 10,
              marginBottom: 20,
            }}
          >
            {/* Filtros rápidos — qualquer um dos marcados */}
            {scopedApplications.length > 0 ? (
              <fieldset
                aria-label="Filtrar candidaturas"
                style={{
                  border: 0,
                  padding: 0,
                  minWidth: 0,
                  margin: 0,
                  flex: "1 1 auto",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <span
                    style={{
                      fontFamily: MONO,
                      fontSize: 10.5,
                      letterSpacing: 0.6,
                      color: "#8a8a85",
                      marginRight: 4,
                    }}
                  >
                    FILTRAR
                  </span>
                  {companies.length > 1 ? (
                    <CompanyFilter
                      companies={companies}
                      value={companyFilter}
                      onChange={setCompanyFilter}
                    />
                  ) : null}
                  {QUICK_FILTERS.map((filter) => {
                    const active = quickFilters.includes(filter.key);
                    const count = scopedApplications.filter(
                      (application) =>
                        (companyFilter === "" ||
                          application.companyName === companyFilter) &&
                        filter.matches(application),
                    ).length;
                    return (
                      <button
                        key={filter.key}
                        type="button"
                        aria-pressed={active}
                        onClick={() => toggleQuickFilter(filter.key)}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 6,
                          height: 32,
                          padding: "0 12px",
                          borderRadius: 999,
                          border: active
                            ? "1px solid #0a0a0a"
                            : "1px solid rgba(10,10,10,0.10)",
                          background: active ? "#0a0a0a" : "#fff",
                          color: active ? "#fafaf6" : "#3a3a36",
                          fontFamily: GEIST,
                          fontSize: 12.5,
                          cursor: "pointer",
                        }}
                      >
                        {filter.key === "job_closed" ? (
                          <span
                            aria-hidden
                            style={{
                              width: 6,
                              height: 6,
                              borderRadius: "50%",
                              background: "#ef4444",
                            }}
                          />
                        ) : null}
                        {filter.label}
                        <span
                          style={{
                            fontFamily: MONO,
                            fontSize: 10.5,
                            opacity: 0.7,
                          }}
                        >
                          {count}
                        </span>
                      </button>
                    );
                  })}
                  {hasActiveFilters ? (
                    <button
                      type="button"
                      onClick={clearFilters}
                      style={{
                        height: 32,
                        padding: "0 8px",
                        border: 0,
                        background: "transparent",
                        color: "#3a3a36",
                        fontFamily: GEIST,
                        fontSize: 12.5,
                        textDecoration: "underline",
                        textUnderlineOffset: 3,
                        cursor: "pointer",
                      }}
                    >
                      Limpar filtros
                    </button>
                  ) : null}
                </div>
              </fieldset>
            ) : null}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginLeft: "auto",
              }}
            >
              <button
                type="button"
                onClick={() => {
                  setSegment("ativas");
                  setCompanyFilter("");
                  setQuickFilters([]);
                }}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "7px 13px 7px 12px",
                  borderRadius: 999,
                  border:
                    segment === "ativas"
                      ? "1px solid #0a0a0a"
                      : "1px solid rgba(10,10,10,0.10)",
                  background: segment === "ativas" ? "#0a0a0a" : "#fff",
                  color: segment === "ativas" ? "#fafaf6" : "#3a3a36",
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: "pointer",
                  fontFamily: GEIST,
                }}
              >
                Ativas
                <span
                  style={{
                    fontFamily: MONO,
                    fontSize: 10.5,
                    fontWeight: 500,
                    color:
                      segment === "ativas"
                        ? "rgba(250,250,246,0.7)"
                        : "#8a8a85",
                  }}
                >
                  {activeCount}
                </span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setSegment("arquivadas");
                  setCompanyFilter("");
                  setQuickFilters([]);
                }}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "7px 13px 7px 12px",
                  borderRadius: 999,
                  border:
                    segment === "arquivadas"
                      ? "1px solid #0a0a0a"
                      : "1px solid rgba(10,10,10,0.10)",
                  background: segment === "arquivadas" ? "#0a0a0a" : "#fff",
                  color: segment === "arquivadas" ? "#fafaf6" : "#3a3a36",
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: "pointer",
                  fontFamily: GEIST,
                }}
              >
                Arquivadas
                <span
                  style={{
                    fontFamily: MONO,
                    fontSize: 10.5,
                    fontWeight: 500,
                    color:
                      segment === "arquivadas"
                        ? "rgba(250,250,246,0.7)"
                        : "#8a8a85",
                  }}
                >
                  {archivedApplications.length}
                </span>
              </button>
            </div>
          </div>

          {/* Sections */}
          {scopedApplications.length === 0 ? (
            <EmptyState segment={segment} onAdd={() => setShowCreate(true)} />
          ) : segment === "ativas" ? (
            <>
              {hasActiveFilters && filteredApplications.length === 0 ? (
                <div
                  style={{
                    padding: "20px 22px",
                    marginBottom: 12,
                    textAlign: "center",
                    color: "#8a8a85",
                    fontSize: 14,
                    border: "1px dashed rgba(10,10,10,0.12)",
                    borderRadius: 14,
                  }}
                >
                  Nenhuma candidatura ativa com esses filtros.{" "}
                  <button
                    type="button"
                    onClick={clearFilters}
                    style={{
                      background: "none",
                      border: "none",
                      color: "#0a0a0a",
                      cursor: "pointer",
                      fontFamily: GEIST,
                      fontSize: 14,
                      textDecoration: "underline",
                      padding: 0,
                    }}
                  >
                    Limpar filtro
                  </button>
                </div>
              ) : null}
              <KanbanBoard
                initialApplications={initialApplications}
                matchesFilter={boardMatchesFilter}
                derivedScores={derivedScores}
                hasCredits={hasCredits}
                onArchived={handleArchivedFromBoard}
                onUnarchived={handleUnarchivedFromBoard}
                onActiveCountChange={setActiveCount}
              />
            </>
          ) : (
            <>
              {hasActiveFilters && filteredApplications.length === 0 ? (
                <div
                  style={{
                    padding: "20px 22px",
                    marginBottom: 12,
                    textAlign: "center",
                    color: "#8a8a85",
                    fontSize: 14,
                    border: "1px dashed rgba(10,10,10,0.12)",
                    borderRadius: 14,
                  }}
                >
                  Nenhuma candidatura arquivada com esses filtros.{" "}
                  <button
                    type="button"
                    onClick={clearFilters}
                    style={{
                      background: "none",
                      border: "none",
                      color: "#0a0a0a",
                      cursor: "pointer",
                      fontFamily: GEIST,
                      fontSize: 14,
                      textDecoration: "underline",
                      padding: 0,
                    }}
                  >
                    Limpar filtros
                  </button>
                </div>
              ) : null}
              {/* Arquivadas: mesmo quadro, só pra consulta (Restaurar/Excluir) */}
              <KanbanBoard
                mode="archived"
                initialApplications={archivedApplications}
                matchesFilter={boardMatchesFilter}
                derivedScores={derivedScores}
                hasCredits={hasCredits}
                onRestored={handleRestored}
                onDeleted={handleDeleted}
              />
            </>
          )}
        </div>

        <style>{`
          @media (max-width: 767px) {
            .cand-row { grid-template-columns: 1fr !important; max-width: 100% !important; }
            .cand-row > * { border-left: none !important; }
            .cand-row > :first-child { min-width: 0 !important; overflow: hidden !important; }
          }
          .cand-row:hover {
            border-color: rgba(10,10,10,0.16) !important;
            box-shadow: 0 4px 20px -4px rgba(10,10,10,0.12) !important;
          }
        `}</style>
      </main>

      <PublicFooter />

      <CreateApplicationModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={handleCreated}
        hasMasterResume={hasMasterResume}
      />
    </PageShell>
  );
}
