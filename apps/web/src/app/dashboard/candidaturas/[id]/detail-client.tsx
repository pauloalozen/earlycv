"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  type ReactNode,
  useEffect,
  useId,
  useState,
  useTransition,
} from "react";
import { DownloadProgressOverlay } from "@/components/download-progress-overlay";
import {
  type DownloadProgressStage,
  downloadFromApi,
} from "@/lib/client-download";
import { buildCvUnlockPlansHref } from "@/lib/cv-unlock-flow";
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

const ORIGIN_LABELS: Record<string, string> = {
  analysis_auto: "analysis.auto",
  optimized_cv_auto: "cv.auto",
  manual: "manual",
  imported_url: "url.import",
  job_portal: "job.portal",
};

const NEXT_ACTION_BODY: Record<string, string> = {
  SAVED:
    "Analise a vaga e adapte seu CV para melhorar a compatibilidade antes de se candidatar.",
  ANALYZED:
    "Adapte seu CV para esta vaga para aumentar suas chances de ser chamado.",
  CV_READY:
    "Seu CV adaptado está pronto. Candidate-se à vaga quando estiver preparado.",
  APPLIED: "Candidatura enviada. Aguarde o retorno do recrutador.",
  IN_PROCESS:
    "Você está em processo seletivo. Acompanhe os próximos passos com atenção.",
  INTERVIEW:
    "Entrevista agendada. Gere uma preparação com IA usando a vaga, análise e CV adaptado.",
  ASSESSMENT:
    "Você está na fase de testes. Revise os requisitos técnicos da vaga com atenção.",
  OFFER: "Você recebeu uma oferta! Revise os termos antes de aceitar.",
  HIRED: "Parabéns! Você foi contratado nesta vaga.",
  REJECTED:
    "Esta candidatura não avançou. Use as lições para as próximas vagas.",
  WITHDRAWN: "Você desistiu desta candidatura.",
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
    <div>
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

function InterviewBanner({
  nextActionAt,
  onPrepClick,
}: {
  nextActionAt: string;
  onPrepClick: () => void;
}) {
  const date = new Date(nextActionAt);
  const dateStr = date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
  });
  const timeStr = date.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div
      style={{
        background:
          "linear-gradient(95deg, rgba(245,197,24,0.12) 0%, rgba(245,197,24,0.04) 100%)",
        border: "1px solid rgba(180,140,10,0.28)",
        borderRadius: 14,
        padding: "18px 22px",
        display: "flex",
        alignItems: "center",
        gap: 16,
      }}
    >
      <div
        style={{
          width: 44,
          height: 44,
          borderRadius: 10,
          background: "#fff",
          border: "1px solid rgba(180,140,10,0.22)",
          color: "#7a5a04",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          aria-label="Calendário"
          role="img"
        >
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M3 9h18M8 3v4M16 3v4" strokeLinecap="round" />
        </svg>
      </div>
      <div style={{ flex: 1 }}>
        <div
          style={{
            fontFamily: MONO,
            fontSize: 10,
            letterSpacing: 1.2,
            color: "#7a5a04",
            fontWeight: 500,
            marginBottom: 4,
          }}
        >
          ENTREVISTA AGENDADA
        </div>
        <div
          style={{
            fontSize: 15.5,
            fontWeight: 600,
            color: "#0a0a0a",
            letterSpacing: -0.2,
            marginBottom: 4,
          }}
        >
          {dateStr} · {timeStr}
        </div>
        <div style={{ fontSize: 12.5, color: "#5a5a55", lineHeight: 1.5 }}>
          Prepare-se com IA usando a vaga, sua análise e seu CV adaptado.
        </div>
      </div>
      <button
        type="button"
        onClick={onPrepClick}
        style={{
          background: "#c6ff3a",
          color: "#0a0a0a",
          border: "1px solid rgba(110,150,20,0.35)",
          borderRadius: 10,
          padding: "11px 16px",
          fontSize: 13,
          fontWeight: 600,
          cursor: "pointer",
          fontFamily: GEIST,
          boxShadow: "0 6px 14px rgba(198,255,58,0.2)",
          flexShrink: 0,
          whiteSpace: "nowrap",
        }}
      >
        Preparar com IA →
      </button>
    </div>
  );
}

