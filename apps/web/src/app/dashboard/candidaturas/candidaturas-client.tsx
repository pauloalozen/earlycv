"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ReactNode, useCallback, useState, useTransition } from "react";
import { PageShell } from "@/components/page-shell";
import {
  CLOSED_STATUSES,
  getStatusConfig,
  IN_PROCESS_STATUSES,
  OPEN_STATUSES,
} from "@/lib/job-application-status";
import type {
  JobApplicationDto,
  JobApplicationStatus,
} from "@/lib/job-applications-api";
import { CreateApplicationModal } from "./create-modal";

const GEIST = "var(--font-geist), -apple-system, system-ui, sans-serif";
const MONO = "var(--font-geist-mono), monospace";
const SERIF = "var(--font-instrument-serif), serif";

const CARD: React.CSSProperties = {
  background: "#fafaf6",
  border: "1px solid rgba(10,10,10,0.08)",
  borderRadius: 14,
};

type FilterKey = "todas" | "abertas" | "processo" | "finalizadas";

const FILTERS: {
  key: FilterKey;
  label: string;
  statuses: JobApplicationStatus[] | null;
}[] = [
  { key: "todas", label: "Todas", statuses: null },
  { key: "abertas", label: "Em aberto", statuses: OPEN_STATUSES },
  { key: "processo", label: "Em processo", statuses: IN_PROCESS_STATUSES },
  { key: "finalizadas", label: "Finalizadas", statuses: CLOSED_STATUSES },
];

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function StatusBadge({ status }: { status: string }) {
  const cfg = getStatusConfig(status);
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        background: cfg.bg,
        color: cfg.color,
        border: `1px solid ${cfg.border}`,
        borderRadius: 999,
        padding: "5px 11px 5px 9px",
        fontFamily: MONO,
        fontSize: 11.5,
        fontWeight: 500,
        letterSpacing: 0.3,
        lineHeight: 1,
        whiteSpace: "nowrap",
        flexShrink: 0,
      }}
    >
      <span
        style={{
          width: 5,
          height: 5,
          borderRadius: "50%",
          background: cfg.dot,
          flexShrink: 0,
          boxShadow: cfg.dotGlow ? `0 0 6px ${cfg.dot}` : "none",
        }}
      />
      {cfg.label.toUpperCase()}
    </span>
  );
}

