"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import { PageShell } from "@/components/page-shell";
import {
  extractDashboardAnalysisSignal,
  getDashboardScoreColor,
} from "@/lib/dashboard-test-metrics";
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
import {
  deleteJobApplication,
  restoreJobApplication,
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
type SegmentKey = "ativas" | "arquivadas";

const FILTERS: {
  key: FilterKey;
  label: string;
  statuses: JobApplicationStatus[] | null;
}[] = [
  { key: "todas", label: "Todas", statuses: null },
  { key: "abertas", label: "Em aberto", statuses: OPEN_STATUSES },
  { key: "processo", label: "Em andamento", statuses: IN_PROCESS_STATUSES },
  { key: "finalizadas", label: "Finalizadas", statuses: CLOSED_STATUSES },
];

type CtaTone = "green" | "dark" | "ghost";
type Cta = { label: string; tone: CtaTone; href: string };

function ctaForStatus(status: JobApplicationStatus, detailUrl: string): Cta {
  switch (status) {
    case "SAVED":
      return { label: "Analisar vaga", tone: "dark", href: "/adaptar" };
    case "ANALYZED":
      return { label: "Gerar CV adaptado", tone: "dark", href: "/adaptar" };
    case "CV_READY":
      return { label: "Marcar como enviada", tone: "dark", href: detailUrl };
    case "APPLIED":
      return {
        label: "Registrar próximo passo",
        tone: "dark",
        href: detailUrl,
      };
    case "IN_PROCESS":
      return { label: "Preparar entrevista", tone: "green", href: detailUrl };
    case "INTERVIEW":
      return { label: "Preparar entrevista", tone: "green", href: detailUrl };
    case "ASSESSMENT":
      return { label: "Registrar teste/case", tone: "dark", href: detailUrl };
    case "OFFER":
      return { label: "Registrar decisão", tone: "green", href: detailUrl };
    case "HIRED":
    case "REJECTED":
    case "WITHDRAWN":
      return { label: "Ver histórico", tone: "ghost", href: detailUrl };
    default:
      return { label: "Ver detalhes", tone: "ghost", href: detailUrl };
  }
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function EmptyState({
  filter,
  segment,
  onAdd,
}: {
  filter: FilterKey;
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

  if (filter !== "todas") {
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
          Nenhuma candidatura nesta categoria
        </p>
        <p
          style={{ fontSize: 13.5, color: "#8a8a85", margin: 0, maxWidth: 360 }}
        >
          As candidaturas desta categoria ainda não foram criadas ou estão em
          outra categoria.
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
          height="32"
          viewBox="0 0 40 32"
          fill="none"
          aria-hidden="true"
          style={{ marginBottom: 22, opacity: 0.9 }}
        >
          <rect x="0" y="0" width="11" height="8" fill="rgba(10,10,10,0.18)" />
          <rect x="14" y="0" width="11" height="8" fill="#c6ff3a" />
          <rect x="28" y="0" width="11" height="8" fill="rgba(10,10,10,0.45)" />
          <rect x="0" y="12" width="11" height="8" fill="rgba(10,10,10,0.45)" />
          <rect
            x="14"
            y="12"
            width="11"
            height="8"
            fill="rgba(10,10,10,0.18)"
          />
          <rect x="28" y="12" width="11" height="8" fill="#c6ff3a" />
          <rect x="0" y="24" width="11" height="8" fill="#c6ff3a" />
          <rect
            x="14"
            y="24"
            width="11"
            height="8"
            fill="rgba(10,10,10,0.45)"
          />
          <rect
            x="28"
            y="24"
            width="11"
            height="8"
            fill="rgba(10,10,10,0.18)"
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
      <div style={{ display: "flex", gap: 10 }}>
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

function CandRow({
  application,
  derivedScore,
  isArchivedView,
  onRestored,
  onDeleted,
}: {
  application: JobApplicationDto;
  derivedScore?: { scoreBefore: number | null; scoreAfter: number | null };
  isArchivedView: boolean;
  onRestored: (applicationId: string) => void;
  onDeleted: (applicationId: string) => void;
}) {
  const router = useRouter();
  const [confirmUnlock, setConfirmUnlock] = useState(false);
  const [redeeming, setRedeeming] = useState(false);
  const [redeemError, setRedeemError] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmDeleteVisible, setConfirmDeleteVisible] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const closeTimerRef = useRef<number | null>(null);
  const detailUrl = `/candidaturas/${application.id}`;
  const cta = ctaForStatus(application.status, detailUrl);
  const scoreBefore =
    derivedScore?.scoreBefore ?? application.scoreBefore ?? null;
  const scoreAfter = derivedScore?.scoreAfter ?? application.scoreAfter ?? null;
  const shortId = `#${application.id.slice(-5).toUpperCase()}`;
  const cfg = getStatusConfig(application.status);
  const bestScore = derivedScore?.scoreAfter ?? application.bestScore ?? scoreAfter;
  const displayedScore = bestScore ?? scoreAfter ?? scoreBefore;
  const scoreDelta =
    scoreAfter !== null && scoreBefore !== null
      ? scoreAfter - scoreBefore
      : null;
  const hasCv = application.bestCvState === "ready";
  const cvAdaptationIdForActions =
    application.bestCvAdaptationId ?? application.currentCvAdaptationId;
  const canDownloadCv =
    cvAdaptationIdForActions !== null && application.bestCvState !== "locked";
  const hasUnlockedCv =
    application.bestCvState === "unlocked" ||
    application.bestCvState === "ready" ||
    (application.cvAdaptations?.some(
      (adaptation) =>
        adaptation.isUnlocked || adaptation.status === "delivered",
    ) ??
      false);
  const canDelete = application.archivedAt !== null && !hasUnlockedCv;

  const handleRestore = async () => {
    if (restoring) return;
    setRestoreError(null);
    setRestoring(true);
    try {
      await restoreJobApplication(application.id);
      onRestored(application.id);
    } catch (error) {
      if (error instanceof Error && error.message) {
        setRestoreError(error.message);
      } else {
        setRestoreError("Nao foi possivel restaurar a candidatura agora.");
      }
    } finally {
      setRestoring(false);
    }
  };

  const handleRedeem = async () => {
    if (!cvAdaptationIdForActions || redeeming) return;
    setRedeeming(true);
    setRedeemError(null);
    try {
      const response = await fetch(
        `/api/cv-adaptation/${cvAdaptationIdForActions}/redeem-credit`,
        {
          method: "POST",
          cache: "no-store",
        },
      );
      if (!response.ok) {
        let apiMessage =
          "Nao foi possivel liberar o CV agora. Tente novamente.";
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
      setConfirmUnlock(false);
      router.refresh();
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

  const handleDelete = async () => {
    if (deleting || !canDelete) return;
    setDeleteError(null);
    setDeleting(true);
    try {
      await deleteJobApplication(application.id);
      onDeleted(application.id);
    } catch (error) {
      if (error instanceof Error && error.message) {
        setDeleteError(error.message);
      } else {
        setDeleteError("Nao foi possivel excluir a candidatura agora.");
      }
    } finally {
      setDeleting(false);
      closeDeleteModal();
    }
  };

  const openDeleteModal = () => {
    setConfirmDelete(true);
    setConfirmDeleteVisible(false);
    window.requestAnimationFrame(() => setConfirmDeleteVisible(true));
  };

  const closeDeleteModal = () => {
    setConfirmDeleteVisible(false);
    if (closeTimerRef.current) {
      window.clearTimeout(closeTimerRef.current);
    }
    closeTimerRef.current = window.setTimeout(() => {
      setConfirmDelete(false);
      closeTimerRef.current = null;
    }, 180);
  };

  useEffect(() => {
    return () => {
      if (closeTimerRef.current) {
        window.clearTimeout(closeTimerRef.current);
      }
    };
  }, []);

  return (
    <div
      className="cand-row"
      style={{
        ...CARD,
        display: "grid",
        gridTemplateColumns: "1fr 190px 240px",
        gap: 0,
        alignItems: "stretch",
        overflow: "hidden",
        transition: "border-color 140ms ease, box-shadow 140ms ease",
      }}
    >
      {/* Col 1 — main info */}
      <Link
        href={detailUrl}
        style={{
          textDecoration: "none",
          display: "block",
          padding: "22px 26px",
        }}
      >
        <div
          style={{
            fontFamily: MONO,
            fontSize: 10,
            color: "#8a8a85",
            letterSpacing: 0.4,
            marginBottom: 4,
          }}
        >
          {shortId}
        </div>
        <div
          style={{
            fontSize: 16,
            fontWeight: 500,
            letterSpacing: -0.3,
            color: "#0a0a0a",
            marginBottom: 4,
            lineHeight: 1.25,
            textOverflow: "ellipsis",
            overflow: "hidden",
            whiteSpace: "nowrap",
          }}
        >
          {application.jobTitle}
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 7,
            marginBottom: 12,
          }}
        >
          <span style={{ fontSize: 13.5, fontWeight: 500, color: "#3a3a36" }}>
            {application.companyName}
          </span>
          {application.location && (
            <>
              <span style={{ color: "#c0beb4" }}>·</span>
              <span style={{ fontSize: 13, color: "#6a6a66" }}>
                {application.location}
              </span>
            </>
          )}
        </div>
        {/* Bottom row */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            flexWrap: "wrap",
          }}
        >
          {/* Status pill (sm) */}
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              background: cfg.bg,
              color: cfg.color,
              border: `1px solid ${cfg.border}`,
              borderRadius: 999,
              padding: "3px 8px 3px 7px",
              fontFamily: MONO,
              fontSize: 10.5,
              fontWeight: 500,
              letterSpacing: 0.3,
              lineHeight: 1,
              whiteSpace: "nowrap",
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

          {/* CV adaptado badge */}
          {hasCv && (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                fontFamily: MONO,
                fontSize: 10.5,
                letterSpacing: 0.3,
                color: "#3a5008",
                background: "rgba(198,255,58,0.22)",
                border: "1px solid rgba(110,150,20,0.25)",
                padding: "3px 8px 3px 7px",
                borderRadius: 999,
                fontWeight: 500,
              }}
            >
              <svg
                width="10"
                height="10"
                viewBox="0 0 10 10"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                aria-hidden="true"
              >
                <path
                  d="M2 5l2 2 4-4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              CV adaptado
            </span>
          )}

          {/* Link badge */}
          {application.jobUrl && (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                fontFamily: MONO,
                fontSize: 10.5,
                color: "#8a8a85",
                padding: "3px 7px",
                borderRadius: 999,
                border: "1px solid rgba(10,10,10,0.08)",
              }}
            >
              <svg
                width="10"
                height="10"
                viewBox="0 0 12 12"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.4"
                aria-hidden="true"
              >
                <path
                  d="M4.5 7.5L7.5 4.5M5 3h-1.5a2 2 0 100 4H5M7 9h1.5a2 2 0 100-4H7"
                  strokeLinecap="round"
                />
              </svg>
              link
            </span>
          )}

          {/* Interview date badge */}
          {application.nextActionAt && (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                fontFamily: MONO,
                fontSize: 10.5,
                color: "#7a5a04",
                background: "rgba(245,197,24,0.16)",
                border: "1px solid rgba(180,140,10,0.22)",
                padding: "3px 8px 3px 7px",
                borderRadius: 999,
                fontWeight: 500,
              }}
            >
              <svg
                width="10"
                height="10"
                viewBox="0 0 12 12"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.4"
                aria-hidden="true"
              >
                <rect x="2" y="3" width="8" height="7" rx="1" />
                <path d="M2 5h8M5 2v2M7 2v2" strokeLinecap="round" />
              </svg>
              {new Date(application.nextActionAt).toLocaleDateString("pt-BR", {
                day: "2-digit",
                month: "short",
              })}
            </span>
          )}

          <span
            style={{
              fontFamily: MONO,
              fontSize: 10.5,
              color: "#8a8a85",
              marginLeft: "auto",
              whiteSpace: "nowrap",
            }}
          >
            {formatDate(application.updatedAt)}
          </span>
        </div>
      </Link>

      {/* Col 2 — score */}
      <Link
        href={detailUrl}
        style={{
          textDecoration: "none",
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-end",
          justifyContent: "center",
          textAlign: "right",
          padding: "22px 24px 22px 20px",
          borderLeft: "1px solid rgba(10,10,10,0.06)",
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
          SCORE
        </div>

        {application.scorePresentation === "not_analyzed" &&
        bestScore === null &&
        scoreAfter === null &&
        scoreBefore === null ? (
          <>
            <div
              style={{
                fontSize: 16,
                fontWeight: 500,
                color: "#6a6963",
                lineHeight: 1.2,
              }}
            >
              Ainda não analisada
            </div>
            <div
              style={{
                fontFamily: MONO,
                fontSize: 10,
                marginTop: 4,
                color: "#a8a6a0",
              }}
            >
              analise a vaga para ver o score
            </div>
          </>
        ) : displayedScore !== null ? (
          <>
            <div
              data-testid="score-highlight-value"
              style={{
                fontSize: 32,
                fontWeight: 500,
                letterSpacing: -0.8,
                color: getDashboardScoreColor(displayedScore),
                lineHeight: 1,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {displayedScore}
              <span style={{ fontSize: 15, marginLeft: 1 }}>%</span>
            </div>
            {scoreDelta !== null && (
              <div
                data-testid="score-highlight-delta"
                style={{
                  fontFamily: MONO,
                  fontSize: 12,
                  marginTop: 3,
                  color: "#4a8a20",
                }}
              >
                {scoreDelta >= 0 ? `+${scoreDelta}` : scoreDelta} vs original
              </div>
            )}
          </>
        ) : (
          /* Neither */
          <>
            <div
              style={{
                fontSize: 32,
                fontWeight: 500,
                letterSpacing: -1.4,
                color: "#c0beb4",
                lineHeight: 1,
              }}
            >
              —
            </div>
            <div
              style={{
                fontFamily: MONO,
                fontSize: 10,
                marginTop: 4,
                color: "#a8a6a0",
              }}
            >
              analisar para gerar
            </div>
          </>
        )}
      </Link>

      {/* Col 3 — CTA contextual */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 6,
          alignItems: "stretch",
          justifyContent: "center",
          padding: "22px 24px",
          borderLeft: "1px solid rgba(10,10,10,0.06)",
        }}
      >
        {isArchivedView && (
          <>
            <button
              type="button"
              onClick={() => void handleRestore()}
              disabled={restoring}
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 6,
                borderRadius: 8,
                padding: "10px 14px",
                fontSize: 12.5,
                fontWeight: 600,
                cursor: restoring ? "not-allowed" : "pointer",
                fontFamily: GEIST,
                textDecoration: "none",
                background: "#c6ff3a",
                color: "#0a0a0a",
                border: "1px solid rgba(110,150,20,0.35)",
                boxShadow: "0 4px 12px rgba(198,255,58,0.18)",
              }}
            >
              <svg
                aria-hidden="true"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
              >
                <path d="M3 12a9 9 0 1 0 3-6.7" strokeLinecap="round" />
                <path
                  d="M3 4v3h3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <span>{restoring ? "Restaurando..." : "Restaurar"}</span>
            </button>
            {restoreError ? (
              <p
                style={{
                  margin: "-2px 0 0",
                  fontSize: 11.5,
                  color: "#991b1b",
                }}
              >
                {restoreError}
              </p>
            ) : null}
            {canDelete ? (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setDeleteError(null);
                    openDeleteModal();
                  }}
                  disabled={deleting}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 6,
                    borderRadius: 8,
                    padding: "10px 14px",
                    fontSize: 12.5,
                    fontWeight: 500,
                    cursor: deleting ? "not-allowed" : "pointer",
                    fontFamily: GEIST,
                    textDecoration: "none",
                    background: "#fff",
                    color: "#7f1d1d",
                    border: "1px solid rgba(185,28,28,0.28)",
                  }}
                >
                  <svg
                    aria-hidden="true"
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                  >
                    <path d="M3 6h18" strokeLinecap="round" />
                    <path
                      d="M8 6V4h8v2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M6 6l1 14h10l1-14"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  <span>{deleting ? "Excluindo..." : "Excluir"}</span>
                </button>
                {deleteError ? (
                  <p
                    style={{
                      margin: "-2px 0 0",
                      fontSize: 11.5,
                      color: "#991b1b",
                    }}
                  >
                    {deleteError}
                  </p>
                ) : null}
              </>
            ) : null}
          </>
        )}

        {canDownloadCv && cvAdaptationIdForActions ? (
          <a
            href={`/api/cv-adaptation/${cvAdaptationIdForActions}/download?format=pdf`}
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 6,
              borderRadius: 8,
              padding: "10px 14px",
              fontSize: 12.5,
              fontWeight: 500,
              cursor: "pointer",
              fontFamily: GEIST,
              textDecoration: "none",
              background: "#fff",
              color: "#0a0a0a",
              border: "1px solid rgba(10,10,10,0.12)",
            }}
          >
            <svg
              aria-hidden="true"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
            >
              <path d="M12 4v11" strokeLinecap="round" />
              <path
                d="m8 11 4 4 4-4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path d="M5 20h14" strokeLinecap="round" />
            </svg>
            <span>Baixar melhor CV</span>
            <span style={{ fontSize: 12, flexShrink: 0 }}>↓</span>
          </a>
        ) : application.bestCvState === "locked" && cvAdaptationIdForActions ? (
          confirmUnlock ? (
            <div
              style={{
                border: "1px solid rgba(10,10,10,0.12)",
                borderRadius: 8,
                padding: "10px 10px 8px",
                background: "#fff",
              }}
            >
              <p style={{ margin: "0 0 8px", fontSize: 12, color: "#3a3a36" }}>
                Confirmar liberação de 1 crédito para baixar este CV?
              </p>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  type="button"
                  onClick={() => {
                    setConfirmUnlock(false);
                    setRedeemError(null);
                  }}
                  style={{
                    flex: 1,
                    borderRadius: 8,
                    border: "1px solid rgba(10,10,10,0.12)",
                    background: "#fff",
                    padding: "8px 10px",
                    fontSize: 12,
                    cursor: "pointer",
                    fontFamily: GEIST,
                  }}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => void handleRedeem()}
                  disabled={redeeming}
                  style={{
                    flex: 1,
                    borderRadius: 8,
                    border: "1px solid #0a0a0a",
                    background: "#0a0a0a",
                    color: "#fff",
                    padding: "8px 10px",
                    fontSize: 12,
                    cursor: redeeming ? "not-allowed" : "pointer",
                    fontFamily: GEIST,
                  }}
                >
                  {redeeming ? "Liberando..." : "Confirmar liberação"}
                </button>
              </div>
              {redeemError ? (
                <p
                  style={{
                    margin: "8px 0 0",
                    fontSize: 11.5,
                    color: "#991b1b",
                  }}
                >
                  {redeemError}
                </p>
              ) : null}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => {
                setConfirmUnlock(true);
                setRedeemError(null);
              }}
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 6,
                borderRadius: 8,
                padding: "10px 14px",
                fontSize: 12.5,
                fontWeight: 500,
                cursor: "pointer",
                fontFamily: GEIST,
                textDecoration: "none",
                background: "#fff",
                color: "#0a0a0a",
                border: "1px solid rgba(10,10,10,0.12)",
              }}
            >
              <svg
                aria-hidden="true"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
              >
                <rect x="4" y="11" width="16" height="9" rx="2" />
                <path d="M8 11V8a4 4 0 1 1 8 0" strokeLinecap="round" />
              </svg>
              <span>Liberar CV · 1 crédito</span>
            </button>
          )
        ) : application.bestCvState === "missing" ? (
          <button
            type="button"
            disabled
            style={{
              borderRadius: 8,
              padding: "10px 14px",
              fontSize: 12.5,
              fontWeight: 500,
              fontFamily: GEIST,
              border: "1px solid rgba(10,10,10,0.08)",
              background: "#f4f4f2",
              color: "#9a9993",
              cursor: "not-allowed",
            }}
          >
            CV adaptado indisponível
          </button>
        ) : null}

        <Link
          href={cta.href}
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: cta.tone !== "ghost" ? "space-between" : "center",
            gap: 6,
            borderRadius: 8,
            padding: "10px 14px",
            fontSize: 12.5,
            fontWeight: cta.tone === "green" ? 600 : 500,
            cursor: "pointer",
            fontFamily: GEIST,
            textDecoration: "none",
            ...(cta.tone === "green"
              ? {
                  background: "#c6ff3a",
                  color: "#0a0a0a",
                  border: "1px solid rgba(110,150,20,0.35)",
                  boxShadow: "0 4px 12px rgba(198,255,58,0.18)",
                }
              : cta.tone === "dark"
                ? {
                    background: "#0a0a0a",
                    color: "#fff",
                    border: "1px solid #0a0a0a",
                    boxShadow: "0 4px 12px rgba(0,0,0,0.10)",
                  }
                : {
                    background: "#fff",
                    color: "#5a5a55",
                    border: "1px solid rgba(10,10,10,0.12)",
                  }),
          }}
        >
          <svg
            aria-hidden="true"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
          >
            <path d="M7 17 17 7" strokeLinecap="round" />
            <path d="M8 7h9v9" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span
            style={{
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {cta.label}
          </span>
          {cta.tone !== "ghost" && (
            <span
              style={{
                fontSize: 12,
                opacity: cta.tone === "dark" ? 0.7 : 1,
                flexShrink: 0,
              }}
            >
              →
            </span>
          )}
        </Link>
      </div>

      {confirmDelete ? (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 70,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(10,10,10,0.35)",
            padding: "0 16px",
            transition: "opacity 180ms ease",
            opacity: confirmDeleteVisible ? 1 : 0,
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: 460,
              background: "#fff",
              border: "1px solid rgba(10,10,10,0.12)",
              borderRadius: 16,
              padding: "20px 18px",
              boxShadow: "0 24px 60px -20px rgba(10,10,10,0.35)",
              transition: "opacity 180ms ease, transform 180ms ease",
              opacity: confirmDeleteVisible ? 1 : 0,
              transform: confirmDeleteVisible
                ? "translateY(0) scale(1)"
                : "translateY(6px) scale(0.98)",
            }}
          >
            <p
              style={{
                margin: "0 0 6px",
                fontSize: 16,
                fontWeight: 600,
                color: "#0a0a0a",
              }}
            >
              Confirmar exclusao
            </p>
            <p
              style={{
                margin: "0 0 14px",
                fontSize: 13.5,
                color: "#55524d",
                lineHeight: 1.45,
              }}
            >
              Esta candidatura sera removida da sua visao e nao podera ser
              restaurada por voce.
            </p>
            <div
              style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}
            >
              <button
                type="button"
                onClick={() => closeDeleteModal()}
                style={{
                  borderRadius: 8,
                  border: "1px solid rgba(10,10,10,0.12)",
                  background: "#fff",
                  color: "#0a0a0a",
                  fontSize: 12,
                  padding: "8px 10px",
                  cursor: "pointer",
                  fontFamily: GEIST,
                }}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void handleDelete()}
                disabled={deleting}
                style={{
                  borderRadius: 8,
                  border: "1px solid #7f1d1d",
                  background: "#7f1d1d",
                  color: "#fff",
                  fontSize: 12,
                  padding: "8px 10px",
                  cursor: deleting ? "not-allowed" : "pointer",
                  fontFamily: GEIST,
                }}
              >
                {deleting ? "Excluindo..." : "Confirmar exclusao"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

type Props = {
  initialApplications: JobApplicationDto[];
  initialArchivedApplications?: JobApplicationDto[];
  initialView?: SegmentKey;
  applicationsLoadError?: string | null;
  hasMasterResume: boolean;
  header: ReactNode;
};

export function CandidaturasClient({
  initialApplications,
  initialArchivedApplications = [],
  initialView = "ativas",
  applicationsLoadError = null,
  hasMasterResume,
  header,
}: Props) {
  const router = useRouter();
  const [segment, setSegment] = useState<SegmentKey>(initialView);
  const [filter, setFilter] = useState<FilterKey>("todas");
  const [showCreate, setShowCreate] = useState(false);
  const [, startTransition] = useTransition();
  const [archivedApplications, setArchivedApplications] = useState(
    initialArchivedApplications,
  );
  const [derivedScores, setDerivedScores] = useState<
    Record<string, { scoreBefore: number | null; scoreAfter: number | null }>
  >({});

  useEffect(() => {
    const allApplications = [...initialApplications, ...archivedApplications];
    const targets = allApplications.filter(
      (application) =>
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

  const filteredApplications = scopedApplications.filter((app) => {
    const group = FILTERS.find((f) => f.key === filter);
    if (!group?.statuses) return true;
    return group.statuses.includes(app.status as JobApplicationStatus);
  });

  const counts = {
    todas: scopedApplications.length,
    abertas: scopedApplications.filter((a) =>
      OPEN_STATUSES.includes(a.status as JobApplicationStatus),
    ).length,
    processo: scopedApplications.filter((a) =>
      IN_PROCESS_STATUSES.includes(a.status as JobApplicationStatus),
    ).length,
    finalizadas: scopedApplications.filter((a) =>
      CLOSED_STATUSES.includes(a.status as JobApplicationStatus),
    ).length,
  };

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

  const handleDeleted = useCallback((applicationId: string) => {
    setArchivedApplications((current) =>
      current.filter((application) => application.id !== applicationId),
    );
  }, []);

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
            maxWidth: 1100,
            margin: "0 auto",
            padding: "12px 32px 80px",
            position: "relative",
            zIndex: 2,
          }}
        >
          <div style={{ paddingTop: 72 }} />

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
                {scopedApplications.length === 0
                  ? "0 CANDIDATURAS"
                  : `${scopedApplications.length} CANDIDATURAS${counts.processo > 0 ? ` · ${counts.processo} EM PROCESSO` : ""}`}
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

          {/* Filters + sort */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginBottom: 24,
              flexWrap: "wrap",
            }}
          >
            <button
              type="button"
              onClick={() => {
                setSegment("ativas");
                setFilter("todas");
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
                    segment === "ativas" ? "rgba(250,250,246,0.7)" : "#8a8a85",
                }}
              >
                {initialApplications.length}
              </span>
            </button>
            <button
              type="button"
              onClick={() => {
                setSegment("arquivadas");
                setFilter("todas");
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
            <div
              style={{
                width: 1,
                height: 20,
                background: "rgba(10,10,10,0.1)",
                marginInline: 2,
              }}
            />
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
                      fontWeight: 500,
                      color: isActive ? "rgba(250,250,246,0.7)" : "#8a8a85",
                    }}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
            <div style={{ flex: 1 }} />
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                fontFamily: MONO,
                fontSize: 11,
                color: "#5a5a55",
                background: "#fff",
                border: "1px solid rgba(10,10,10,0.08)",
                borderRadius: 8,
                padding: "7px 12px",
                cursor: "default",
              }}
            >
              <span style={{ color: "#8a8a85", letterSpacing: 0.5 }}>
                ORDENAR:
              </span>
              <span style={{ color: "#0a0a0a", fontWeight: 500 }}>
                Mais recente
              </span>
              <span style={{ fontSize: 9, color: "#8a8a85" }}>▾</span>
            </div>
          </div>

          {/* List */}
          {filteredApplications.length === 0 ? (
            <EmptyState
              filter={filter}
              segment={segment}
              onAdd={() => setShowCreate(true)}
            />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {filteredApplications.map((app) => (
                <CandRow
                  key={app.id}
                  application={app}
                  derivedScore={derivedScores[app.id]}
                  isArchivedView={segment === "arquivadas"}
                  onRestored={handleRestored}
                  onDeleted={handleDeleted}
                />
              ))}
            </div>
          )}
        </div>

        <style>{`
          @media (max-width: 700px) {
            .cand-row { grid-template-columns: 1fr !important; }
            .cand-row > * { border-left: none !important; }
          }
          .cand-row:hover {
            border-color: rgba(10,10,10,0.16) !important;
            box-shadow: 0 4px 20px -4px rgba(10,10,10,0.12) !important;
          }
        `}</style>
      </main>

      <CreateApplicationModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={handleCreated}
        hasMasterResume={hasMasterResume}
      />
    </PageShell>
  );
}
