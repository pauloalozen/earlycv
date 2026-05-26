"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ReactNode, useId, useState, useTransition } from "react";
import { PageShell } from "@/components/page-shell";
import { ALL_STATUSES, getStatusConfig } from "@/lib/job-application-status";
import type {
  JobApplicationDetailDto,
  JobApplicationEvent,
  JobApplicationStatus,
} from "@/lib/job-applications-api";
import {
  addJobApplicationNote,
  updateJobApplicationStatus,
} from "@/lib/job-applications-api";
import { InterviewPrepDrawer } from "./interview-prep-drawer";

const GEIST = "var(--font-geist), -apple-system, system-ui, sans-serif";
const MONO = "var(--font-geist-mono), monospace";

const CARD: React.CSSProperties = {
  background: "#fafaf6",
  border: "1px solid rgba(10,10,10,0.08)",
  borderRadius: 14,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 13px",
  borderRadius: 10,
  border: "1px solid rgba(10,10,10,0.10)",
  background: "#fff",
  fontSize: 13.5,
  color: "#0a0a0a",
  fontFamily: GEIST,
  outline: "none",
  boxSizing: "border-box",
};

const EVENT_LABELS: Record<string, string> = {
  APPLICATION_CREATED: "Candidatura criada",
  ANALYSIS_COMPLETED: "Análise concluída",
  CV_READY: "CV adaptado pronto",
  STATUS_CHANGED: "Status atualizado",
  NOTE_ADDED: "Nota adicionada",
  MARKED_AS_SENT: "Candidatura enviada",
  INTERVIEW_PREP_GENERATED: "Preparação para entrevista gerada",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
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

function SectionCard({
  title,
  right,
  children,
}: {
  title: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: 0 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          marginBottom: 8,
        }}
      >
        <div
          style={{
            fontFamily: MONO,
            fontSize: 10,
            letterSpacing: 1.2,
            color: "#8a8a85",
            fontWeight: 500,
          }}
        >
          {title}
        </div>
        {right && <div>{right}</div>}
      </div>
      <div style={{ ...CARD, padding: "18px 22px" }}>{children}</div>
    </div>
  );
}

