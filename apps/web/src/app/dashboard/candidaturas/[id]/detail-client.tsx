"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ReactNode, useId, useState, useTransition } from "react";

import type {
  JobApplicationDetailDto,
  JobApplicationEvent,
  JobApplicationStatus,
} from "@/lib/job-applications-api";
import {
  addJobApplicationNote,
  updateJobApplicationStatus,
} from "@/lib/job-applications-api";
import { ALL_STATUSES, getStatusConfig } from "@/lib/job-application-status";
import { PageShell } from "@/components/page-shell";
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
  padding: "9px 12px",
  borderRadius: 9,
  border: "1px solid rgba(10,10,10,0.14)",
  background: "#fafaf6",
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
        borderRadius: 5,
        padding: "3px 10px",
        fontFamily: MONO,
        fontSize: 10.5,
        fontWeight: 500,
        letterSpacing: "0.9px",
        textTransform: "uppercase",
        background: cfg.bg,
        color: cfg.color,
        border: `1px solid ${cfg.border}`,
      }}
    >
      {cfg.label}
    </span>
  );
}

function Timeline({ events }: { events: JobApplicationEvent[] }) {
  if (events.length === 0) return null;

  return (
    <div style={{ ...CARD, padding: "16px 20px" }}>
      <p style={{ margin: "0 0 14px", fontFamily: MONO, fontSize: 10, letterSpacing: "0.9px", color: "#8a8a85", fontWeight: 500, textTransform: "uppercase" }}>
        Histórico
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
        {events.map((event, idx) => {
          const cfg = event.newStatus ? getStatusConfig(event.newStatus) : null;
          const isLast = idx === events.length - 1;
          return (
            <div key={event.id} style={{ display: "flex", gap: 12, position: "relative" }}>
              {/* Line */}
              {!isLast && (
                <div
                  style={{
                    position: "absolute",
                    left: 7,
                    top: 22,
                    bottom: 0,
                    width: 1,
                    background: "rgba(10,10,10,0.08)",
                  }}
                />
              )}

              {/* Dot */}
              <div style={{ flexShrink: 0, marginTop: 4 }}>
                <div
                  style={{
                    width: 15,
                    height: 15,
                    borderRadius: "50%",
                    background: cfg ? cfg.bg : "rgba(10,10,10,0.07)",
                    border: `1.5px solid ${cfg ? cfg.border : "rgba(10,10,10,0.15)"}`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                />
              </div>

              {/* Content */}
              <div style={{ flex: 1, paddingBottom: isLast ? 0 : 14 }}>
                <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: "#0a0a0a", fontFamily: GEIST }}>
                  {EVENT_LABELS[event.eventType] ?? event.eventType}
                </p>
                {event.newStatus && (
                  <p style={{ margin: "2px 0 0", fontSize: 12, color: "#6a6560", fontFamily: GEIST }}>
                    Status: <span style={{ color: cfg?.color ?? "#6a6560", fontWeight: 500 }}>{getStatusConfig(event.newStatus).label}</span>
                  </p>
                )}
                <p style={{ margin: "2px 0 0", fontFamily: MONO, fontSize: 10, color: "#8a8a85", letterSpacing: "0.5px" }}>
                  {formatDateTime(event.createdAt)}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
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
    <div style={{ ...CARD, padding: "16px 20px" }}>
      <p style={{ margin: "0 0 12px", fontFamily: MONO, fontSize: 10, letterSpacing: "0.9px", color: "#8a8a85", fontWeight: 500, textTransform: "uppercase" }}>
        Atualizar status
      </p>
      <label htmlFor={selectId} style={{ display: "none" }}>Status da candidatura</label>
      <select
        id={selectId}
        value={selected}
        onChange={(e) => handleChange(e.target.value as JobApplicationStatus)}
        style={{
          ...inputStyle,
          marginBottom: 10,
          cursor: "pointer",
        }}
      >
        {ALL_STATUSES.map((s) => (
          <option key={s} value={s}>
            {getStatusConfig(s).label}
          </option>
        ))}
      </select>

      {error && (
        <p style={{ margin: "0 0 10px", fontSize: 12, color: "#991b1b", background: "#fee2e2", padding: "7px 10px", borderRadius: 7 }}>
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={handleSave}
        disabled={!isDirty || pending}
        style={{
          width: "100%",
          padding: "9px 0",
          borderRadius: 9,
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
    <div style={{ ...CARD, padding: "16px 20px" }}>
      <p style={{ margin: "0 0 12px", fontFamily: MONO, fontSize: 10, letterSpacing: "0.9px", color: "#8a8a85", fontWeight: 500, textTransform: "uppercase" }}>
        Notas
      </p>
      <label htmlFor={textareaId} style={{ display: "none" }}>Notas da candidatura</label>
      <textarea
        id={textareaId}
        value={note}
        onChange={(e) => { setNote(e.target.value); setError(null); setSaved(false); }}
        placeholder="Anotações sobre a vaga, contatos, próximos passos..."
        rows={4}
        style={{ ...inputStyle, resize: "vertical", minHeight: 90, lineHeight: 1.55, marginBottom: 10 }}
      />
      {error && (
        <p style={{ margin: "0 0 10px", fontSize: 12, color: "#991b1b", background: "#fee2e2", padding: "7px 10px", borderRadius: 7 }}>
          {error}
        </p>
      )}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 10 }}>
        {saved && (
          <span style={{ fontSize: 12, color: "#405410", fontFamily: MONO, letterSpacing: "0.5px" }}>
            ✔ Salvo
          </span>
        )}
        <button
          type="button"
          onClick={handleSave}
          disabled={!note.trim() || !isDirty || pending}
          style={{
            padding: "8px 16px",
            borderRadius: 9,
            border: "none",
            background: note.trim() && isDirty && !pending ? "#0a0a0a" : "rgba(10,10,10,0.08)",
            color: note.trim() && isDirty && !pending ? "#fafaf6" : "#8a8a85",
            fontSize: 12.5,
            fontWeight: 500,
            cursor: note.trim() && isDirty && !pending ? "pointer" : "not-allowed",
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
      <div aria-hidden style={{ position: "fixed", inset: 0, pointerEvents: "none", opacity: 0.4, mixBlendMode: "multiply", zIndex: 0, backgroundImage: `url("data:image/svg+xml;utf8,<svg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.03 0'/></filter><rect width='100%25' height='100%25' filter='url(%23n)'/></svg>")` }} />

      <main style={{ fontFamily: GEIST, minHeight: "100dvh", background: "radial-gradient(ellipse 80% 60% at 50% 0%, #f9f8f4 0%, #ecebe5 100%)", color: "#0a0a0a", position: "relative" }}>
        {header}

        <div style={{ maxWidth: 900, margin: "0 auto", padding: "12px 24px 80px", position: "relative", zIndex: 2 }}>
          {/* Back link */}
          <div style={{ paddingTop: 72, paddingBottom: 4 }}>
            <Link
              href="/dashboard/candidaturas"
              style={{ display: "inline-flex", alignItems: "center", gap: 5, fontFamily: MONO, fontSize: 10, color: "#8a8a85", textDecoration: "none", letterSpacing: "0.8px", textTransform: "uppercase" }}
            >
              <svg aria-hidden="true" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
              Candidaturas
            </Link>
          </div>

          {/* Hero card */}
          <div style={{ ...CARD, padding: "20px 24px", marginBottom: 16, marginTop: 8 }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <h1 style={{ margin: 0, fontSize: "clamp(18px, 2.5vw, 24px)", fontWeight: 500, letterSpacing: -0.6, color: "#0a0a0a" }}>
                  {application.jobTitle}
                </h1>
                <p style={{ margin: "4px 0 0", fontSize: 14.5, color: "#6a6560" }}>
                  {application.companyName}
                  {application.location ? (
                    <span style={{ color: "#8a8a85" }}> · {application.location}</span>
                  ) : null}
                </p>
              </div>
              <StatusBadge status={application.status} />
            </div>

            {/* Meta row */}
            <div style={{ display: "flex", gap: 12, marginTop: 14, flexWrap: "wrap", alignItems: "center" }}>
              <span style={{ fontFamily: MONO, fontSize: 10, color: "#8a8a85", letterSpacing: "0.5px" }}>
                Atualizado em {formatDate(application.updatedAt)}
              </span>
              {application.appliedAt && (
                <>
                  <span style={{ color: "rgba(10,10,10,0.2)", fontSize: 10 }}>·</span>
                  <span style={{ fontFamily: MONO, fontSize: 10, color: "#8a8a85", letterSpacing: "0.5px" }}>
                    Enviada em {formatDate(application.appliedAt)}
                  </span>
                </>
              )}
              {(application.scoreBefore !== null || application.scoreAfter !== null) && (
                <>
                  <span style={{ color: "rgba(10,10,10,0.2)", fontSize: 10 }}>·</span>
                  <span style={{ fontFamily: MONO, fontSize: 10, color: "#6a6560", display: "flex", alignItems: "center", gap: 4 }}>
                    {application.scoreBefore !== null && <span>{application.scoreBefore}% ATS</span>}
                    {application.scoreBefore !== null && application.scoreAfter !== null && <span style={{ color: "#c6ff3a" }}>→</span>}
                    {application.scoreAfter !== null && (
                      <span style={{ color: "#405410", background: "rgba(198,255,58,0.14)", padding: "1px 5px", borderRadius: 4 }}>
                        {application.scoreAfter}%
                      </span>
                    )}
                  </span>
                </>
              )}

              {application.jobUrl && (
                <a
                  href={application.jobUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 5,
                    padding: "3px 10px",
                    borderRadius: 7,
                    border: "1px solid rgba(10,10,10,0.12)",
                    background: "#fafaf6",
                    color: "#0a0a0a",
                    fontSize: 12,
                    fontWeight: 500,
                    textDecoration: "none",
                    fontFamily: GEIST,
                  }}
                >
                  <svg aria-hidden="true" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                    <polyline points="15 3 21 3 21 9" />
                    <line x1="10" y1="14" x2="21" y2="3" />
                  </svg>
                  Abrir vaga
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
                    padding: isInterview ? "5px 14px" : "3px 10px",
                    borderRadius: 7,
                    border: isInterview
                      ? "none"
                      : "1px solid rgba(10,10,10,0.12)",
                    background: isInterview ? "#0a0a0a" : "#fafaf6",
                    color: isInterview ? "#fafaf6" : "#0a0a0a",
                    fontSize: 12,
                    fontWeight: 500,
                    cursor: "pointer",
                    fontFamily: GEIST,
                  }}
                >
                  <svg aria-hidden="true" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 11l3 3L22 4" />
                    <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                  </svg>
                  {application.interviewPrep ? "Ver preparação" : "Preparar entrevista"}
                </button>
              )}
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
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {/* Job description */}
              {application.jobDescriptionText && (
                <div style={{ ...CARD, padding: "16px 20px" }}>
                  <p style={{ margin: "0 0 10px", fontFamily: MONO, fontSize: 10, letterSpacing: "0.9px", color: "#8a8a85", fontWeight: 500, textTransform: "uppercase" }}>
                    Descrição da vaga
                  </p>
                  <p style={{ margin: 0, fontSize: 13.5, color: "#45443e", lineHeight: 1.65, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                    {application.jobDescriptionText.length > 800
                      ? `${application.jobDescriptionText.slice(0, 800)}…`
                      : application.jobDescriptionText}
                  </p>
                </div>
              )}

              {/* CV Adaptations */}
              {hasCvAdaptations && latestCv && (
                <div style={{ ...CARD, padding: "16px 20px" }}>
                  <p style={{ margin: "0 0 12px", fontFamily: MONO, fontSize: 10, letterSpacing: "0.9px", color: "#8a8a85", fontWeight: 500, textTransform: "uppercase" }}>
                    CV adaptado ({application.cvAdaptations.length})
                  </p>
                  {application.cvAdaptations.slice(0, 3).map((cv) => (
                    <div
                      key={cv.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 12,
                        padding: "10px 12px",
                        borderRadius: 9,
                        background: "rgba(10,10,10,0.03)",
                        border: "1px solid rgba(10,10,10,0.06)",
                        marginBottom: 6,
                      }}
                    >
                      <div>
                        <p style={{ margin: 0, fontSize: 12.5, color: "#0a0a0a", fontWeight: 500 }}>
                          {cv.jobTitle ?? "Adaptação"} · {cv.companyName ?? ""}
                        </p>
                        <p style={{ margin: "2px 0 0", fontFamily: MONO, fontSize: 10, color: "#8a8a85", letterSpacing: "0.5px" }}>
                          {cv.isUnlocked ? "Desbloqueado" : "Aguardando"} · {formatDate(cv.createdAt)}
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
                            borderRadius: 7,
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
                </div>
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