function EmptyState({
  filter,
  onAdd,
}: {
  filter: FilterKey;
  onAdd: () => void;
}) {
  const isFiltered = filter !== "todas";
  const steps = ["Análise", "CV adaptado", "Envio", "Entrevista"];

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
      {isFiltered ? (
        <>
          <p
            style={{
              fontSize: 15,
              fontWeight: 500,
              color: "#45443e",
              margin: "0 0 8px",
            }}
          >
            Nenhuma candidatura nesta categoria
          </p>
          <p
            style={{
              fontSize: 13.5,
              color: "#8a8a85",
              margin: 0,
              maxWidth: 360,
            }}
          >
            As candidaturas desta categoria ainda não foram criadas ou estão em
            outra categoria.
          </p>
        </>
      ) : (
        <>
          <svg
            width="40"
            height="32"
            viewBox="0 0 40 32"
            fill="none"
            aria-hidden="true"
            style={{ marginBottom: 22 }}
          >
            <rect
              x="0"
              y="0"
              width="13"
              height="4"
              rx="1.5"
              fill="rgba(10,10,10,0.45)"
            />
            <rect
              x="17"
              y="0"
              width="10"
              height="4"
              rx="1.5"
              fill="rgba(10,10,10,0.45)"
            />
            <rect x="31" y="0" width="9" height="4" rx="1.5" fill="#c6ff3a" />
            <rect x="0" y="14" width="15" height="4" rx="1.5" fill="#c6ff3a" />
            <rect
              x="19"
              y="14"
              width="21"
              height="4"
              rx="1.5"
              fill="rgba(10,10,10,0.45)"
            />
            <rect
              x="0"
              y="28"
              width="8"
              height="4"
              rx="1.5"
              fill="rgba(10,10,10,0.45)"
            />
            <rect x="12" y="28" width="15" height="4" rx="1.5" fill="#c6ff3a" />
            <rect
              x="31"
              y="28"
              width="9"
              height="4"
              rx="1.5"
              fill="rgba(10,10,10,0.18)"
            />
          </svg>

          <p
            style={{
              margin: "0 0 10px",
              fontSize: 36,
              fontWeight: 500,
              letterSpacing: -1.4,
              color: "#0a0a0a",
              lineHeight: 1.1,
            }}
          >
            Ainda nada por aqui.
          </p>
          <p
            style={{
              margin: "0 0 28px",
              fontSize: 15.5,
              color: "#5a5a55",
              maxWidth: 440,
              lineHeight: 1.6,
            }}
          >
            Cada vaga analisada no EarlyCV aparecerá aqui automaticamente — com
            score, gaps e CV adaptado vinculado.
          </p>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginBottom: 32,
              flexWrap: "wrap",
              justifyContent: "center",
            }}
          >
            {steps.flatMap((step, i) => [
              <span
                key={step}
                style={{
                  fontFamily: MONO,
                  fontSize: 11,
                  color: "#8a8a85",
                  letterSpacing: 0.5,
                }}
              >
                {step}
              </span>,
              ...(i < steps.length - 1
                ? [
                    <span
                      key={`after-${step}`}
                      style={{ color: "#c6ff3a", fontSize: 12, lineHeight: 1 }}
                    >
                      →
                    </span>,
                  ]
                : []),
            ])}
          </div>

          <div
            style={{
              display: "flex",
              gap: 10,
              flexWrap: "wrap",
              justifyContent: "center",
            }}
          >
            <Link
              href="/adaptar"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "10px 20px",
                borderRadius: 10,
                background: "#0a0a0a",
                color: "#fafaf6",
                fontSize: 13,
                fontWeight: 500,
                textDecoration: "none",
                fontFamily: GEIST,
              }}
            >
              Analisar uma vaga
            </Link>
            <button
              type="button"
              onClick={onAdd}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "10px 20px",
                borderRadius: 10,
                background: "#fff",
                border: "1px solid rgba(10,10,10,0.15)",
                color: "#0a0a0a",
                fontSize: 13,
                fontWeight: 500,
                cursor: "pointer",
                fontFamily: GEIST,
              }}
            >
              Adicionar manualmente
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function ApplicationCard({ application }: { application: JobApplicationDto }) {
  const hasCv = Boolean(application.currentCvAdaptationId);
  const hasScore =
    application.scoreBefore !== null || application.scoreAfter !== null;
  const displayScore = application.scoreAfter ?? application.scoreBefore;
  const isScoreImproved = application.scoreAfter !== null;

  return (
    <Link
      href={`/dashboard/candidaturas/${application.id}`}
      style={{ textDecoration: "none", display: "block" }}
    >
      {/* biome-ignore lint/a11y/noStaticElementInteractions: hover-only visual effect, interaction is via parent Link */}
      <div
        style={{
          ...CARD,
          display: "grid",
          gridTemplateColumns: hasScore ? "1fr 130px" : "1fr",
          gap: 0,
          alignItems: "stretch",
          overflow: "hidden",
          cursor: "pointer",
          transition: "border-color 140ms ease, box-shadow 140ms ease",
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLDivElement).style.borderColor =
            "rgba(10,10,10,0.16)";
          (e.currentTarget as HTMLDivElement).style.boxShadow =
            "0 4px 20px -4px rgba(10,10,10,0.12)";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLDivElement).style.borderColor =
            "rgba(10,10,10,0.08)";
          (e.currentTarget as HTMLDivElement).style.boxShadow = "none";
        }}
      >
        {/* Col 1: main info */}
        <div style={{ padding: "18px 22px" }}>
          <p
            style={{
              margin: "0 0 4px",
              fontSize: 16,
              fontWeight: 500,
              letterSpacing: -0.3,
              color: "#0a0a0a",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {application.jobTitle}
          </p>
          <p
            style={{
              margin: "0 0 12px",
              fontSize: 13.5,
              fontWeight: 500,
              color: "#3a3a36",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {application.companyName}
            {application.location ? (
              <span style={{ color: "#8a8a85", fontWeight: 400 }}>
                {" "}
                · {application.location}
              </span>
            ) : null}
          </p>
          {/* Badges row */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              flexWrap: "wrap",
            }}
          >
            <StatusBadge status={application.status} />
            {hasCv && (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 5,
                  fontFamily: MONO,
                  fontSize: 10,
                  color: "#3a5008",
                  background: "rgba(198,255,58,0.18)",
                  padding: "3px 9px 3px 7px",
                  borderRadius: 999,
                  border: "1px solid rgba(110,150,20,0.22)",
                  letterSpacing: 0.3,
                  lineHeight: 1,
                  whiteSpace: "nowrap",
                }}
              >
                <span
                  style={{
                    width: 4,
                    height: 4,
                    borderRadius: "50%",
                    background: "#7aa811",
                    flexShrink: 0,
                  }}
                />
                CV ADAPTADO
              </span>
            )}
            <span
              style={{
                fontFamily: MONO,
                fontSize: 10,
                color: "#8a8a85",
                letterSpacing: 0.5,
                whiteSpace: "nowrap",
                marginLeft: "auto",
              }}
            >
              {formatDate(application.updatedAt)}
            </span>
          </div>
        </div>

        {/* Col 2: score */}
        {hasScore && displayScore !== null && (
          <div
            style={{
              borderLeft: "1px solid rgba(10,10,10,0.06)",
              padding: "18px 16px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              textAlign: "center",
            }}
          >
            <div
              style={{
                fontFamily: MONO,
                fontSize: 9.5,
                letterSpacing: 1,
                color: "#8a8a85",
                fontWeight: 500,
                marginBottom: 4,
              }}
            >
              {isScoreImproved ? "COMPAT." : "SCORE"}
            </div>
            <div
              style={{
                fontSize: 30,
                fontWeight: 500,
                letterSpacing: -1.2,
                color: isScoreImproved ? "#2a6a10" : "#6a6560",
                lineHeight: 1,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {displayScore}
              <span style={{ fontSize: 16, marginLeft: 1 }}>%</span>
            </div>
            {application.scoreBefore !== null &&
              application.scoreAfter !== null && (
                <div
                  style={{
                    fontFamily: MONO,
                    fontSize: 10,
                    color: "#8a8a85",
                    marginTop: 4,
                  }}
                >
                  antes {application.scoreBefore}%
                </div>
              )}
          </div>
        )}
      </div>
    </Link>
  );
}

type Props = {
  initialApplications: JobApplicationDto[];
  header: ReactNode;
};

export function CandidaturasClient({ initialApplications, header }: Props) {
  const router = useRouter();
  const [filter, setFilter] = useState<FilterKey>("todas");
  const [showCreate, setShowCreate] = useState(false);
  const [, startTransition] = useTransition();

  const filteredApplications = initialApplications.filter((app) => {
    const group = FILTERS.find((f) => f.key === filter);
    if (!group?.statuses) return true;
    return group.statuses.includes(app.status as JobApplicationStatus);
  });

  const counts = {
    todas: initialApplications.length,
    abertas: initialApplications.filter((a) =>
      OPEN_STATUSES.includes(a.status as JobApplicationStatus),
    ).length,
    processo: initialApplications.filter((a) =>
      IN_PROCESS_STATUSES.includes(a.status as JobApplicationStatus),
    ).length,
    finalizadas: initialApplications.filter((a) =>
      CLOSED_STATUSES.includes(a.status as JobApplicationStatus),
    ).length,
  };

  const handleCreated = useCallback(() => {
    setShowCreate(false);
    startTransition(() => {
      router.refresh();
    });
  }, [router]);

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

        <div
          style={{
            maxWidth: 900,
            margin: "0 auto",
            padding: "12px 24px 80px",
            position: "relative",
            zIndex: 2,
          }}
        >
          {/* Back link */}
          <div style={{ paddingTop: 72, paddingBottom: 4 }}>
            <Link
              href="/dashboard"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                fontFamily: MONO,
                fontSize: 10,
                color: "#8a8a85",
                textDecoration: "none",
                letterSpacing: "0.8px",
                textTransform: "uppercase",
              }}
            >
              <svg
                aria-hidden="true"
                width="11"
                height="11"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="15 18 9 12 15 6" />
              </svg>
              Dashboard
            </Link>
          </div>

          {/* Page header */}
          <div style={{ marginBottom: 24 }}>
            {/* Kicker chip */}
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 7,
                fontFamily: MONO,
                fontSize: 10.5,
                letterSpacing: 1.2,
                background: "rgba(10,10,10,0.04)",
                borderRadius: 999,
                padding: "4px 12px 4px 8px",
                fontWeight: 500,
                color: "#0a0a0a",
                marginBottom: 10,
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
              MINHAS CANDIDATURAS
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "flex-end",
                justifyContent: "space-between",
                gap: 16,
                flexWrap: "wrap",
              }}
            >
              <div>
                <h1
                  style={{
                    fontSize: "clamp(32px, 4vw, 48px)",
                    fontWeight: 500,
                    letterSpacing: -2,
                    margin: "0 0 6px",
                    color: "#0a0a0a",
                    lineHeight: 1.05,
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
                {initialApplications.length > 0 && (
                  <p style={{ margin: 0, fontSize: 15.5, color: "#5a5a55" }}>
                    {initialApplications.length} candidatura
                    {initialApplications.length !== 1 ? "s" : ""}
                    {counts.processo > 0
                      ? ` · ${counts.processo} em processo`
                      : ""}
                    {counts.abertas > 0 ? ` · ${counts.abertas} em aberto` : ""}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setShowCreate(true)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "10px 18px",
                  borderRadius: 10,
                  background: "#0a0a0a",
                  color: "#fafaf6",
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: "pointer",
                  border: "none",
                  fontFamily: GEIST,
                  flexShrink: 0,
                  boxShadow: "0 4px 12px rgba(0,0,0,0.12)",
                }}
              >
                <svg
                  aria-hidden="true"
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                Adicionar candidatura
              </button>
            </div>
          </div>

          {/* Filters */}
          <div
            style={{
              display: "flex",
              gap: 6,
              marginBottom: 20,
              flexWrap: "wrap",
            }}
          >
            {FILTERS.map((f) => {
              const isActive = filter === f.key;
              const count = counts[f.key];
              return (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setFilter(f.key)}
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
                    cursor: "pointer",
                    fontFamily: GEIST,
                    transition: "all 120ms ease",
                  }}
                >
                  {f.label}
                  <span
                    style={{
                      fontFamily: MONO,
                      fontSize: 10.5,
                      color: isActive ? "rgba(250,250,246,0.7)" : "#8a8a85",
                      fontWeight: 500,
                    }}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* List */}
          {filteredApplications.length === 0 ? (
            <EmptyState filter={filter} onAdd={() => setShowCreate(true)} />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {filteredApplications.map((app) => (
                <ApplicationCard key={app.id} application={app} />
              ))}
            </div>
          )}
        </div>
      </main>

      <CreateApplicationModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={handleCreated}
      />
    </PageShell>
  );
}