function Timeline({ events }: { events: JobApplicationEvent[] }) {
  if (events.length === 0) return null;

  return (
    <SectionCard
      title="HISTÓRICO"
      right={
        <span style={{ fontFamily: MONO, fontSize: 10.5, color: "#8a8a85" }}>
          {events.length} eventos
        </span>
      }
    >
      <div style={{ display: "flex", flexDirection: "column" }}>
        {events.map((event, idx) => {
          const cfg = event.newStatus ? getStatusConfig(event.newStatus) : null;
          const isLast = idx === events.length - 1;
          const isAccent =
            event.eventType === "CV_READY" ||
            event.eventType === "ANALYSIS_COMPLETED";
          return (
            <div
              key={event.id}
              style={{
                display: "grid",
                gridTemplateColumns: "110px 18px 1fr",
                gap: 12,
                alignItems: "flex-start",
                paddingBottom: isLast ? 0 : 14,
                position: "relative",
              }}
            >
              {/* Date col */}
              <div
                style={{
                  fontFamily: MONO,
                  fontSize: 11,
                  color: "#8a8a85",
                  letterSpacing: 0.3,
                  paddingTop: 1,
                }}
              >
                {formatDateTime(event.createdAt)}
              </div>

              {/* Dot col */}
              <div style={{ position: "relative", alignSelf: "stretch" }}>
                {!isLast && (
                  <div
                    style={{
                      position: "absolute",
                      left: 7,
                      top: 16,
                      bottom: -14,
                      width: 1,
                      background: "rgba(10,10,10,0.08)",
                    }}
                  />
                )}
                <div
                  style={{
                    position: "relative",
                    width: 15,
                    height: 15,
                    borderRadius: "50%",
                    background: isAccent ? "#c6ff3a" : "#fff",
                    border: isAccent
                      ? "1px solid rgba(110,150,20,0.4)"
                      : "1px solid rgba(10,10,10,0.18)",
                    boxShadow: isAccent
                      ? "0 0 0 3px rgba(198,255,58,0.18)"
                      : "0 0 0 3px #fafaf6",
                  }}
                />
              </div>

              {/* Content col */}
              <div style={{ flex: 1 }}>
                <p
                  style={{
                    margin: 0,
                    fontSize: 13.5,
                    color: "#0a0a0a",
                    lineHeight: 1.5,
                    marginBottom: 3,
                    fontFamily: GEIST,
                  }}
                >
                  {EVENT_LABELS[event.eventType] ?? event.eventType}
                </p>
                {event.newStatus && (
                  <p
                    style={{
                      margin: "1px 0 3px",
                      fontSize: 12,
                      color: "#6a6560",
                      fontFamily: GEIST,
                    }}
                  >
                    Status:{" "}
                    <span
                      style={{
                        color: cfg?.color ?? "#6a6560",
                        fontWeight: 500,
                      }}
                    >
                      {getStatusConfig(event.newStatus).label}
                    </span>
                  </p>
                )}
                <span
                  style={{
                    fontFamily: MONO,
                    fontSize: 10,
                    letterSpacing: 0.5,
                    color: "#8a8a85",
                  }}
                >
                  {event.eventType.toLowerCase().replace(/_/g, ".")}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </SectionCard>
  );
}

function UpdateStatusPanel({
  applicationId,
  currentStatus,
  onUpdated,
}: {
  applicationId: string;
  currentStatus: JobApplicationStatus;
  onUpdated: () => void;
}) {
  const [selected, setSelected] = useState<JobApplicationStatus>(currentStatus);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const selectId = useId();

  const isDirty = selected !== currentStatus;

  function handleChange(status: JobApplicationStatus) {
    setSelected(status);
    setError(null);
  }

  function handleSave() {
    if (!isDirty || pending) return;
    startTransition(async () => {
      try {
        await updateJobApplicationStatus(applicationId, selected);
        onUpdated();
      } catch {
        setError("Falha ao atualizar status. Tente novamente.");
      }
    });
  }

  return (
    <div style={{ ...CARD, padding: "18px 20px" }}>
      <p
        style={{
          margin: "0 0 12px",
          fontFamily: MONO,
          fontSize: 10,
          letterSpacing: 1.2,
          color: "#8a8a85",
          fontWeight: 500,
        }}
      >
        ATUALIZAR STATUS
      </p>
      <label htmlFor={selectId} style={{ display: "none" }}>
        Status da candidatura
      </label>
      <select
        id={selectId}
        value={selected}
        onChange={(e) => handleChange(e.target.value as JobApplicationStatus)}
        style={{ ...inputStyle, marginBottom: 10, cursor: "pointer" }}
      >
        {ALL_STATUSES.map((s) => (
          <option key={s} value={s}>
            {getStatusConfig(s).label}
          </option>
        ))}
      </select>

      {error && (
        <p
          style={{
            margin: "0 0 10px",
            fontSize: 12,
            color: "#991b1b",
            background: "#fee2e2",
            padding: "7px 10px",
            borderRadius: 7,
          }}
        >
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={handleSave}
        disabled={!isDirty || pending}
        style={{
          width: "100%",
          padding: "11px 0",
          borderRadius: 10,
          border: "none",
          background: isDirty && !pending ? "#0a0a0a" : "rgba(10,10,10,0.08)",
          color: isDirty && !pending ? "#fafaf6" : "#8a8a85",
          fontSize: 13,
          fontWeight: 500,
          cursor: isDirty && !pending ? "pointer" : "not-allowed",
          fontFamily: GEIST,
          transition: "all 140ms ease",
        }}
      >
        {pending ? "Salvando…" : "Salvar status"}
      </button>
    </div>
  );
}

function NotesPanel({
  applicationId,
  currentNotes,
  onUpdated,
}: {
  applicationId: string;
  currentNotes: string | null;
  onUpdated: () => void;
}) {
  const [note, setNote] = useState(currentNotes ?? "");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const textareaId = useId();

  const isDirty = note.trim() !== (currentNotes ?? "").trim();

  function handleSave() {
    if (!note.trim() || !isDirty || pending) return;
    startTransition(async () => {
      try {
        await addJobApplicationNote(applicationId, note.trim());
        setSaved(true);
        onUpdated();
        setTimeout(() => setSaved(false), 2500);
      } catch {
        setError("Falha ao salvar nota. Tente novamente.");
      }
    });
  }

  return (
    <div style={{ ...CARD, padding: "18px 20px" }}>
      <p
        style={{
          margin: "0 0 12px",
          fontFamily: MONO,
          fontSize: 10,
          letterSpacing: 1.2,
          color: "#8a8a85",
          fontWeight: 500,
        }}
      >
        NOTAS
      </p>
      <label htmlFor={textareaId} style={{ display: "none" }}>
        Notas da candidatura
      </label>
      <textarea
        id={textareaId}
        value={note}
        onChange={(e) => {
          setNote(e.target.value);
          setError(null);
          setSaved(false);
        }}
        placeholder="Anotações sobre a vaga, contatos, próximos passos..."
        rows={4}
        style={{
          ...inputStyle,
          resize: "vertical",
          minHeight: 90,
          lineHeight: 1.55,
          marginBottom: 10,
        }}
      />
      {error && (
        <p
          style={{
            margin: "0 0 10px",
            fontSize: 12,
            color: "#991b1b",
            background: "#fee2e2",
            padding: "7px 10px",
            borderRadius: 7,
          }}
        >
          {error}
        </p>
      )}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-end",
          gap: 10,
        }}
      >
        {saved && (
          <span
            style={{
              fontSize: 12,
              color: "#405410",
              fontFamily: MONO,
              letterSpacing: "0.5px",
            }}
          >
            ✔ Salvo
          </span>
        )}
        <button
          type="button"
          onClick={handleSave}
          disabled={!note.trim() || !isDirty || pending}
          style={{
            padding: "8px 16px",
            borderRadius: 10,
            border: "none",
            background:
              note.trim() && isDirty && !pending
                ? "#0a0a0a"
                : "rgba(10,10,10,0.08)",
            color: note.trim() && isDirty && !pending ? "#fafaf6" : "#8a8a85",
            fontSize: 12.5,
            fontWeight: 500,
            cursor:
              note.trim() && isDirty && !pending ? "pointer" : "not-allowed",
            fontFamily: GEIST,
            transition: "all 140ms ease",
          }}
        >
          {pending ? "Salvando…" : "Salvar nota"}
        </button>
      </div>
    </div>
  );
}

type Props = {
  application: JobApplicationDetailDto;
  header: ReactNode;
};

const PREP_ELIGIBLE_STATUSES: JobApplicationStatus[] = [
  "APPLIED",
  "IN_PROCESS",
  "INTERVIEW",
  "ASSESSMENT",
  "OFFER",
];

export function DetailClient({ application, header }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [showPrep, setShowPrep] = useState(false);

  function handleUpdated() {
    startTransition(() => {
      router.refresh();
    });
  }

  const hasCvAdaptations = application.cvAdaptations.length > 0;
  const latestCv = application.cvAdaptations[0] ?? null;
  const isPrepEligible = PREP_ELIGIBLE_STATUSES.includes(application.status);
  const isInterview = application.status === "INTERVIEW";

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
          {/* Back link / breadcrumb */}
          <div style={{ paddingTop: 72, paddingBottom: 4 }}>
            <div
              style={{
                display: "flex",
                gap: 7,
                fontFamily: MONO,
                fontSize: 11,
                letterSpacing: 0.4,
              }}
            >
              <Link
                href="/dashboard/candidaturas"
                style={{ color: "#8a8a85", textDecoration: "none" }}
              >
                Minhas candidaturas
              </Link>
              <span style={{ color: "#c0beb4" }}>/</span>
              <span style={{ color: "#0a0a0a" }}>{application.jobTitle}</span>
            </div>
          </div>

          {/* Hero — company + title + meta + actions */}
          <div style={{ marginBottom: 24, marginTop: 14 }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                gap: 24,
                flexWrap: "wrap",
              }}
            >
              <div style={{ minWidth: 0, flex: 1 }}>
                <p
                  style={{
                    fontFamily: MONO,
                    fontSize: 11,
                    color: "#5a5a55",
                    letterSpacing: 0.5,
                    marginBottom: 8,
                    textTransform: "uppercase",
                  }}
                >
                  {application.companyName}
                  {application.location ? ` · ${application.location}` : ""}
                </p>
                <h1
                  style={{
                    margin: "0 0 14px",
                    fontSize: "clamp(22px, 3vw, 38px)",
                    fontWeight: 500,
                    letterSpacing: -1.5,
                    lineHeight: 1.05,
                    color: "#0a0a0a",
                  }}
                >
                  {application.jobTitle}
                </h1>
                {/* Meta row */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    flexWrap: "wrap",
                  }}
                >
                  <StatusBadge status={application.status} />
                  <span
                    style={{
                      fontFamily: MONO,
                      fontSize: 12.5,
                      color: "#5a5a55",
                    }}
                  >
                    Atualizado em{" "}
                    <strong>{formatDate(application.updatedAt)}</strong>
                  </span>
                  {application.appliedAt && (
                    <>
                      <span style={{ color: "#c0beb4" }}>·</span>
                      <span
                        style={{
                          fontFamily: MONO,
                          fontSize: 12.5,
                          color: "#5a5a55",
                        }}
                      >
                        Enviada em{" "}
                        <strong>{formatDate(application.appliedAt)}</strong>
                      </span>
                    </>
                  )}
                  {(application.scoreBefore !== null ||
                    application.scoreAfter !== null) && (
                    <>
                      <span style={{ color: "#c0beb4" }}>·</span>
                      <span
                        style={{
                          fontFamily: MONO,
                          fontSize: 11,
                          color: "#8a8a85",
                          display: "flex",
                          alignItems: "center",
                          gap: 4,
                        }}
                      >
                        {application.scoreBefore !== null && (
                          <span>{application.scoreBefore}%</span>
                        )}
                        {application.scoreBefore !== null &&
                          application.scoreAfter !== null && (
                            <span style={{ color: "#c6ff3a" }}>→</span>
                          )}
                        {application.scoreAfter !== null && (
                          <span
                            style={{
                              color: "#3a5008",
                              background: "rgba(198,255,58,0.22)",
                              padding: "1px 6px",
                              borderRadius: 999,
                              border: "1px solid rgba(110,150,20,0.22)",
                            }}
                          >
                            {application.scoreAfter}%
                          </span>
                        )}
                      </span>
                    </>
                  )}
                </div>
              </div>

              {/* Actions */}
              <div
                style={{
                  display: "flex",
                  gap: 8,
                  flexShrink: 0,
                  flexWrap: "wrap",
                }}
              >
                {application.jobUrl && (
                  <a
                    href={application.jobUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 5,
                      padding: "10px 14px",
                      borderRadius: 8,
                      border: "1px solid rgba(10,10,10,0.15)",
                      background: "#fff",
                      color: "#0a0a0a",
                      fontSize: 13,
                      fontWeight: 500,
                      textDecoration: "none",
                      fontFamily: GEIST,
                    }}
                  >
                    Abrir vaga ↗
                  </a>
                )}
                {isPrepEligible && (
                  <button
                    type="button"
                    onClick={() => setShowPrep(true)}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 5,
                      padding: "10px 16px",
                      borderRadius: 8,
                      border: isInterview
                        ? "1px solid rgba(110,150,20,0.35)"
                        : "1px solid rgba(10,10,10,0.15)",
                      background: isInterview ? "#c6ff3a" : "#fff",
                      color: "#0a0a0a",
                      fontSize: 13,
                      fontWeight: isInterview ? 600 : 500,
                      cursor: "pointer",
                      fontFamily: GEIST,
                      boxShadow: isInterview
                        ? "0 6px 14px rgba(198,255,58,0.2)"
                        : "none",
                    }}
                  >
                    {application.interviewPrep
                      ? "Ver preparação"
                      : "Preparar entrevista"}
                    {isInterview && " →"}
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Main grid */}
          <div
            className="candidatura-grid"
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 300px",
              gap: 16,
              alignItems: "start",
            }}
          >
            {/* Left column */}
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {/* Job description */}
              {application.jobDescriptionText && (
                <SectionCard title="DESCRIÇÃO DA VAGA">
                  <p
                    style={{
                      margin: 0,
                      fontSize: 13.5,
                      color: "#45443e",
                      lineHeight: 1.65,
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                    }}
                  >
                    {application.jobDescriptionText.length > 800
                      ? `${application.jobDescriptionText.slice(0, 800)}…`
                      : application.jobDescriptionText}
                  </p>
                </SectionCard>
              )}

              {/* CV Adaptations */}
              {hasCvAdaptations && latestCv && (
                <SectionCard
                  title={`CV ADAPTADO (${application.cvAdaptations.length})`}
                >
                  {application.cvAdaptations.slice(0, 3).map((cv) => (
                    <div
                      key={cv.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 12,
                        padding: "10px 12px",
                        borderRadius: 10,
                        background: "#fff",
                        border: "1px solid rgba(10,10,10,0.06)",
                        marginBottom: 6,
                      }}
                    >
                      <div>
                        <p
                          style={{
                            margin: 0,
                            fontSize: 12.5,
                            color: "#0a0a0a",
                            fontWeight: 500,
                          }}
                        >
                          {cv.jobTitle ?? "Adaptação"} · {cv.companyName ?? ""}
                        </p>
                        <p
                          style={{
                            margin: "2px 0 0",
                            fontFamily: MONO,
                            fontSize: 10,
                            color: "#8a8a85",
                            letterSpacing: "0.5px",
                          }}
                        >
                          {cv.isUnlocked ? "Desbloqueado" : "Aguardando"} ·{" "}
                          {formatDate(cv.createdAt)}
                        </p>
                      </div>
                      {cv.isUnlocked && (
                        <Link
                          href={`/adaptar/resultado?adaptationId=${cv.id}`}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 4,
                            padding: "5px 12px",
                            borderRadius: 8,
                            border: "1px solid rgba(10,10,10,0.12)",
                            background: "#fafaf6",
                            color: "#0a0a0a",
                            fontSize: 11.5,
                            fontWeight: 500,
                            textDecoration: "none",
                            fontFamily: GEIST,
                            whiteSpace: "nowrap",
                          }}
                        >
                          Ver resultado
                        </Link>
                      )}
                    </div>
                  ))}
                </SectionCard>
              )}

              {/* Score summary */}
              {(application.scoreBefore !== null ||
                application.scoreAfter !== null) && (
                <SectionCard title="RESUMO DA ANÁLISE">
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "100px 22px 100px 1fr",
                      gap: 14,
                      alignItems: "stretch",
                    }}
                  >
                    <div
                      style={{
                        background: "#fff",
                        border: "1px solid rgba(10,10,10,0.08)",
                        borderRadius: 10,
                        padding: "12px",
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
                          marginBottom: 6,
                        }}
                      >
                        ANTES
                      </div>
                      <div
                        style={{
                          fontSize: 34,
                          fontWeight: 400,
                          letterSpacing: -1.4,
                          lineHeight: 1,
                          color: "#a8a6a0",
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        {application.scoreBefore ?? "—"}
                        {application.scoreBefore !== null && (
                          <span style={{ fontSize: 18 }}>%</span>
                        )}
                      </div>
                    </div>
                    <div
                      style={{
                        fontSize: 16,
                        color: "#c0beb4",
                        alignSelf: "center",
                        textAlign: "center",
                      }}
                    >
                      →
                    </div>
                    <div
                      style={{
                        background: "rgba(198,255,58,0.18)",
                        border: "1px solid rgba(110,150,20,0.25)",
                        borderRadius: 10,
                        padding: "12px",
                        textAlign: "center",
                      }}
                    >
                      <div
                        style={{
                          fontFamily: MONO,
                          fontSize: 9.5,
                          letterSpacing: 1,
                          color: "#405410",
                          fontWeight: 500,
                          marginBottom: 6,
                        }}
                      >
                        DEPOIS
                      </div>
                      <div
                        style={{
                          fontSize: 34,
                          fontWeight: 500,
                          letterSpacing: -1.4,
                          lineHeight: 1,
                          color: "#2a6a10",
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        {application.scoreAfter ?? "—"}
                        {application.scoreAfter !== null && (
                          <span style={{ fontSize: 18 }}>%</span>
                        )}
                      </div>
                    </div>
                    <div
                      style={{
                        background: "#fff",
                        border: "1px solid rgba(10,10,10,0.06)",
                        borderRadius: 10,
                        padding: "11px 13px",
                      }}
                    >
                      <div
                        style={{
                          fontFamily: MONO,
                          fontSize: 9.5,
                          letterSpacing: 1,
                          color: "#8a8a85",
                          fontWeight: 500,
                          marginBottom: 5,
                        }}
                      >
                        EVOLUÇÃO
                      </div>
                      <div
                        style={{
                          fontSize: 12.5,
                          lineHeight: 1.55,
                          color: "#2a2a28",
                        }}
                      >
                        {application.scoreAfter !== null &&
                        application.scoreBefore !== null
                          ? `+${application.scoreAfter - application.scoreBefore} pontos de compatibilidade.`
                          : "Score disponível após análise."}
                      </div>
                    </div>
                  </div>
                </SectionCard>
              )}

              {/* Timeline */}
              <Timeline events={application.events} />
            </div>

            {/* Right column */}
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <UpdateStatusPanel
                applicationId={application.id}
                currentStatus={application.status}
                onUpdated={handleUpdated}
              />
              <NotesPanel
                applicationId={application.id}
                currentNotes={application.notes}
                onUpdated={handleUpdated}
              />
            </div>
          </div>
        </div>

        {/* Responsive override */}
        <style>{`
          @media (max-width: 700px) {
            .candidatura-grid { grid-template-columns: 1fr !important; }
          }
        `}</style>
      </main>

      <InterviewPrepDrawer
        applicationId={application.id}
        initialPrep={application.interviewPrep}
        open={showPrep}
        onClose={() => setShowPrep(false)}
      />
    </PageShell>
  );
}
