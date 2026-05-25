"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ReactNode, useCallback, useState, useTransition } from "react";

import type { JobApplicationDto, JobApplicationStatus } from "@/lib/job-applications-api";
import {
  CLOSED_STATUSES,
  IN_PROCESS_STATUSES,
  OPEN_STATUSES,
  getStatusConfig,
} from "@/lib/job-application-status";
import { PageShell } from "@/components/page-shell";
import { CreateApplicationModal } from "./create-modal";

const GEIST = "var(--font-geist), -apple-system, system-ui, sans-serif";
const MONO = "var(--font-geist-mono), monospace";

const CARD: React.CSSProperties = {
  background: "#fafaf6",
  border: "1px solid rgba(10,10,10,0.08)",
  borderRadius: 14,
};

type FilterKey = "todas" | "abertas" | "processo" | "finalizadas";

const FILTERS: { key: FilterKey; label: string; statuses: JobApplicationStatus[] | null }[] = [
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
        borderRadius: 5,
        padding: "2px 8px",
        fontFamily: MONO,
        fontSize: 10,
        fontWeight: 500,
        letterSpacing: "0.9px",
        textTransform: "uppercase",
        background: cfg.bg,
        color: cfg.color,
        border: `1px solid ${cfg.border}`,
        whiteSpace: "nowrap",
      }}
    >
      {cfg.label}
    </span>
  );
}

function ScoreBadge({ before, after }: { before: number | null; after: number | null }) {
  if (before === null && after === null) return null;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        fontFamily: MONO,
        fontSize: 10,
        color: "#8a8a85",
      }}
    >
      {before !== null && (
        <span style={{ color: "#6a6560" }}>{before}%</span>
      )}
      {before !== null && after !== null && (
        <span style={{ color: "#c6ff3a", fontSize: 9 }}>→</span>
      )}
      {after !== null && (
        <span
          style={{
            color: "#405410",
            background: "rgba(198,255,58,0.14)",
            padding: "1px 5px",
            borderRadius: 4,
          }}
        >
          {after}%
        </span>
      )}
    </span>
  );
}

