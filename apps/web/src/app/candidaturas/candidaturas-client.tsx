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
import { EcvBuildLoader } from "@/components/ecv-loader";
import { PageShell } from "@/components/page-shell";
import { PublicFooter } from "@/components/public-footer";
import { trackEvent } from "@/lib/analytics-tracking";
import { downloadFromApi } from "@/lib/client-download";
import { extractDashboardAnalysisSignal } from "@/lib/dashboard-test-metrics";
import {
  getStatusConfig,
  IN_PROCESS_STATUSES,
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

type SegmentKey = "ativas" | "arquivadas";
type SortKey = "date" | "score";
type SortDir = "asc" | "desc";
type SortState = { key: SortKey; dir: SortDir };

const SECTION_GROUPS: {
  key: string;
  label: string;
  step: number;
  statuses: JobApplicationStatus[];
  accent: string;
  headerBg: string;
  scoreColor: string | null;
  dark: boolean;
}[] = [
  {
    key: "saved",
    step: 1,
    label: "Salva",
    statuses: ["SAVED"],
    accent: "#c0beb4",
    headerBg: "rgba(192,190,180,0.10)",
    scoreColor: null,
    dark: false,
  },
  {
    key: "analyzed",
    step: 2,
    label: "CV Analisado",
    statuses: ["ANALYZED"],
    accent: "#7a8a85",
    headerBg: "rgba(122,138,133,0.10)",
    scoreColor: "#2a6a10",
    dark: false,
  },
  {
    key: "cv_ready",
    step: 3,
    label: "CV liberado",
    statuses: ["CV_READY"],
    accent: "#7aa811",
    headerBg: "rgba(122,168,17,0.09)",
    scoreColor: "#2a6a10",
    dark: false,
  },
  {
    key: "applied",
    step: 4,
    label: "Candidatura feita",
    statuses: ["APPLIED"],
    accent: "#1a1a18",
    headerBg: "rgba(10,10,10,0.055)",
    scoreColor: "#2a6a10",
    dark: true,
  },
  {
    key: "interview",
    step: 5,
    label: "Em entrevista",
    statuses: ["INTERVIEW", "IN_PROCESS", "ASSESSMENT", "OFFER"],
    accent: "#c8a000",
    headerBg: "rgba(200,160,0,0.09)",
    scoreColor: "#7a5a00",
    dark: false,
  },
  {
    key: "closed",
    step: 6,
    label: "Finalizada",
    statuses: ["HIRED", "REJECTED", "WITHDRAWN"],
    accent: "#a8a6a0",
    headerBg: "rgba(168,166,160,0.08)",
    scoreColor: "#2a6a10",
    dark: false,
  },
];

type CtaTone = "green" | "dark" | "ghost";
type Cta = { label: string; tone: CtaTone; href: string };

function ctaForStatus(
  status: JobApplicationStatus,
  detailUrl: string,
  hasInterviewPrep?: boolean,
): Cta {
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
      return {
        label: hasInterviewPrep
          ? "Registrar próximo passo"
          : "Preparar entrevista",
        tone: "green",
        href: detailUrl,
      };
    case "INTERVIEW":
      return {
        label: hasInterviewPrep
          ? "Registrar próximo passo"
          : "Preparar entrevista",
        tone: "green",
        href: detailUrl,
      };
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

function StatusAccordion({
  label,
  count,
  open,
  onToggle,
  step,
  accent,
  headerBg,
  dark,
  previewCompanies,
  sortState,
  onSortChange,
  children,
}: {
  label: string;
  count: number;
  open: boolean;
  onToggle: () => void;
  step: number;
  accent: string;
  headerBg: string;
  dark: boolean;
  previewCompanies: string[];
  sortState: SortState;
  onSortChange: (key: SortKey) => void;
  children: ReactNode;
}) {
  const stepBg = dark ? accent : `${accent}26`;
  const stepBorder = dark ? `1.5px solid ${accent}` : `1.5px solid ${accent}60`;
  const stepColor = dark ? "#fafaf6" : accent;
  const countBg = open ? `${accent}1c` : "rgba(10,10,10,0.05)";
  const countColor = open ? accent : "#6a6a66";
  const countBorder = open
    ? `1px solid ${accent}36`
    : "1px solid rgba(10,10,10,0.08)";

  return (
    <div
      style={{
        borderRadius: 13,
        overflow: "hidden",
        border: "1px solid rgba(10,10,10,0.07)",
        borderLeft: `3px solid ${accent}`,
        background: "#fafaf6",
      }}
    >
      {/* Header — div intencional: contém buttons internos, <button> aninhado é HTML inválido */}
      {/* biome-ignore lint/a11y/useSemanticElements: cannot use <button> here — contains interactive children */}
      <div
        role="button"
        tabIndex={0}
        onClick={onToggle}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onToggle();
          }
        }}
        aria-expanded={open}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "13px 18px",
          background: open ? headerBg : "transparent",
          borderBottom: open ? "1px solid rgba(10,10,10,0.05)" : "none",
          transition: "background 0.13s, border-color 0.3s ease",
          cursor: "pointer",
        }}
      >
        {/* Step + label */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            flex: open ? 0 : 0,
            fontFamily: GEIST,
          }}
        >
          {/* Step indicator */}
          <div
            style={{
              width: 22,
              height: 22,
              borderRadius: 6,
              flexShrink: 0,
              background: stepBg,
              border: stepBorder,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: MONO,
              fontSize: 9.5,
              fontWeight: 700,
              color: stepColor,
            }}
          >
            {step}
          </div>
          <span
            style={{
              fontSize: 13.5,
              fontWeight: 500,
              color: "#0a0a0a",
              letterSpacing: -0.2,
              whiteSpace: "nowrap",
            }}
          >
            {label}
          </span>
        </div>

        {/* Collapsed: company chips + avg */}
        {!open && (
          <div
            style={{
              display: "flex",
              gap: 5,
              marginLeft: 4,
              flex: 1,
              overflow: "hidden",
              alignItems: "center",
            }}
          >
            {previewCompanies.map((company) => (
              <span
                key={company}
                style={{
                  fontFamily: MONO,
                  fontSize: 10.5,
                  color: "#6a6a66",
                  background: "rgba(10,10,10,0.04)",
                  border: "1px solid rgba(10,10,10,0.07)",
                  borderRadius: 999,
                  padding: "3px 9px",
                  whiteSpace: "nowrap",
                  maxWidth: 130,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {company}
              </span>
            ))}
            {count > previewCompanies.length && (
              <span
                style={{
                  fontFamily: MONO,
                  fontSize: 10.5,
                  color: "#8a8a85",
                  flexShrink: 0,
                }}
              >
                +{count - previewCompanies.length}
              </span>
            )}
          </div>
        )}

        {open && <div style={{ flex: 1 }} />}

        {/* Sort buttons - só quando aberto */}
        {open && (
          <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
            {(["date", "score"] as SortKey[]).map((sk) => {
              const active = sortState.key === sk;
              const arrow = active
                ? sortState.dir === "desc"
                  ? " ↓"
                  : " ↑"
                : "";
              return (
                <button
                  key={sk}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSortChange(sk);
                  }}
                  style={{
                    fontFamily: MONO,
                    fontSize: 10.5,
                    fontWeight: 500,
                    color: active ? "#0a0a0a" : "#5a5a55",
                    background: active
                      ? "rgba(10,10,10,0.07)"
                      : "rgba(10,10,10,0.04)",
                    border: active
                      ? "1px solid rgba(10,10,10,0.16)"
                      : "1px solid rgba(10,10,10,0.09)",
                    borderRadius: 6,
                    padding: "4px 9px",
                    cursor: "pointer",
                    display: "inline-flex",
                    gap: 3,
                    alignItems: "center",
                    transition: "all 140ms ease",
                  }}
                >
                  {sk === "date" ? "DATA" : "SCORE"}
                  {arrow && (
                    <span style={{ opacity: 0.55, fontSize: 9 }}>{arrow}</span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* Count badge */}
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            minWidth: 22,
            height: 20,
            borderRadius: 5,
            padding: "0 6px",
            background: countBg,
            color: countColor,
            border: countBorder,
            fontFamily: MONO,
            fontSize: 10.5,
            fontWeight: 600,
            flexShrink: 0,
            transition: "all 0.13s",
          }}
        >
          {count}
        </span>

        {/* Chevron */}
        <div
          aria-hidden="true"
          style={{
            background: "transparent",
            border: "none",
            padding: "2px",
            display: "flex",
            alignItems: "center",
            flexShrink: 0,
          }}
        >
          <svg
            width="13"
            height="13"
            viewBox="0 0 14 14"
            fill="none"
            aria-hidden="true"
            style={{
              color: "#8a8a85",
              transform: open ? "rotate(0deg)" : "rotate(-90deg)",
              transition: "transform 0.15s",
            }}
          >
            <path
              d="M3 5l4 4 4-4"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      </div>

      {/* Body com animação suave */}
      <div
        style={{
          display: "grid",
          gridTemplateRows: open ? "1fr" : "0fr",
          transition: "grid-template-rows 0.3s ease",
        }}
      >
        <div style={{ overflow: "hidden" }}>
          <div
            style={{
              padding: "10px 14px 14px",
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

function CandRow({
  application,
  derivedScore,
  scoreColor,
  isArchivedView,
  onRestored,
  onDeleted,
}: {
  application: JobApplicationDto;
  derivedScore?: { scoreBefore: number | null; scoreAfter: number | null };
  scoreColor: string | null;
  isArchivedView: boolean;
  onRestored: (applicationId: string) => void;
  onDeleted: (applicationId: string) => void;
}) {
  const router = useRouter();
  const [confirmUnlock, setConfirmUnlock] = useState(false);
  const [confirmUnlockVisible, setConfirmUnlockVisible] = useState(false);
  const [redeeming, setRedeeming] = useState(false);
  const [redeemError, setRedeemError] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmDeleteVisible, setConfirmDeleteVisible] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const closeTimerRef = useRef<number | null>(null);
  const detailUrl = `/candidaturas/${application.id}`;
  const cta = ctaForStatus(
    application.status,
    detailUrl,
    !!application.interviewPrep,
  );
  const scoreBefore =
    derivedScore?.scoreBefore ?? application.scoreBefore ?? null;
  const scoreAfter = derivedScore?.scoreAfter ?? application.scoreAfter ?? null;
  const shortId = `#${application.id.slice(-5).toUpperCase()}`;
  const cfg = getStatusConfig(application.status);
  const bestScore =
    derivedScore?.scoreAfter ?? application.bestScore ?? scoreAfter;
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
      closeUnlockModal();
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

  const handleDownloadCv = async () => {
    if (!cvAdaptationIdForActions || downloading) return;
    setDownloading(true);
    try {
      await downloadFromApi({
        url: `/api/cv-adaptation/${cvAdaptationIdForActions}/download?format=pdf`,
        fallbackFilename: "cv-adaptado.pdf",
      });
    } catch {
      // silently ignore — browser may have blocked or download failed
    } finally {
      setDownloading(false);
    }
  };

  const openUnlockModal = () => {
    setRedeemError(null);
    setConfirmUnlock(true);
    setConfirmUnlockVisible(false);
    window.requestAnimationFrame(() => setConfirmUnlockVisible(true));
  };

  const closeUnlockModal = () => {
    setConfirmUnlockVisible(false);
    if (closeTimerRef.current) {
      window.clearTimeout(closeTimerRef.current);
    }
    closeTimerRef.current = window.setTimeout(() => {
      setConfirmUnlock(false);
      setRedeemError(null);
      closeTimerRef.current = null;
    }, 180);
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
        background: "#fff",
        border: "1px solid rgba(10,10,10,0.06)",
        borderRadius: 11,
        display: "grid",
        gridTemplateColumns: "1fr 148px 240px",
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
          padding: "16px 18px",
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
            {formatDate(application.createdAt)}
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
          padding: "16px 18px 16px 20px",
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
            marginBottom: 4,
          }}
        >
          {displayedScore !== null ? "SCORE APÓS" : "SCORE"}
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
                fontSize: 30,
                fontWeight: 500,
                letterSpacing: -1.4,
                color: scoreColor ?? "#2a6a10",
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
                  fontSize: 10,
                  marginTop: 3,
                  color: scoreColor ?? "#2a6a10",
                  opacity: 0.72,
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
                fontSize: 26,
                fontWeight: 300,
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
          padding: "16px 18px",
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

        {!isArchivedView &&
          (canDownloadCv && cvAdaptationIdForActions ? (
            <>
              <button
                type="button"
                onClick={() => void handleDownloadCv()}
                disabled={downloading}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                  borderRadius: 8,
                  padding: "10px 14px",
                  fontSize: 12.5,
                  fontWeight: 500,
                  cursor: downloading ? "default" : "pointer",
                  fontFamily: GEIST,
                  background: "#fff",
                  color: "#0a0a0a",
                  border: "1px solid rgba(10,10,10,0.12)",
                  whiteSpace: "nowrap",
                  opacity: downloading ? 0.6 : 1,
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
              </button>

              {/* Overlay de download */}
              {downloading && (
                <div
                  style={{
                    position: "fixed",
                    inset: 0,
                    zIndex: 200,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: "0 16px",
                    background: "rgba(10,10,10,0.5)",
                    backdropFilter: "blur(4px)",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: 20,
                      borderRadius: 20,
                      border: "1px solid rgba(255,255,255,0.08)",
                      background: "#0a0a0a",
                      padding: "32px",
                      width: "100%",
                      maxWidth: 380,
                      boxShadow: "0 32px 80px -16px rgba(0,0,0,0.8)",
                    }}
                  >
                    <EcvBuildLoader size={64} dark />
                    <div style={{ textAlign: "center" }}>
                      <p
                        style={{
                          fontFamily: GEIST,
                          fontSize: 15,
                          fontWeight: 500,
                          letterSpacing: -0.2,
                          color: "#fafaf6",
                          margin: "0 0 6px",
                        }}
                      >
                        Preparando download...
                      </p>
                      <p
                        style={{
                          fontFamily: MONO,
                          fontSize: 10.5,
                          color: "#5a5a55",
                          margin: 0,
                          letterSpacing: 0.3,
                        }}
                      >
                        GERANDO PDF DO CV OTIMIZADO
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </>
          ) : application.bestCvState === "locked" &&
            cvAdaptationIdForActions ? (
            <button
              type="button"
              onClick={openUnlockModal}
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
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
                whiteSpace: "nowrap",
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
              CV indisponível
            </button>
          ) : null)}

        {!isArchivedView && (
          <Link
            href={cta.href}
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
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
            <span style={{ whiteSpace: "nowrap" }}>{cta.label}</span>
          </Link>
        )}
      </div>

      {confirmUnlock ? (
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
            opacity: confirmUnlockVisible ? 1 : 0,
          }}
        >
          <button
            type="button"
            aria-label="Fechar"
            onClick={() => {
              if (!redeeming) closeUnlockModal();
            }}
            style={{
              position: "absolute",
              inset: 0,
              border: 0,
              background: "transparent",
              cursor: "pointer",
            }}
          />
          <div
            style={{
              position: "relative",
              zIndex: 1,
              width: "100%",
              maxWidth: 420,
              background: "#fff",
              border: "1px solid rgba(10,10,10,0.12)",
              borderRadius: 16,
              padding: "20px 18px",
              boxShadow: "0 24px 60px -20px rgba(10,10,10,0.35)",
              transition: "opacity 180ms ease, transform 180ms ease",
              opacity: confirmUnlockVisible ? 1 : 0,
              transform: confirmUnlockVisible
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
              Liberar CV
            </p>
            <div
              style={{
                margin: "0 0 12px",
                padding: "8px 10px",
                background: "rgba(10,10,10,0.04)",
                borderRadius: 8,
                border: "1px solid rgba(10,10,10,0.08)",
              }}
            >
              <p
                style={{
                  margin: 0,
                  fontSize: 13.5,
                  fontWeight: 600,
                  color: "#0a0a0a",
                  lineHeight: 1.3,
                }}
              >
                {application.jobTitle}
              </p>
              <p
                style={{
                  margin: "2px 0 0",
                  fontSize: 12,
                  color: "#6a6a65",
                }}
              >
                {application.companyName}
              </p>
            </div>
            <p
              style={{
                margin: "0 0 14px",
                fontSize: 13.5,
                color: "#55524d",
                lineHeight: 1.45,
              }}
            >
              Será usado 1 crédito para liberar o download deste CV adaptado.
              Essa ação não pode ser desfeita.
            </p>
            {redeemError ? (
              <p
                style={{
                  margin: "-8px 0 12px",
                  fontSize: 12,
                  color: "#991b1b",
                }}
              >
                {redeemError}
              </p>
            ) : null}
            <div
              style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}
            >
              <button
                type="button"
                onClick={() => closeUnlockModal()}
                disabled={redeeming}
                style={{
                  borderRadius: 8,
                  border: "1px solid rgba(10,10,10,0.12)",
                  background: "#fff",
                  color: "#0a0a0a",
                  fontSize: 12,
                  padding: "8px 10px",
                  cursor: redeeming ? "not-allowed" : "pointer",
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
                  borderRadius: 8,
                  border: "1px solid #0a0a0a",
                  background: "#0a0a0a",
                  color: "#fff",
                  fontSize: 12,
                  padding: "8px 10px",
                  cursor: redeeming ? "not-allowed" : "pointer",
                  fontFamily: GEIST,
                }}
              >
                {redeeming ? "Liberando..." : "Confirmar liberação"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

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
  const [showCreate, setShowCreate] = useState(false);
  const [, startTransition] = useTransition();
  const [archivedApplications, setArchivedApplications] = useState(
    initialArchivedApplications,
  );
  const [derivedScores, setDerivedScores] = useState<
    Record<string, { scoreBefore: number | null; scoreAfter: number | null }>
  >({});
  const [openSections, setOpenSections] = useState<Record<string, boolean>>(
    () => {
      const initial: Record<string, boolean> = {};
      for (const g of SECTION_GROUPS) {
        initial[g.key] = true;
      }
      return initial;
    },
  );
  const [companyFilter, setCompanyFilter] = useState("");
  const [companyDropdownOpen, setCompanyDropdownOpen] = useState(false);
  const companyDropdownRef = useRef<HTMLDivElement>(null);
  const [sectionSorts, setSectionSorts] = useState<Record<string, SortState>>(
    {},
  );

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

  useEffect(() => {
    if (!companyDropdownOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (
        companyDropdownRef.current &&
        !companyDropdownRef.current.contains(e.target as Node)
      ) {
        setCompanyDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [companyDropdownOpen]);

  const scopedApplications =
    segment === "arquivadas" ? archivedApplications : initialApplications;

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

  const handleDeleted = useCallback((applicationId: string) => {
    setArchivedApplications((current) =>
      current.filter((application) => application.id !== applicationId),
    );
  }, []);

  const toggleSection = useCallback((key: string) => {
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const setSectionSort = useCallback(
    (groupKey: string, clickedKey: SortKey) => {
      setSectionSorts((prev) => {
        const current = prev[groupKey] ?? { key: "date", dir: "desc" };
        if (current.key === clickedKey) {
          return {
            ...prev,
            [groupKey]: {
              key: clickedKey,
              dir: current.dir === "desc" ? "asc" : "desc",
            },
          };
        }
        return { ...prev, [groupKey]: { key: clickedKey, dir: "desc" } };
      });
    },
    [],
  );

  const companies = Array.from(
    new Set(scopedApplications.map((a) => a.companyName)),
  ).sort();

  const filteredApplications =
    companyFilter === ""
      ? scopedApplications
      : scopedApplications.filter((a) => a.companyName === companyFilter);

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
            maxWidth: 1100,
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
                {scopedApplications.length === 0
                  ? "0 CANDIDATURAS"
                  : `${scopedApplications.length} CANDIDATURAS${inProcessCount > 0 ? ` · ${inProcessCount} EM PROCESSO` : ""}`}
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

          {/* Segment toggle + company filter */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginBottom: 24,
            }}
          >
            <button
              type="button"
              onClick={() => {
                setSegment("ativas");
                setCompanyFilter("");
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
                setCompanyFilter("");
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

            {companies.length > 1 && (
              <div
                ref={companyDropdownRef}
                style={{ marginLeft: "auto", position: "relative" }}
              >
                <button
                  type="button"
                  onClick={() => setCompanyDropdownOpen((v) => !v)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    background: "#fff",
                    color: companyFilter ? "#0a0a0a" : "#3a3a36",
                    border: companyFilter
                      ? "1.5px solid #0a0a0a"
                      : "1px solid rgba(10,10,10,0.10)",
                    borderRadius: 999,
                    padding: "7px 12px 7px 14px",
                    fontSize: 13,
                    fontWeight: companyFilter ? 600 : 500,
                    fontFamily: GEIST,
                    cursor: "pointer",
                    outline: "none",
                    whiteSpace: "nowrap",
                  }}
                >
                  {companyFilter || "Todos"}
                  <svg
                    width="10"
                    height="6"
                    viewBox="0 0 10 6"
                    fill="none"
                    style={{
                      transition: "transform 0.18s ease",
                      transform: companyDropdownOpen
                        ? "rotate(180deg)"
                        : "rotate(0deg)",
                      flexShrink: 0,
                    }}
                    aria-hidden
                  >
                    <title>Alternar filtro de empresa</title>
                    <path
                      d="M1 1l4 4 4-4"
                      stroke="#8a8a85"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>

                {/* Dropdown list */}
                <div
                  style={{
                    position: "absolute",
                    top: "calc(100% + 6px)",
                    right: 0,
                    background: "#fff",
                    border: "1px solid rgba(10,10,10,0.09)",
                    borderRadius: 12,
                    boxShadow: "0 8px 28px rgba(0,0,0,0.10)",
                    minWidth: 180,
                    overflow: "hidden",
                    zIndex: 50,
                    opacity: companyDropdownOpen ? 1 : 0,
                    transform: companyDropdownOpen
                      ? "translateY(0)"
                      : "translateY(-6px)",
                    pointerEvents: companyDropdownOpen ? "auto" : "none",
                    transition: "opacity 0.16s ease, transform 0.16s ease",
                  }}
                >
                  {[
                    { label: "Todos", value: "" },
                    ...companies.map((c) => ({ label: c, value: c })),
                  ].map((opt) => (
                    <button
                      key={opt.value || "__all__"}
                      type="button"
                      onClick={() => {
                        setCompanyFilter(opt.value);
                        setCompanyDropdownOpen(false);
                      }}
                      style={{
                        display: "block",
                        width: "100%",
                        textAlign: "left",
                        padding: "9px 16px",
                        fontSize: 13,
                        fontFamily: GEIST,
                        fontWeight: companyFilter === opt.value ? 600 : 400,
                        color:
                          companyFilter === opt.value ? "#0a0a0a" : "#3a3a36",
                        background:
                          companyFilter === opt.value
                            ? "rgba(10,10,10,0.04)"
                            : "transparent",
                        border: "none",
                        cursor: "pointer",
                      }}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Sections */}
          {scopedApplications.length === 0 ? (
            <EmptyState segment={segment} onAdd={() => setShowCreate(true)} />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {companyFilter !== "" && filteredApplications.length === 0 && (
                <div
                  style={{
                    padding: "28px 22px",
                    textAlign: "center",
                    color: "#8a8a85",
                    fontSize: 14,
                    border: "1px dashed rgba(10,10,10,0.12)",
                    borderRadius: 14,
                  }}
                >
                  Nenhuma candidatura encontrada para{" "}
                  <strong style={{ color: "#3a3a36" }}>{companyFilter}</strong>.{" "}
                  <button
                    type="button"
                    onClick={() => setCompanyFilter("")}
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
              )}
              {SECTION_GROUPS.map((group) => {
                const { step, accent, headerBg, scoreColor, dark } = group;
                const sortState = sectionSorts[group.key] ?? {
                  key: "date",
                  dir: "desc",
                };
                const apps = filteredApplications
                  .filter((a) =>
                    group.statuses.includes(a.status as JobApplicationStatus),
                  )
                  .sort((a, b) => {
                    let diff: number;
                    if (sortState.key === "score") {
                      const sa =
                        derivedScores[a.id]?.scoreAfter ??
                        a.bestScore ??
                        a.scoreAfter ??
                        a.scoreBefore ??
                        -1;
                      const sb =
                        derivedScores[b.id]?.scoreAfter ??
                        b.bestScore ??
                        b.scoreAfter ??
                        b.scoreBefore ??
                        -1;
                      diff = sb - sa;
                    } else {
                      diff =
                        new Date(b.createdAt).getTime() -
                        new Date(a.createdAt).getTime();
                    }
                    return sortState.dir === "asc" ? -diff : diff;
                  });

                if (apps.length === 0) return null;

                const isOpen = openSections[group.key] ?? true;

                const previewCompanies = apps
                  .slice(0, 3)
                  .map((a) => a.companyName);
                const scoreSamples = apps
                  .map(
                    (a) =>
                      derivedScores[a.id]?.scoreAfter ??
                      a.bestScore ??
                      a.scoreAfter ??
                      a.scoreBefore ??
                      null,
                  )
                  .filter((s): s is number => s !== null);
                const _avgScore =
                  scoreSamples.length > 0
                    ? Math.round(
                        scoreSamples.reduce((acc, s) => acc + s, 0) /
                          scoreSamples.length,
                      )
                    : null;

                return (
                  <StatusAccordion
                    key={group.key}
                    label={group.label}
                    count={apps.length}
                    open={isOpen}
                    onToggle={() => toggleSection(group.key)}
                    step={step}
                    accent={accent}
                    headerBg={headerBg}
                    dark={dark}
                    previewCompanies={previewCompanies}
                    sortState={sortState}
                    onSortChange={(sk) => setSectionSort(group.key, sk)}
                  >
                    {apps.map((app) => (
                      <CandRow
                        key={app.id}
                        application={app}
                        derivedScore={derivedScores[app.id]}
                        scoreColor={scoreColor}
                        isArchivedView={segment === "arquivadas"}
                        onRestored={handleRestored}
                        onDeleted={handleDeleted}
                      />
                    ))}
                  </StatusAccordion>
                );
              })}
            </div>
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