function Timeline({
  events,
  scoreBefore,
  scoreAfter,
}: {
  events: JobApplicationEvent[];
  scoreBefore: number | null;
  scoreAfter: number | null;
}) {
  if (events.length === 0) return null;

  function getEventBody(event: JobApplicationEvent): React.ReactNode {
    switch (event.eventType) {
      case "APPLICATION_CREATED":
        return "Candidatura criada automaticamente.";
      case "ANALYSIS_COMPLETED":
        return scoreBefore !== null ? (
          <>
            Análise concluída. Score inicial <strong>{scoreBefore}%</strong>.
          </>
        ) : (
          "Análise da vaga concluída."
        );
      case "CV_READY":
        if (scoreAfter !== null && scoreBefore !== null) {
          return (
            <>
              CV adaptado gerado. Score subiu para{" "}
              <strong>{scoreAfter}%</strong> (+
              {scoreAfter - scoreBefore} pontos).
            </>
          );
        }
        if (scoreAfter !== null) {
          return (
            <>
              CV adaptado gerado. Score: <strong>{scoreAfter}%</strong>.
            </>
          );
        }
        return "CV adaptado gerado.";
      case "STATUS_CHANGED":
        return event.newStatus ? (
          <>
            Status atualizado para{" "}
            <strong>{getStatusConfig(event.newStatus).label}</strong>.
          </>
        ) : (
          "Status atualizado."
        );
      case "MARKED_AS_SENT":
        return "Você marcou como enviada.";
      case "NOTE_ADDED":
        return "Nota adicionada.";
      case "INTERVIEW_PREP_GENERATED":
        return "Preparação para entrevista gerada com IA.";
      default:
        return event.eventType;
    }
  }

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
                  {getEventBody(event)}
                </p>
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

function ScoreSection({
  scoreBefore,
  scoreAfter,
  currentCvAdaptationId,
}: {
  scoreBefore: number | null;
  scoreAfter: number | null;
  currentCvAdaptationId: string | null;
}) {
  if (scoreBefore === null && scoreAfter === null) return null;

  const rightLink = currentCvAdaptationId ? (
    <Link
      href={`/adaptar/resultado?adaptationId=${currentCvAdaptationId}`}
      style={{
        fontFamily: MONO,
        fontSize: 11,
        color: "#0a0a0a",
        textDecoration: "underline",
        textUnderlineOffset: 3,
      }}
    >
      Ver análise completa ↗
    </Link>
  ) : undefined;

  return (
    <SectionCard title="RESUMO DA ANÁLISE" right={rightLink}>
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
            {scoreBefore ?? "—"}
            {scoreBefore !== null && <span style={{ fontSize: 18 }}>%</span>}
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
            {scoreAfter ?? "—"}
            {scoreAfter !== null && <span style={{ fontSize: 18 }}>%</span>}
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
            O QUE MUDOU
          </div>
          <div style={{ fontSize: 12.5, lineHeight: 1.55, color: "#2a2a28" }}>
            {scoreAfter !== null && scoreBefore !== null
              ? `+${scoreAfter - scoreBefore} pontos de compatibilidade após adaptação do CV.`
              : "Score disponível após análise e adaptação do CV."}
          </div>
        </div>
      </div>
    </SectionCard>
  );
}

function NotesSection({
  applicationId,
  currentNotes,
  events,
  onUpdated,
}: {
  applicationId: string;
  currentNotes: string | null;
  events: JobApplicationEvent[];
  onUpdated: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState(currentNotes ?? "");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const textareaId = useId();

  const lastNoteEvent = [...events]
    .reverse()
    .find((e) => e.eventType === "NOTE_ADDED");
  const isDirty = note.trim() !== (currentNotes ?? "").trim();

  function handleSave() {
    if (!note.trim() || !isDirty || pending) return;
    startTransition(async () => {
      try {
        await addJobApplicationNote(applicationId, note.trim());
        setSaved(true);
        setEditing(false);
        onUpdated();
        setTimeout(() => setSaved(false), 2500);
      } catch {
        setError("Falha ao salvar nota. Tente novamente.");
      }
    });
  }

  return (
    <SectionCard
      title="NOTAS"
      right={
        editing ? (
          <button
            type="button"
            onClick={() => {
              setEditing(false);
              setNote(currentNotes ?? "");
              setError(null);
            }}
            style={{
              fontFamily: MONO,
              fontSize: 11,
              color: "#8a8a85",
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: 0,
            }}
          >
            Cancelar
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            style={{
              fontFamily: MONO,
              fontSize: 11,
              color: "#0a0a0a",
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: 0,
              textDecoration: "underline",
              textUnderlineOffset: 3,
            }}
          >
            {currentNotes ? "Editar nota" : "+ Adicionar nota"}
          </button>
        )
      }
    >
      {editing ? (
        <div>
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
                color:
                  note.trim() && isDirty && !pending ? "#fafaf6" : "#8a8a85",
                fontSize: 12.5,
                fontWeight: 500,
                cursor:
                  note.trim() && isDirty && !pending
                    ? "pointer"
                    : "not-allowed",
                fontFamily: GEIST,
                transition: "all 140ms ease",
              }}
            >
              {pending ? "Salvando…" : "Salvar nota"}
            </button>
          </div>
        </div>
      ) : currentNotes ? (
        <div>
          <div
            style={{
              padding: "12px 0",
              borderBottom: "1px dashed rgba(10,10,10,0.08)",
            }}
          >
            {lastNoteEvent && (
              <div
                style={{
                  fontFamily: MONO,
                  fontSize: 10.5,
                  color: "#8a8a85",
                  letterSpacing: 0.3,
                  marginBottom: 4,
                }}
              >
                {formatDateTime(lastNoteEvent.createdAt)}
              </div>
            )}
            <div
              style={{
                fontSize: 13,
                color: "#2a2a28",
                lineHeight: 1.55,
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}
            >
              {currentNotes}
            </div>
          </div>
        </div>
      ) : (
        <p
          style={{
            margin: 0,
            fontSize: 13,
            color: "#8a8a85",
            fontFamily: GEIST,
            lineHeight: 1.5,
          }}
        >
          Nenhuma nota adicionada ainda.
        </p>
      )}
    </SectionCard>
  );
}

// ---- Sidebar ----

function ProximaAcaoCard({
  applicationId,
  status,
  jobUrl,
  showStatusEdit,
  onSetShowStatusEdit,
  onPrepClick,
  onUpdated,
}: {
  applicationId: string;
  status: JobApplicationStatus;
  jobUrl: string | null;
  showStatusEdit: boolean;
  onSetShowStatusEdit: (v: boolean) => void;
  onPrepClick: () => void;
  onUpdated: () => void;
}) {
  const [selected, setSelected] = useState<JobApplicationStatus>(status);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const selectId = useId();

  useEffect(() => {
    setSelected(status);
  }, [status]);

  const isDirty = selected !== status;
  const isGreen = status === "INTERVIEW" || status === "OFFER";
  const isDone =
    status === "HIRED" || status === "REJECTED" || status === "WITHDRAWN";
  const showOpenJob =
    jobUrl &&
    (status === "SAVED" || status === "ANALYZED" || status === "CV_READY");
  const showDarkCta =
    status === "APPLIED" || status === "IN_PROCESS" || status === "ASSESSMENT";

  function handleSave() {
    if (!isDirty || pending) return;
    startTransition(async () => {
      try {
        await updateJobApplicationStatus(applicationId, selected);
        onSetShowStatusEdit(false);
        onUpdated();
      } catch {
        setError("Falha ao atualizar. Tente novamente.");
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
        PRÓXIMA AÇÃO
      </p>
      <div style={{ marginBottom: 12 }}>
        <StatusBadge status={status} />
      </div>
      <p
        style={{
          margin: "0 0 14px",
          fontSize: 13,
          color: "#5a5a55",
          lineHeight: 1.55,
          fontFamily: GEIST,
        }}
      >
        {NEXT_ACTION_BODY[status]}
      </p>

      {!isDone && (
        <>
          {isGreen && (
            <button
              type="button"
              onClick={onPrepClick}
              style={{
                width: "100%",
                background: "#c6ff3a",
                color: "#0a0a0a",
                border: "1px solid rgba(110,150,20,0.35)",
                borderRadius: 10,
                padding: "12px 14px",
                fontSize: 13.5,
                fontWeight: 600,
                cursor: "pointer",
                fontFamily: GEIST,
                boxShadow: "0 6px 14px rgba(198,255,58,0.2)",
                marginBottom: 10,
              }}
            >
              Preparar entrevista →
            </button>
          )}
          {showDarkCta && (
            <button
              type="button"
              onClick={() => onSetShowStatusEdit(!showStatusEdit)}
              style={{
                width: "100%",
                background: "#0a0a0a",
                color: "#fff",
                border: "none",
                borderRadius: 10,
                padding: "11px 14px",
                fontSize: 13,
                fontWeight: 500,
                cursor: "pointer",
                fontFamily: GEIST,
                marginBottom: 10,
              }}
            >
              Atualizar status
            </button>
          )}
          {showOpenJob && (
            <a
              href={jobUrl as string}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: "block",
                textAlign: "center",
                padding: "11px 14px",
                borderRadius: 10,
                border: "1px solid rgba(10,10,10,0.15)",
                background: "#fff",
                color: "#0a0a0a",
                fontSize: 13,
                fontWeight: 500,
                textDecoration: "none",
                fontFamily: GEIST,
                marginBottom: 10,
              }}
            >
              Abrir vaga ↗
            </a>
          )}
        </>
      )}

      <div style={{ textAlign: "center" }}>
        <button
          type="button"
          onClick={() => onSetShowStatusEdit(!showStatusEdit)}
          style={{
            fontFamily: MONO,
            fontSize: 10.5,
            color: "#5a5a55",
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: 0,
          }}
        >
          Mudar status ▾
        </button>
      </div>

      {showStatusEdit && (
        <div
          style={{
            marginTop: 14,
            paddingTop: 14,
            borderTop: "1px solid rgba(10,10,10,0.06)",
          }}
        >
          <label htmlFor={selectId} style={{ display: "none" }}>
            Status da candidatura
          </label>
          <select
            id={selectId}
            value={selected}
            onChange={(e) => {
              setSelected(e.target.value as JobApplicationStatus);
              setError(null);
            }}
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
              padding: "10px 0",
              borderRadius: 10,
              border: "none",
              background:
                isDirty && !pending ? "#0a0a0a" : "rgba(10,10,10,0.08)",
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
      )}
    </div>
  );
}

function CvAdaptadoCard({
  applicationId,
  cvAdaptations,
  companyName,
  jobTitle,
  scoreAfter,
}: {
  applicationId: string;
  cvAdaptations: JobApplicationDetailDto["cvAdaptations"];
  companyName: string;
  jobTitle: string;
  scoreAfter: number | null;
}) {
  if (cvAdaptations.length === 0) return null;
  const latest = cvAdaptations[0];
  const cvName = `CV-${companyName.replace(/\s+/g, "-")}-${jobTitle.replace(/\s+/g, "-")}.pdf`;
  const [hasCredits, setHasCredits] = useState<boolean | null>(null);
  const [redeeming, setRedeeming] = useState(false);
  const [redeemError, setRedeemError] = useState<string | null>(null);
  const [wasUnlockedInSession, setWasUnlockedInSession] = useState(false);
  const [downloading, setDownloading] = useState<"pdf" | "docx" | null>(null);
  const [downloadStage, setDownloadStage] =
    useState<DownloadProgressStage | null>(null);

  const plansHref = buildCvUnlockPlansHref({
    adaptationId: latest.id,
    source: "dashboard-candidatura-unlock",
    nextPath: `/dashboard/candidaturas/${applicationId}`,
  });

  useEffect(() => {
    let mounted = true;

    const loadCredits = async () => {
      try {
        const response = await fetch("/api/plans/me", { cache: "no-store" });
        if (!response.ok) return;
        const plan = (await response.json()) as { creditsRemaining?: number | null };
        if (!mounted) return;
        if (plan.creditsRemaining === null || plan.creditsRemaining === undefined) {
          setHasCredits(true);
          return;
        }
        setHasCredits(plan.creditsRemaining > 0);
      } catch {
        if (mounted) {
          setHasCredits(null);
        }
      }
    };

    void loadCredits();
    return () => {
      mounted = false;
    };
  }, []);

  const isUnlocked = latest.isUnlocked || wasUnlockedInSession;

  const handleDownload = async (format: "pdf" | "docx") => {
    if (!isUnlocked) return;
    setDownloading(format);
    setDownloadStage("preparing");
    try {
      await downloadFromApi({
        url: `/api/cv-adaptation/${latest.id}/download?format=${format}`,
        fallbackFilename: cvName.replace(/\.pdf$/i, format === "pdf" ? ".pdf" : ".docx"),
        onStageChange: setDownloadStage,
      });
    } finally {
      setDownloading(null);
      setDownloadStage(null);
    }
  };

  const handleRedeem = async () => {
    if (redeeming) return;
    setRedeeming(true);
    setRedeemError(null);
    try {
      const response = await fetch(`/api/cv-adaptation/${latest.id}/redeem-credit`, {
        method: "POST",
        cache: "no-store",
      });
      if (!response.ok) {
        let apiMessage = "Nao foi possivel liberar o CV agora. Tente novamente.";
        try {
          const body = (await response.json()) as { message?: string };
          if (typeof body.message === "string" && body.message.trim()) {
            apiMessage = body.message;
          }
        } catch {
          // no-op
        }
        throw new Error(apiMessage);
      }
      setWasUnlockedInSession(true);
      setHasCredits((current) => (current === true ? false : current));
    } catch (error) {
      if (error instanceof TypeError) {
        setRedeemError(
          "Nao foi possivel conectar ao servidor. Verifique sua internet e tente novamente.",
        );
      } else if (error instanceof Error && error.message) {
        setRedeemError(error.message);
      } else {
        setRedeemError("Nao foi possivel liberar o CV agora. Tente novamente.");
      }
    } finally {
      setRedeeming(false);
    }
  };

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
        CV ADAPTADO
      </p>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          marginBottom: 12,
          background: "#fff",
          border: "1px solid rgba(10,10,10,0.06)",
          borderRadius: 10,
          padding: "10px 12px",
        }}
      >
        <div
          style={{
            width: 36,
            height: 44,
            background: "#0a0a0a",
            color: "#c6ff3a",
            borderRadius: 4,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: MONO,
            fontSize: 10,
            fontWeight: 600,
            letterSpacing: 0.5,
            flexShrink: 0,
          }}
        >
          PDF
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div
            style={{
              fontSize: 12.5,
              fontWeight: 500,
              color: "#0a0a0a",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              fontFamily: GEIST,
            }}
          >
            {cvName}
          </div>
          <div
            style={{
              fontFamily: MONO,
              fontSize: 10,
              color: "#8a8a85",
              marginTop: 2,
            }}
          >
            Gerado{" "}
            {new Date(latest.createdAt).toLocaleDateString("pt-BR", {
              day: "2-digit",
              month: "short",
            })}
            {scoreAfter !== null && ` · score ${scoreAfter}%`}
          </div>
        </div>
      </div>
      {isUnlocked ? (
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            onClick={() => void handleDownload("pdf")}
            disabled={downloading !== null}
            style={{
              flex: 1,
              textAlign: "center",
              padding: "9px 12px",
              borderRadius: 8,
              border: "1px solid rgba(10,10,10,0.12)",
              background: "#fff",
              color: "#0a0a0a",
              fontSize: 12.5,
              fontWeight: 500,
              textDecoration: "none",
              fontFamily: GEIST,
              cursor: downloading ? "not-allowed" : "pointer",
            }}
          >
            Baixar PDF
          </button>
          <button
            type="button"
            onClick={() => void handleDownload("docx")}
            disabled={downloading !== null}
            style={{
              flex: 1,
              textAlign: "center",
              padding: "9px 12px",
              borderRadius: 8,
              border: "1px solid rgba(10,10,10,0.12)",
              background: "#fff",
              color: "#0a0a0a",
              fontSize: 12.5,
              fontWeight: 500,
              textDecoration: "none",
              fontFamily: GEIST,
              cursor: downloading ? "not-allowed" : "pointer",
            }}
          >
            Baixar DOCX
          </button>
        </div>
      ) : hasCredits === false ? (
        <Link
          href={plansHref}
          style={{
            display: "block",
            textAlign: "center",
            padding: "9px 12px",
            borderRadius: 8,
            border: "1px solid rgba(10,10,10,0.12)",
            background: "#fff",
            color: "#0a0a0a",
            fontSize: 12.5,
            fontWeight: 500,
            textDecoration: "none",
            fontFamily: GEIST,
          }}
        >
          Liberar CV
        </Link>
      ) : (
        <button
          type="button"
          onClick={() => void handleRedeem()}
          disabled={redeeming}
          style={{
            width: "100%",
            textAlign: "center",
            padding: "9px 12px",
            borderRadius: 8,
            border: "1px solid rgba(10,10,10,0.12)",
            background: "#fff",
            color: "#0a0a0a",
            fontSize: 12.5,
            fontWeight: 500,
            textDecoration: "none",
            fontFamily: GEIST,
            cursor: redeeming ? "not-allowed" : "pointer",
          }}
        >
          {redeeming ? "Liberando..." : "Liberar CV"}
        </button>
      )}
      {redeemError && (
        <p
          style={{
            margin: "10px 0 0",
            fontFamily: GEIST,
            fontSize: 12,
            color: "#991b1b",
          }}
        >
          {redeemError}
        </p>
      )}
      <DownloadProgressOverlay
        open={downloadStage !== null}
        stage={downloadStage}
        format={downloading}
      />
    </div>
  );
}