function EmptyState({ filter, onAdd }: { filter: FilterKey; onAdd: () => void }) {
  const isFiltered = filter !== "todas";

  return (
    <div
      style={{
        ...CARD,
        padding: "48px 32px",
        textAlign: "center",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 16,
        background: "#f0efe9",
        border: "1px solid rgba(10,10,10,0.06)",
      }}
    >
      <div
        style={{
          width: 48,
          height: 48,
          borderRadius: "50%",
          background: "rgba(10,10,10,0.06)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#8a8a85" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
          <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
        </svg>
      </div>

      {isFiltered ? (
        <>
          <p style={{ fontSize: 15, fontWeight: 500, color: "#45443e", margin: 0 }}>
            Nenhuma candidatura nesta categoria
          </p>
          <p style={{ fontSize: 13.5, color: "#8a8a85", margin: 0, maxWidth: 360 }}>
            As candidaturas desta categoria ainda não foram criadas ou estão em outra categoria.
          </p>
        </>
      ) : (
        <>
          <p style={{ fontSize: 15, fontWeight: 500, color: "#45443e", margin: 0 }}>
            Ainda não há candidaturas
          </p>
          <p style={{ fontSize: 13.5, color: "#8a8a85", margin: 0, maxWidth: 400, lineHeight: 1.6 }}>
            Cada vaga que você analisar no EarlyCV aparecerá aqui automaticamente. Você também pode adicionar candidaturas manualmente.
          </p>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center" }}>
            <Link
              href="/adaptar"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "9px 18px",
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
                padding: "9px 18px",
                borderRadius: 10,
                background: "#fafaf6",
                border: "1px solid #d8d6ce",
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

  return (
    <Link
      href={`/dashboard/candidaturas/${application.id}`}
      style={{ textDecoration: "none", display: "block" }}
    >
      <div
        style={{
          ...CARD,
          padding: "16px 20px",
          display: "flex",
          flexDirection: "column",
          gap: 10,
          transition: "border-color 140ms ease, box-shadow 140ms ease",
          cursor: "pointer",
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(10,10,10,0.16)";
          (e.currentTarget as HTMLDivElement).style.boxShadow = "0 4px 16px -6px rgba(10,10,10,0.10)";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(10,10,10,0.08)";
          (e.currentTarget as HTMLDivElement).style.boxShadow = "none";
        }}
      >
        {/* Top row: title + status */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <p
              style={{
                margin: 0,
                fontSize: 14.5,
                fontWeight: 500,
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
                margin: "2px 0 0",
                fontSize: 13,
                color: "#6a6560",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {application.companyName}
              {application.location ? (
                <span style={{ color: "#8a8a85" }}> · {application.location}</span>
              ) : null}
            </p>
          </div>
          <StatusBadge status={application.status} />
        </div>

        {/* Bottom row: meta */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <ScoreBadge before={application.scoreBefore} after={application.scoreAfter} />
            {hasCv && (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  fontFamily: MONO,
                  fontSize: 10,
                  color: "#405410",
                  background: "rgba(198,255,58,0.12)",
                  padding: "2px 7px",
                  borderRadius: 4,
                  letterSpacing: "0.5px",
                }}
              >
                <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor" stroke="none">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                </svg>
                CV adaptado
              </span>
            )}
          </div>
          <span
            style={{
              fontFamily: MONO,
              fontSize: 10,
              color: "#8a8a85",
              letterSpacing: "0.5px",
              whiteSpace: "nowrap",
              flexShrink: 0,
            }}
          >
            {formatDate(application.updatedAt)}
          </span>
        </div>
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
    abertas: initialApplications.filter((a) => OPEN_STATUSES.includes(a.status as JobApplicationStatus)).length,
    processo: initialApplications.filter((a) => IN_PROCESS_STATUSES.includes(a.status as JobApplicationStatus)).length,
    finalizadas: initialApplications.filter((a) => CLOSED_STATUSES.includes(a.status as JobApplicationStatus)).length,
  };

  const handleCreated = useCallback(() => {
    setShowCreate(false);
    startTransition(() => {
      router.refresh();
    });
  }, [router]);

  return (
    <PageShell>
      <div aria-hidden style={{ position: "fixed", inset: 0, pointerEvents: "none", opacity: 0.4, mixBlendMode: "multiply", zIndex: 0, backgroundImage: `url("data:image/svg+xml;utf8,<svg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.03 0'/></filter><rect width='100%25' height='100%25' filter='url(%23n)'/></svg>")` }} />

      <main style={{ fontFamily: GEIST, minHeight: "100dvh", background: "radial-gradient(ellipse 80% 60% at 50% 0%, #f9f8f4 0%, #ecebe5 100%)", color: "#0a0a0a", position: "relative" }}>
        {header}

        <div style={{ maxWidth: 900, margin: "0 auto", padding: "12px 24px 80px", position: "relative", zIndex: 2 }}>
          {/* Back link */}
          <div style={{ paddingTop: 72, paddingBottom: 4 }}>
            <Link
              href="/dashboard"
              style={{ display: "inline-flex", alignItems: "center", gap: 5, fontFamily: MONO, fontSize: 10, color: "#8a8a85", textDecoration: "none", letterSpacing: "0.8px", textTransform: "uppercase" }}
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
              Dashboard
            </Link>
          </div>

          {/* Page header */}
          <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, marginBottom: 24, flexWrap: "wrap" }}>
            <div>
              <h1 style={{ fontSize: "clamp(24px, 3vw, 32px)", fontWeight: 500, letterSpacing: -1, margin: "8px 0 0", color: "#0a0a0a" }}>
                Minhas candidaturas
              </h1>
              {initialApplications.length > 0 && (
                <p style={{ margin: "4px 0 0", fontSize: 13.5, color: "#6a6560" }}>
                  {initialApplications.length} candidatura{initialApplications.length !== 1 ? "s" : ""}
                  {counts.processo > 0 ? ` · ${counts.processo} em processo` : ""}
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
                padding: "9px 18px",
                borderRadius: 10,
                background: "#0a0a0a",
                color: "#fafaf6",
                fontSize: 13,
                fontWeight: 500,
                cursor: "pointer",
                border: "none",
                fontFamily: GEIST,
                flexShrink: 0,
              }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              Adicionar candidatura
            </button>
          </div>

          {/* Filters */}
          <div style={{ display: "flex", gap: 6, marginBottom: 20, flexWrap: "wrap" }}>
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
                    padding: "6px 14px",
                    borderRadius: 8,
                    border: isActive ? "1px solid rgba(10,10,10,0.18)" : "1px solid rgba(10,10,10,0.08)",
                    background: isActive ? "#fafaf6" : "transparent",
                    color: isActive ? "#0a0a0a" : "#6a6560",
                    fontSize: 13,
                    fontWeight: isActive ? 500 : 400,
                    cursor: "pointer",
                    fontFamily: GEIST,
                    transition: "all 120ms ease",
                  }}
                >
                  {f.label}
                  {count > 0 && (
                    <span
                      style={{
                        fontFamily: MONO,
                        fontSize: 9.5,
                        padding: "1px 5px",
                        borderRadius: 4,
                        background: isActive ? "rgba(10,10,10,0.07)" : "rgba(10,10,10,0.05)",
                        color: isActive ? "#0a0a0a" : "#8a8a85",
                        letterSpacing: "0.5px",
                      }}
                    >
                      {count}
                    </span>
                  )}
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