function DetalhesCard({
  application,
}: {
  application: JobApplicationDetailDto;
}) {
  const origin = ORIGIN_LABELS[application.origin] ?? application.origin;

  type Row = { k: string; v: React.ReactNode };
  const rows: Row[] = [
    { k: "Empresa", v: application.companyName },
    ...(application.location ? [{ k: "Local", v: application.location }] : []),
    ...(application.jobUrl
      ? [
          {
            k: "Link",
            v: (
              <a
                href={application.jobUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  fontFamily: MONO,
                  fontSize: 11,
                  color: "#0a0a0a",
                  textDecoration: "underline",
                  textUnderlineOffset: 2,
                  wordBreak: "break-all" as const,
                }}
              >
                {application.jobUrl.replace(/^https?:\/\//, "").slice(0, 38)}
              </a>
            ),
          },
        ]
      : []),
    {
      k: "Origem",
      v: (
        <span style={{ fontFamily: MONO, fontSize: 11, color: "#5a5a55" }}>
          {origin}
        </span>
      ),
    },
    { k: "Criada", v: formatDate(application.createdAt) },
    ...(application.appliedAt
      ? [{ k: "Enviada", v: formatDate(application.appliedAt) }]
      : []),
    ...(application.nextActionAt
      ? [
          {
            k: "Entrevista",
            v: (
              <strong style={{ color: "#0a0a0a" }}>
                {new Date(application.nextActionAt).toLocaleDateString(
                  "pt-BR",
                  {
                    day: "2-digit",
                    month: "short",
                  },
                )}{" "}
                ·{" "}
                {new Date(application.nextActionAt).toLocaleTimeString(
                  "pt-BR",
                  {
                    hour: "2-digit",
                    minute: "2-digit",
                  },
                )}
              </strong>
            ),
          },
        ]
      : []),
  ];

  return (
    <div style={{ ...CARD, padding: "18px 20px" }}>
      <p
        style={{
          margin: "0 0 8px",
          fontFamily: MONO,
          fontSize: 10,
          letterSpacing: 1.2,
          color: "#8a8a85",
          fontWeight: 500,
        }}
      >
        DETALHES
      </p>
      <div>
        {rows.map((row, idx) => (
          <div
            key={row.k}
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "baseline",
              gap: 8,
              padding: "8px 0",
              borderBottom:
                idx < rows.length - 1
                  ? "1px solid rgba(10,10,10,0.05)"
                  : "none",
            }}
          >
            <span
              style={{
                fontFamily: MONO,
                fontSize: 10,
                color: "#8a8a85",
                letterSpacing: 0.4,
                flexShrink: 0,
              }}
            >
              {row.k}
            </span>
            <span
              style={{
                fontSize: 12.5,
                color: "#2a2a28",
                textAlign: "right",
                fontFamily: GEIST,
              }}
            >
              {row.v}
            </span>
          </div>
        ))}
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
  const [showStatusEdit, setShowStatusEdit] = useState(false);

  function handleUpdated() {
    startTransition(() => {
      router.refresh();
    });
  }

  const hasCvAdaptations = application.cvAdaptations.length > 0;
  const isPrepEligible = PREP_ELIGIBLE_STATUSES.includes(application.status);
  const isInterview = application.status === "INTERVIEW";
  const origin = ORIGIN_LABELS[application.origin] ?? application.origin;

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
            maxWidth: 980,
            margin: "0 auto",
            padding: "12px 24px 80px",
            position: "relative",
            zIndex: 2,
          }}
        >
          {/* Breadcrumb */}
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

          {/* Hero */}
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
                    Criada em{" "}
                    <strong>{formatDate(application.createdAt)}</strong>
                  </span>
                  <span style={{ color: "#c0beb4" }}>·</span>
                  <span
                    style={{
                      fontFamily: MONO,
                      fontSize: 12.5,
                      color: "#5a5a55",
                    }}
                  >
                    Atualizada{" "}
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
                  <span style={{ color: "#c0beb4" }}>·</span>
                  <span
                    style={{
                      fontFamily: MONO,
                      fontSize: 10.5,
                      color: "#8a8a85",
                      letterSpacing: 0.4,
                    }}
                  >
                    {origin}
                  </span>
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
                <button
                  type="button"
                  onClick={() => setShowStatusEdit((v) => !v)}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 5,
                    padding: "10px 14px",
                    borderRadius: 8,
                    border: "1px solid rgba(10,10,10,0.15)",
                    background: showStatusEdit ? "#f0f0ea" : "#fff",
                    color: "#0a0a0a",
                    fontSize: 13,
                    fontWeight: 500,
                    cursor: "pointer",
                    fontFamily: GEIST,
                  }}
                >
                  Atualizar status ▾
                </button>
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
              gridTemplateColumns: "1fr 380px",
              gap: 24,
              alignItems: "start",
            }}
          >
            {/* Left column */}
            <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
              {application.nextActionAt && (
                <InterviewBanner
                  nextActionAt={application.nextActionAt}
                  onPrepClick={() => setShowPrep(true)}
                />
              )}

              <Timeline
                events={application.events}
                scoreBefore={application.scoreBefore}
                scoreAfter={application.scoreAfter}
              />

              <ScoreSection
                scoreBefore={application.scoreBefore}
                scoreAfter={application.scoreAfter}
                currentCvAdaptationId={application.currentCvAdaptationId}
              />

              <NotesSection
                applicationId={application.id}
                currentNotes={application.notes}
                events={application.events}
                onUpdated={handleUpdated}
              />
            </div>

            {/* Right column */}
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <ProximaAcaoCard
                applicationId={application.id}
                status={application.status}
                jobUrl={application.jobUrl}
                showStatusEdit={showStatusEdit}
                onSetShowStatusEdit={setShowStatusEdit}
                onPrepClick={() => setShowPrep(true)}
                onUpdated={handleUpdated}
              />

              {hasCvAdaptations && (
                <CvAdaptadoCard
                  applicationId={application.id}
                  cvAdaptations={application.cvAdaptations}
                  companyName={application.companyName}
                  jobTitle={application.jobTitle}
                  scoreAfter={application.scoreAfter}
                />
              )}

              <DetalhesCard application={application} />
            </div>
          </div>
        </div>

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
        jobTitle={application.jobTitle}
        company={application.companyName}
        scoreAfter={application.scoreAfter}
        nextActionAt={application.nextActionAt}
      />
    </PageShell>
  );
}
