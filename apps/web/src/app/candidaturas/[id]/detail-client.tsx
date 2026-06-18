"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  type ReactNode,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import {
  CvReleaseModal,
  type CvReleaseModalStatus,
} from "@/components/cv-release-modal";
import { DownloadProgressOverlay } from "@/components/download-progress-overlay";
import { PageShell } from "@/components/page-shell";
import { PublicFooter } from "@/components/public-footer";
import {
  type DownloadProgressStage,
  downloadFromApi,
} from "@/lib/client-download";
import { buildCvUnlockPlansHref } from "@/lib/cv-unlock-flow";
import { getDashboardScoreColor } from "@/lib/dashboard-test-metrics";
import { ALL_STATUSES, getStatusConfig } from "@/lib/job-application-status";
import type {
  JobApplicationDetailDto,
  JobApplicationEvent,
  JobApplicationStatus,
} from "@/lib/job-applications-api";
import {
  addJobApplicationNote,
  archiveJobApplication,
  deleteJobApplication,
  restoreJobApplication,
  scheduleInterview,
  submitRejectionFeedback,
  updateJobApplicationStatus,
  updateJobApplicationUrl,
} from "@/lib/job-applications-api";
import { InterviewPrepDrawer } from "./interview-prep-drawer";

const USER_VISIBLE_STATUS_OPTIONS: Array<{
  value: JobApplicationStatus;
  label: string;
}> = [
  { value: "SAVED", label: "Salva" },
  { value: "ANALYZED", label: "Analisada" },
  { value: "CV_READY", label: "CV Liberado" },
  { value: "APPLIED", label: "Candidatado" },
  { value: "INTERVIEW", label: "Em entrevista" },
  { value: "HIRED", label: "Contratado" },
  { value: "REJECTED", label: "Recusado" },
  { value: "WITHDRAWN", label: "Desistência" },
];

const GEIST = "var(--font-geist), -apple-system, system-ui, sans-serif";
const MONO = "var(--font-geist-mono), monospace";

// Returns { visible, close } — visible drives CSS transitions, close animates out then calls onClose
function useModalFade(onClose: () => void) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(id);
  }, []);
  function close() {
    setVisible(false);
    setTimeout(onClose, 190);
  }
  return { visible, close };
}

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

// ─── Jornada (stepper) ───────────────────────────────────────────

type StepState = "done" | "current" | "upcoming";

type JornadaStep = {
  key: string;
  label: string;
  getMeta: (app: JobApplicationDetailDto) => string | null;
  terminal?: boolean;
};

const JORNADA_STEPS: JornadaStep[] = [
  {
    key: "ANALYZED",
    label: "Analisada",
    getMeta: () => null,
  },
  {
    key: "CV_READY",
    label: "CV liberado",
    getMeta: () => null,
  },
  {
    key: "APPLIED",
    label: "Candidatado",
    getMeta: (app) => {
      if (app.appliedAt)
        return new Date(app.appliedAt).toLocaleDateString("pt-BR", {
          day: "2-digit",
          month: "short",
        });
      return null;
    },
  },
  {
    key: "INTERVIEW",
    label: "Em entrevista",
    getMeta: (app) => {
      if (app.nextActionAt) {
        const d = new Date(app.nextActionAt);
        return (
          d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }) +
          " · " +
          d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
        );
      }
      return null;
    },
  },
  {
    key: "RESULT",
    label: "Resultado",
    getMeta: () => null,
    terminal: true,
  },
];

function getStepState(
  stepKey: string,
  status: JobApplicationStatus,
): StepState {
  const order = [
    "SAVED",
    "ANALYZED",
    "CV_READY",
    "APPLIED",
    "IN_PROCESS",
    "ASSESSMENT",
    "INTERVIEW",
    "OFFER",
    "HIRED",
    "REJECTED",
    "WITHDRAWN",
  ];
  const statusIdx = order.indexOf(status);

  if (stepKey === "ANALYZED") {
    if (statusIdx >= order.indexOf("CV_READY")) return "done";
    if (status === "ANALYZED") return "done";
    return "upcoming";
  }
  if (stepKey === "CV_READY") {
    if (statusIdx >= order.indexOf("APPLIED")) return "done";
    if (status === "CV_READY") return "current";
    if (statusIdx > order.indexOf("CV_READY")) return "done";
    return "upcoming";
  }
  if (stepKey === "APPLIED") {
    if (
      statusIdx >= order.indexOf("IN_PROCESS") ||
      status === "APPLIED" ||
      status === "INTERVIEW" ||
      status === "ASSESSMENT" ||
      status === "OFFER" ||
      status === "HIRED" ||
      status === "REJECTED" ||
      status === "WITHDRAWN"
    ) {
      return statusIdx > order.indexOf("APPLIED") ? "done" : "done";
    }
    if (status === "CV_READY") return "upcoming";
    return "upcoming";
  }
  if (stepKey === "INTERVIEW") {
    if (
      status === "HIRED" ||
      status === "REJECTED" ||
      status === "WITHDRAWN" ||
      status === "OFFER"
    )
      return "done";
    if (
      status === "INTERVIEW" ||
      status === "IN_PROCESS" ||
      status === "ASSESSMENT"
    )
      return "current";
    return "upcoming";
  }
  if (stepKey === "RESULT") {
    if (status === "HIRED" || status === "REJECTED" || status === "WITHDRAWN")
      return "done";
    return "upcoming";
  }
  return "upcoming";
}

function getJornadaSubtitle(status: JobApplicationStatus): string {
  const map: Record<string, string> = {
    SAVED: "aguardando análise",
    ANALYZED: "análise concluída · pronto para adaptar",
    CV_READY: "CV adaptado pronto · candidate-se",
    APPLIED: "candidatura realizada",
    IN_PROCESS: "em entrevista",
    INTERVIEW: "em entrevista",
    ASSESSMENT: "em entrevista",
    OFFER: "em entrevista",
    HIRED: "contratado",
    REJECTED: "não avançou nesta vaga",
    WITHDRAWN: "desistiu da candidatura",
  };
  return map[status] ?? status.toLowerCase();
}

function JornadaStep({
  step,
  state,
  meta,
  isLast,
  onHired,
  onRejected,
  status,
}: {
  step: JornadaStep;
  state: StepState;
  meta: string | null;
  isLast: boolean;
  onHired?: () => void;
  onRejected?: () => void;
  status: JobApplicationStatus;
}) {
  const done = state === "done";
  const current = state === "current";

  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        textAlign: "center",
        minWidth: 0,
      }}
    >
      {/* "AGORA" tag or spacer */}
      <div
        style={{
          height: 18,
          marginBottom: 5,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {current && (
          <span
            style={{
              fontFamily: MONO,
              fontSize: 8.5,
              fontWeight: 600,
              letterSpacing: 0.8,
              color: "#7a5a04",
              background: "rgba(245,197,24,0.22)",
              border: "1px solid rgba(180,140,10,0.3)",
              borderRadius: 999,
              padding: "2px 8px",
            }}
          >
            AGORA
          </span>
        )}
      </div>

      {/* Node row with connector */}
      <div
        style={{
          position: "relative",
          width: "100%",
          height: 30,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {!isLast && (
          <div
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              width: "100%",
              height: 0,
              transform: "translateY(-50%)",
              zIndex: 0,
              borderTop: done
                ? "2px solid #aadb2a"
                : "2px dashed rgba(10,10,10,0.16)",
            }}
          />
        )}
        <div
          style={{
            position: "relative",
            zIndex: 1,
            width: 30,
            height: 30,
            borderRadius: "50%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            ...(done
              ? {
                  background: "#c6ff3a",
                  border: "1px solid rgba(110,150,20,0.4)",
                  boxShadow: "0 2px 6px rgba(110,150,20,0.18)",
                }
              : current
                ? {
                    background: "#fff",
                    border: "2px solid #f5c518",
                    boxShadow: "0 0 0 4px rgba(245,197,24,0.16)",
                  }
                : {
                    background: "#f1f0ea",
                    border: "1px dashed rgba(10,10,10,0.2)",
                  }),
          }}
        >
          {done ? (
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#244a00"
              strokeWidth="3.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M20 6 9 17l-5-5" />
            </svg>
          ) : current ? (
            <span
              style={{
                width: 9,
                height: 9,
                borderRadius: "50%",
                background: "#f5c518",
              }}
            />
          ) : (
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: "50%",
                background: "#c4c2b9",
              }}
            />
          )}
        </div>
      </div>

      {/* Label */}
      <div
        style={{
          fontSize: 13,
          fontWeight: 600,
          letterSpacing: -0.2,
          marginTop: 9,
          color: state === "upcoming" ? "#a8a6a0" : "#0a0a0a",
        }}
      >
        {step.label}
      </div>

      {/* Meta or terminal chips */}
      {step.terminal ? (
        <div
          style={{
            display: "flex",
            gap: 4,
            marginTop: 7,
            justifyContent: "center",
            flexWrap: "wrap",
          }}
        >
          {status === "HIRED" ? (
            <span
              style={{
                fontFamily: MONO,
                fontSize: 9,
                fontWeight: 500,
                color: "#3a5008",
                background: "rgba(198,255,58,0.3)",
                border: "1px solid rgba(110,150,20,0.28)",
                borderRadius: 5,
                padding: "2px 6px",
              }}
            >
              Contratado ✓
            </span>
          ) : status === "REJECTED" ? (
            <span
              style={{
                fontFamily: MONO,
                fontSize: 9,
                fontWeight: 500,
                color: "#7a3a28",
                background: "rgba(154,61,40,0.06)",
                border: "1px solid rgba(154,61,40,0.2)",
                borderRadius: 5,
                padding: "2px 6px",
              }}
            >
              Recusada
            </span>
          ) : status === "WITHDRAWN" ? (
            <span
              style={{
                fontFamily: MONO,
                fontSize: 9,
                fontWeight: 500,
                color: "#9a9892",
                background: "rgba(10,10,10,0.035)",
                border: "1px solid rgba(10,10,10,0.08)",
                borderRadius: 5,
                padding: "2px 6px",
              }}
            >
              Desisti
            </span>
          ) : (
            <>
              <span
                style={{
                  fontFamily: MONO,
                  fontSize: 9,
                  fontWeight: 500,
                  color: "#9a9892",
                  background: "rgba(10,10,10,0.035)",
                  border: "1px solid rgba(10,10,10,0.08)",
                  borderRadius: 5,
                  padding: "2px 6px",
                  cursor: "pointer",
                }}
                onClick={onHired}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === "Enter" && onHired?.()}
              >
                Contratado
              </span>
              <span
                style={{
                  fontFamily: MONO,
                  fontSize: 9,
                  fontWeight: 500,
                  color: "#9a9892",
                  background: "rgba(10,10,10,0.035)",
                  border: "1px solid rgba(10,10,10,0.08)",
                  borderRadius: 5,
                  padding: "2px 6px",
                  cursor: "pointer",
                }}
                onClick={onRejected}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === "Enter" && onRejected?.()}
              >
                Recusada
              </span>
              <span
                style={{
                  fontFamily: MONO,
                  fontSize: 9,
                  fontWeight: 500,
                  color: "#9a9892",
                  background: "rgba(10,10,10,0.035)",
                  border: "1px solid rgba(10,10,10,0.08)",
                  borderRadius: 5,
                  padding: "2px 6px",
                }}
              >
                Desisti
              </span>
            </>
          )}
        </div>
      ) : meta ? (
        <div
          style={{
            fontFamily: MONO,
            fontSize: 10,
            color: current ? "#7a5a04" : "#8a8a85",
            marginTop: 3,
          }}
        >
          {meta}
        </div>
      ) : null}
    </div>
  );
}

function Jornada({
  application,
  onUpdated,
  onRejected,
}: {
  application: JobApplicationDetailDto;
  onUpdated: () => void;
  onRejected: () => void;
}) {
  const subtitle = getJornadaSubtitle(application.status);

  const currentStepIdx = JORNADA_STEPS.findIndex(
    (s) => getStepState(s.key, application.status) === "current",
  );
  const activeIdx = currentStepIdx >= 0 ? currentStepIdx : JORNADA_STEPS.findLastIndex(
    (s) => getStepState(s.key, application.status) === "done",
  );
  const activeStep = activeIdx >= 0 ? JORNADA_STEPS[activeIdx] : JORNADA_STEPS[0];

  return (
    <div
      style={{
        background: "rgba(255,255,255,0.6)",
        border: "1px solid rgba(10,10,10,0.07)",
        borderRadius: 14,
        padding: "15px 26px 20px",
        marginBottom: 24,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          marginBottom: 12,
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
          JORNADA DA CANDIDATURA
        </div>
        <div
          style={{
            fontFamily: MONO,
            fontSize: 10,
            color: "#7a5a04",
            letterSpacing: 0.3,
          }}
        >
          {subtitle}
        </div>
      </div>

      {/* Mobile compact view */}
      <div className="jornada-compact" style={{ display: "none", paddingTop: 4 }}>
        {/* Progress segments */}
        <div style={{ display: "flex", gap: 3, marginBottom: 14 }}>
          {JORNADA_STEPS.map((step) => {
            const state = getStepState(step.key, application.status);
            return (
              <div
                key={step.key}
                style={{
                  flex: 1,
                  height: 4,
                  borderRadius: 999,
                  background:
                    state === "done"
                      ? "#aadb2a"
                      : state === "current"
                        ? "#c8a000"
                        : "rgba(10,10,10,0.10)",
                }}
              />
            );
          })}
        </div>
        {/* Current step info */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div>
            {currentStepIdx >= 0 && (
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 5,
                  fontFamily: MONO,
                  fontSize: 9,
                  fontWeight: 600,
                  letterSpacing: 0.8,
                  color: "#7a5a04",
                  background: "rgba(245,197,24,0.22)",
                  border: "1px solid rgba(180,140,10,0.3)",
                  borderRadius: 999,
                  padding: "2px 8px",
                  marginBottom: 6,
                }}
              >
                AGORA
              </div>
            )}
            <div
              style={{
                fontSize: 16,
                fontWeight: 600,
                color: "#0a0a0a",
                fontFamily: GEIST,
                letterSpacing: -0.3,
                lineHeight: 1.2,
              }}
            >
              {activeStep?.label ?? "—"}
            </div>
            <div
              style={{
                fontFamily: MONO,
                fontSize: 10,
                color: "#7a5a04",
                letterSpacing: 0.3,
                marginTop: 4,
              }}
            >
              {subtitle}
            </div>
          </div>
          <div
            style={{
              fontFamily: MONO,
              fontSize: 12,
              color: "#8a8a85",
              letterSpacing: 0.3,
              flexShrink: 0,
              textAlign: "right",
            }}
          >
            {activeIdx + 1}<span style={{ color: "#c0beb4" }}>/{JORNADA_STEPS.length}</span>
          </div>
        </div>
      </div>

      {/* Desktop full stepper */}
      <div className="jornada-steps-row" style={{ display: "flex", alignItems: "flex-start" }}>
        {JORNADA_STEPS.map((step, i) => {
          const state = getStepState(step.key, application.status);
          const meta = step.getMeta(application);
          const isLast = i === JORNADA_STEPS.length - 1;
          return (
            <JornadaStep
              key={step.key}
              step={step}
              state={state}
              meta={meta}
              isLast={isLast}
              status={application.status}
              onHired={onUpdated}
              onRejected={onRejected}
            />
          );
        })}
      </div>
    </div>
  );
}

// ─── Análise Row ─────────────────────────────────────────────────

function AnaliseRow({
  adaptation,
  applicationId,
  isCurrent,
  isBest,
  isSent,
  isLast,
  companyName,
  jobTitle,
  isArchived,
  onUpdated,
}: {
  adaptation: {
    id: string;
    status: string;
    isUnlocked: boolean;
    adaptedResumeId: string | null;
    createdAt: string;
    scoreBefore: number | null;
    scoreAfter: number | null;
    notes?: string | null;
    resumeUsedTitle?: string | null;
    canDownloadBaseCv?: boolean;
  };
  applicationId: string;
  isCurrent: boolean;
  isBest: boolean;
  isSent: boolean;
  isLast: boolean;
  companyName: string;
  jobTitle: string;
  isArchived?: boolean;
  onUpdated?: () => void;
}) {
  const MIN_RELEASE_LOADING_MS = 3000;
  const REDEEM_REQUEST_TIMEOUT_MS = 15_000;
  const redeemHref = `/api/cv-adaptation/${adaptation.id}/redeem-credit`;
  const redeemSessionKey = `dashboard-cv-redeemed:${redeemHref}`;

  const [downloading, setDownloading] = useState<"pdf" | "docx" | null>(null);
  const [downloadStage, setDownloadStage] =
    useState<DownloadProgressStage | null>(null);
  const [redeeming, setRedeeming] = useState(false);
  const [wasRedeemedInSession, setWasRedeemedInSession] = useState(false);
  const [hasCredits, setHasCredits] = useState<boolean | null>(null);
  const [releaseModalOpen, setReleaseModalOpen] = useState(false);
  const [releaseModalVisible, setReleaseModalVisible] = useState(false);
  const [releaseStatus, setReleaseStatus] =
    useState<CvReleaseModalStatus>("loading");
  const [releaseError, setReleaseError] = useState<string | null>(null);
  const redeemInFlightRef = useRef(false);
  const isMountedRef = useRef(true);
  const redeemAbortControllerRef = useRef<AbortController | null>(null);
  const releaseWatchdogTimeoutRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);
  const releaseCloseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  const [adjustmentsOpen, setAdjustmentsOpen] = useState(false);
  const [adjustmentsVisible, setAdjustmentsVisible] = useState(false);
  const adjustmentsCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  const canDownloadNow = adaptation.isUnlocked || wasRedeemedInSession;
  const canRedeemNow = !adaptation.isUnlocked && !wasRedeemedInSession;

  const showAdjustments =
    canDownloadNow &&
    (adaptation.scoreBefore !== null ||
      adaptation.scoreAfter !== null ||
      !!adaptation.notes);

  const openAdjustments = () => {
    setAdjustmentsOpen(true);
    requestAnimationFrame(() => setAdjustmentsVisible(true));
  };

  const closeAdjustments = () => {
    setAdjustmentsVisible(false);
    if (adjustmentsCloseTimerRef.current)
      clearTimeout(adjustmentsCloseTimerRef.current);
    adjustmentsCloseTimerRef.current = setTimeout(() => {
      if (isMountedRef.current) setAdjustmentsOpen(false);
    }, 240);
  };

  const plansHref = buildCvUnlockPlansHref({
    adaptationId: adaptation.id,
    source: "resultado-buy-credits",
    nextPath: `/candidaturas/${applicationId}`,
  });

  const cvFileName = `CV-${companyName.replace(/\s+/g, "-")}-${jobTitle.replace(/\s+/g, "-")}`;

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      redeemAbortControllerRef.current?.abort();
      if (releaseWatchdogTimeoutRef.current)
        clearTimeout(releaseWatchdogTimeoutRef.current);
      if (releaseCloseTimeoutRef.current)
        clearTimeout(releaseCloseTimeoutRef.current);
      if (adjustmentsCloseTimerRef.current)
        clearTimeout(adjustmentsCloseTimerRef.current);
    };
  }, []);

  useEffect(() => {
    try {
      if (sessionStorage.getItem(redeemSessionKey) === "1") {
        setWasRedeemedInSession(true);
      }
    } catch {
      /* no-op */
    }
  }, [redeemSessionKey]);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const res = await fetch("/api/plans/me", { cache: "no-store" });
        if (!res.ok) return;
        const plan = (await res.json()) as { creditsRemaining?: number | null };
        if (!mounted) return;
        setHasCredits(
          plan.creditsRemaining == null ? true : plan.creditsRemaining > 0,
        );
      } catch {
        if (mounted) setHasCredits(null);
      }
    };
    void load();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!releaseModalOpen || releaseStatus !== "loading") return;
    if (releaseWatchdogTimeoutRef.current)
      clearTimeout(releaseWatchdogTimeoutRef.current);
    releaseWatchdogTimeoutRef.current = setTimeout(() => {
      if (!isMountedRef.current) return;
      setReleaseStatus("error");
      setReleaseError(
        "A liberação está demorando mais do que o esperado. Tente novamente.",
      );
      setRedeeming(false);
      redeemInFlightRef.current = false;
      redeemAbortControllerRef.current?.abort();
      redeemAbortControllerRef.current = null;
    }, 20_000);
    return () => {
      if (releaseWatchdogTimeoutRef.current) {
        clearTimeout(releaseWatchdogTimeoutRef.current);
        releaseWatchdogTimeoutRef.current = null;
      }
    };
  }, [releaseModalOpen, releaseStatus]);

  const closeReleaseModal = () => {
    setReleaseModalVisible(false);
    if (releaseCloseTimeoutRef.current)
      clearTimeout(releaseCloseTimeoutRef.current);
    releaseCloseTimeoutRef.current = setTimeout(() => {
      if (!isMountedRef.current) return;
      setReleaseModalOpen(false);
      setReleaseStatus("loading");
      setReleaseError(null);
    }, 260);
  };

  const handleDownload = async (format: "pdf" | "docx") => {
    if (downloading) return;
    setDownloading(format);
    try {
      await downloadFromApi({
        url: `/api/cv-adaptation/${adaptation.id}/download?format=${format}`,
        fallbackFilename:
          format === "pdf" ? `${cvFileName}.pdf` : `${cvFileName}.docx`,
        onStageChange: setDownloadStage,
      });
    } finally {
      if (isMountedRef.current) {
        setDownloading(null);
        setDownloadStage(null);
      }
    }
  };

  const handleRedeem = async () => {
    if (redeeming || redeemInFlightRef.current) return;
    redeemInFlightRef.current = true;
    setRedeeming(true);
    const startedAt = Date.now();
    setReleaseModalOpen(true);
    requestAnimationFrame(() => setReleaseModalVisible(true));
    setReleaseStatus("loading");
    setReleaseError(null);

    redeemAbortControllerRef.current?.abort();
    const controller = new AbortController();
    redeemAbortControllerRef.current = controller;
    const timeoutId = setTimeout(
      () => controller.abort(),
      REDEEM_REQUEST_TIMEOUT_MS,
    );

    try {
      const response = await fetch(redeemHref, {
        method: "POST",
        cache: "no-store",
        signal: controller.signal,
      });
      if (!response.ok) {
        let msg = "Falha ao liberar CV";
        try {
          const body = (await response.json()) as { message?: string };
          if (typeof body.message === "string" && body.message.trim())
            msg = body.message;
        } catch {
          /* no-op */
        }
        throw new Error(msg);
      }
      const elapsed = Date.now() - startedAt;
      if (elapsed < MIN_RELEASE_LOADING_MS) {
        await new Promise((r) =>
          setTimeout(r, MIN_RELEASE_LOADING_MS - elapsed),
        );
      }
      if (!isMountedRef.current) return;
      setWasRedeemedInSession(true);
      try {
        sessionStorage.setItem(redeemSessionKey, "1");
      } catch {
        /* no-op */
      }
      onUpdated?.();
      setReleaseStatus("success");
    } catch (err) {
      if (!isMountedRef.current) return;
      const msg = (() => {
        if (err instanceof DOMException && err.name === "AbortError")
          return "A liberação demorou mais do que o esperado. Verifique sua conexão e tente novamente.";
        if (err instanceof TypeError)
          return "Não foi possível conectar ao servidor. Verifique sua internet e tente novamente.";
        if (err instanceof Error && err.message) return err.message;
        return "Não foi possível liberar o CV agora. Tente novamente.";
      })();
      setReleaseStatus("error");
      setReleaseError(msg);
    } finally {
      clearTimeout(timeoutId);
      if (redeemAbortControllerRef.current === controller)
        redeemAbortControllerRef.current = null;
      if (isMountedRef.current) setRedeeming(false);
      redeemInFlightRef.current = false;
    }
  };

  const score = adaptation.scoreAfter ?? null;
  const scoreBefore = adaptation.scoreBefore ?? null;
  const scoreColor = score !== null ? getDashboardScoreColor(score) : "#2a6a10";
  const delta =
    score !== null && scoreBefore !== null ? score - scoreBefore : null;

  return (
    <div
      style={{
        padding: "16px 0",
        borderBottom: isLast ? "none" : "1px dashed rgba(10,10,10,0.09)",
        ...(isBest
          ? {
              background:
                "linear-gradient(90deg, rgba(198,255,58,0.10) 0%, rgba(198,255,58,0) 60%)",
              margin: "0 -18px",
              padding: "16px 18px",
              borderRadius: 8,
              borderLeft: "2px solid #aadb2a",
              borderBottom: isLast ? "none" : "1px dashed rgba(10,10,10,0.09)",
            }
          : {}),
      }}
    >
      {/* Top row: info + score */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 18,
          marginBottom: 12,
        }}
      >
        <div style={{ minWidth: 0, flex: 1 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 9,
              flexWrap: "wrap",
              marginBottom: 5,
            }}
          >
            <span
              style={{
                fontSize: 14.5,
                fontWeight: 600,
                color: "#0a0a0a",
                letterSpacing: -0.2,
              }}
            >
              {jobTitle} · {companyName}
            </span>
            {isSent && (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  fontFamily: MONO,
                  fontSize: 8.5,
                  fontWeight: 600,
                  letterSpacing: 0.6,
                  color: "#244a00",
                  background: "rgba(198,255,58,0.6)",
                  border: "1px solid rgba(110,150,20,0.4)",
                  borderRadius: 4,
                  padding: "2px 7px",
                }}
              >
                <svg
                  width="9"
                  height="9"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <rect x="3" y="11" width="18" height="10" rx="2" />
                  <path d="M7 11V8a5 5 0 0 1 10 0v3" />
                </svg>
                CV ENVIADO
              </span>
            )}
            {!isSent && isBest && (
              <span
                style={{
                  fontFamily: MONO,
                  fontSize: 8.5,
                  fontWeight: 600,
                  letterSpacing: 0.6,
                  color: "#3a5008",
                  background: "rgba(198,255,58,0.45)",
                  border: "1px solid rgba(110,150,20,0.28)",
                  borderRadius: 4,
                  padding: "2px 6px",
                }}
              >
                MELHOR SCORE
              </span>
            )}
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              flexWrap: "wrap",
              fontSize: 11.5,
              color: "#8a8a85",
            }}
          >
            <span>
              {new Date(adaptation.createdAt).toLocaleDateString("pt-BR", {
                day: "2-digit",
                month: "short",
                year: "numeric",
              })}
            </span>
            <span style={{ color: "#c8c6bd" }}>·</span>
            <span
              style={{
                fontFamily: MONO,
                fontSize: 11,
                color: "#b0aea6",
                letterSpacing: 0.3,
              }}
            >
              ID: {adaptation.id}
            </span>
          </div>
        </div>

        {/* Score box */}
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          {score !== null && (
            <>
              <div
                style={{
                  fontSize: 25,
                  fontWeight: 600,
                  letterSpacing: -1,
                  lineHeight: 1,
                  color: scoreColor,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {score}
                <span style={{ fontSize: 14, marginLeft: 1, fontWeight: 500 }}>
                  %
                </span>
              </div>
              {delta !== null && (
                <div
                  style={{
                    fontFamily: MONO,
                    fontSize: 10,
                    color: "#5a8a2a",
                    marginTop: 3,
                  }}
                >
                  +{delta}% após ajustes
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Action buttons */}
      <div
        className="analise-row-actions"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 7,
          flexWrap: "wrap",
        }}
      >
        <div
          className="analise-row-btns"
          style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}
        >
          {/* Grupo A: ver / interagir / liberar */}
          <div className="analise-btns-group-a" style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
            <a
              href={`/adaptar/resultado?adaptationId=${adaptation.id}`}
              style={{ display: "inline-flex", alignItems: "center", gap: 5, background: "rgba(255,255,255,0.9)", color: "#3a3a36", border: "1px solid rgba(10,10,10,0.12)", borderRadius: 7, padding: "6px 10px", fontSize: 12, fontWeight: 500, textDecoration: "none", fontFamily: GEIST }}
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
              Rever análise
            </a>

            {!isArchived && canDownloadNow && (
              <a
                href={`/adaptacao-cv/${adaptation.id}`}
                style={{ display: "inline-flex", alignItems: "center", gap: 5, background: "rgba(255,255,255,0.9)", color: "#3a3a36", border: "1px solid rgba(10,10,10,0.12)", borderRadius: 7, padding: "6px 10px", fontSize: 12, fontWeight: 500, textDecoration: "none", fontFamily: GEIST }}
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" />
                </svg>
                Adaptação
              </a>
            )}

            {!isArchived && canRedeemNow && (
              hasCredits === false ? (
                <a href={plansHref} style={{ display: "inline-flex", alignItems: "center", gap: 5, background: "rgba(255,255,255,0.7)", color: "#3a3a36", border: "1px solid rgba(10,10,10,0.12)", borderRadius: 7, padding: "6px 10px", fontSize: 12, fontWeight: 600, textDecoration: "none", fontFamily: GEIST }}>
                  Liberar CV · 1 Crédito
                </a>
              ) : (
                <button type="button" onClick={() => void handleRedeem()} disabled={redeeming} style={{ display: "inline-flex", alignItems: "center", gap: 5, background: "rgba(255,255,255,0.7)", color: "#3a3a36", border: "1px solid rgba(10,10,10,0.12)", borderRadius: 7, padding: "6px 10px", fontSize: 12, fontWeight: 600, cursor: redeeming ? "not-allowed" : "pointer", fontFamily: GEIST }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <rect x="4" y="11" width="16" height="10" rx="2" />
                    <path d="M8 11V8a4 4 0 1 1 8 0" />
                  </svg>
                  {redeeming ? "Liberando..." : "Liberar CV · 1 Crédito"}
                </button>
              )
            )}

            {!isArchived && showAdjustments && (
              <button data-testid={`analysis-adjustments-${adaptation.id}`} type="button" onClick={openAdjustments} style={{ display: "inline-flex", alignItems: "center", gap: 5, background: "rgba(255,255,255,0.7)", color: "#3a3a36", border: "1px solid rgba(10,10,10,0.12)", borderRadius: 7, padding: "6px 10px", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: GEIST }}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
                Ajustes feitos
              </button>
            )}
          </div>

          {/* Grupo B: downloads */}
          {!isArchived && canDownloadNow && (
            <div className="analise-btns-group-b" style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
              <button type="button" onClick={() => void handleDownload("pdf")} disabled={downloading !== null} style={{ display: "inline-flex", alignItems: "center", gap: 5, background: "rgba(255,255,255,0.9)", color: "#3a3a36", border: "1px solid rgba(10,10,10,0.12)", borderRadius: 7, padding: "6px 10px", fontSize: 12, fontWeight: 500, cursor: downloading ? "not-allowed" : "pointer", fontFamily: GEIST }}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M5 21h14" />
                </svg>
                PDF
              </button>
              <button type="button" onClick={() => void handleDownload("docx")} disabled={downloading !== null} style={{ display: "inline-flex", alignItems: "center", gap: 5, background: "rgba(255,255,255,0.9)", color: "#3a3a36", border: "1px solid rgba(10,10,10,0.12)", borderRadius: 7, padding: "6px 10px", fontSize: 12, fontWeight: 500, cursor: downloading ? "not-allowed" : "pointer", fontFamily: GEIST }}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M5 21h14" />
                </svg>
                DOCX
              </button>
            </div>
          )}

          <a href={`/api/cv-adaptation/${adaptation.id}/base-cv`} download className="analise-btn-base-cv" style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "rgba(255,255,255,0.9)", color: "#6a6560", border: "1px solid rgba(10,10,10,0.12)", borderRadius: 7, padding: "6px 10px", fontSize: 12, fontWeight: 500, textDecoration: "none", fontFamily: GEIST, marginLeft: "auto" }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M5 21h14" />
            </svg>
            CV usado na análise
          </a>
        </div>
      </div>
      <DownloadProgressOverlay
        open={downloadStage !== null}
        stage={downloadStage}
        format={downloading}
      />
      <CvReleaseModal
        open={releaseModalOpen}
        visible={releaseModalVisible}
        status={releaseStatus}
        message={releaseError}
        canClose={releaseStatus !== "loading"}
        onClose={closeReleaseModal}
        onDownloadPdf={() => void handleDownload("pdf")}
        onDownloadDocx={() => void handleDownload("docx")}
        downloading={downloading}
        canDownload={releaseStatus === "success"}
      />
      {adjustmentsOpen && (
        <div
          onClick={closeAdjustments}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 120,
            background: "rgba(10,10,10,0.5)",
            padding: "16px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            overflowY: "auto",
            transition: "opacity 240ms ease-out",
            opacity: adjustmentsVisible ? 1 : 0,
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "relative",
              width: "100%",
              maxWidth: 560,
              maxHeight: "calc(100dvh - 32px)",
              overflowY: "auto",
              background: "#fafaf6",
              border: "1px solid rgba(10,10,10,0.08)",
              borderRadius: 18,
              padding: "20px 24px",
              fontFamily: GEIST,
              boxShadow: "0 24px 60px -20px rgba(10,10,10,0.4)",
              transition: "opacity 240ms ease-out, transform 240ms ease-out",
              opacity: adjustmentsVisible ? 1 : 0,
              transform: adjustmentsVisible
                ? "translateY(0) scale(1)"
                : "translateY(8px) scale(0.98)",
            }}
          >
            {/* Header */}
            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "space-between",
                gap: 12,
                marginBottom: 16,
              }}
            >
              <div>
                <h3
                  style={{
                    fontSize: 18,
                    fontWeight: 500,
                    letterSpacing: "-0.4px",
                    color: "#0a0a0a",
                    margin: "0 0 4px",
                  }}
                >
                  Ajustes feitos
                </h3>
                <p style={{ fontSize: 13.5, color: "#6a6560", margin: 0 }}>
                  Resumo do que foi aplicado no seu CV para esta vaga.
                </p>
              </div>
              <button
                type="button"
                onClick={closeAdjustments}
                aria-label="Fechar"
                style={{
                  background: "rgba(10,10,10,0.05)",
                  border: "none",
                  borderRadius: 8,
                  width: 32,
                  height: 32,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "#6a6560",
                  fontSize: 18,
                  flexShrink: 0,
                }}
              >
                ×
              </button>
            </div>

            {/* Context */}
            <div
              style={{
                background: "#f0efe9",
                border: "1px solid rgba(10,10,10,0.06)",
                borderRadius: 10,
                padding: "10px 12px",
                marginBottom: 12,
                display: "flex",
                flexDirection: "column",
                gap: 5,
              }}
            >
              <p
                style={{
                  fontFamily: MONO,
                  fontSize: 10,
                  fontWeight: 500,
                  letterSpacing: 1,
                  textTransform: "uppercase",
                  color: "#8a8a85",
                  margin: 0,
                }}
              >
                Contexto da análise
              </p>
              <p style={{ fontSize: 13, color: "#0a0a0a", margin: 0 }}>
                <span style={{ fontWeight: 500 }}>Vaga:</span> {jobTitle} ·{" "}
                {companyName}
              </p>
              <p style={{ fontSize: 13, color: "#0a0a0a", margin: 0 }}>
                <span style={{ fontWeight: 500 }}>CV usado na análise:</span>{" "}
                {adaptation.resumeUsedTitle ?? "Não identificado"}
              </p>
            </div>

            {/* Scores */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                marginBottom: 14,
              }}
            >
              <div
                style={{
                  flex: 1,
                  background: "#fff",
                  border: "1px solid rgba(10,10,10,0.08)",
                  borderRadius: 10,
                  padding: "14px 16px",
                  textAlign: "center",
                }}
              >
                <p
                  style={{
                    fontFamily: MONO,
                    fontSize: 9.5,
                    fontWeight: 500,
                    letterSpacing: 1,
                    textTransform: "uppercase",
                    color: "#8a8a85",
                    margin: "0 0 6px",
                  }}
                >
                  Score antes
                </p>
                <p
                  style={{
                    fontSize: 36,
                    fontWeight: 500,
                    letterSpacing: "-1.4px",
                    margin: 0,
                    color: "#0a0a0a",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {adaptation.scoreBefore !== null
                    ? `${adaptation.scoreBefore}%`
                    : "—"}
                </p>
              </div>
              <span style={{ fontSize: 20, color: "#c0beb4", flexShrink: 0 }}>
                →
              </span>
              <div
                style={{
                  flex: 1,
                  background: "rgba(198,255,58,0.2)",
                  border: "1px solid rgba(110,150,20,0.2)",
                  borderRadius: 10,
                  padding: "14px 16px",
                  textAlign: "center",
                }}
              >
                <p
                  style={{
                    fontFamily: MONO,
                    fontSize: 9.5,
                    fontWeight: 500,
                    letterSpacing: 1,
                    textTransform: "uppercase",
                    color: score !== null ? scoreColor : "#405410",
                    margin: "0 0 6px",
                  }}
                >
                  Score após ajustes
                </p>
                <p
                  style={{
                    fontSize: 36,
                    fontWeight: 500,
                    letterSpacing: "-1.4px",
                    margin: 0,
                    color: score !== null ? scoreColor : "#405410",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {adaptation.scoreAfter !== null
                    ? `${adaptation.scoreAfter}%`
                    : "—"}
                </p>
              </div>
            </div>

            {/* Notes */}
            <div
              style={{
                borderLeft: "3px solid #c6ff3a",
                paddingLeft: 12,
                marginBottom: 20,
                display: "flex",
                flexDirection: "column",
                gap: 6,
              }}
            >
              <p
                style={{
                  fontFamily: MONO,
                  fontSize: 10.5,
                  fontWeight: 500,
                  letterSpacing: 1,
                  textTransform: "uppercase",
                  color: "#405410",
                  margin: 0,
                }}
              >
                O que foi feito no seu CV
              </p>
              <p
                style={{
                  fontSize: 13.5,
                  color: "#45443e",
                  lineHeight: 1.6,
                  margin: 0,
                  whiteSpace: "pre-line",
                }}
              >
                {adaptation.notes ??
                  "Nesta análise, o score e os ajustes aplicados foram registrados sem texto descritivo adicional."}
              </p>
            </div>

            {/* Actions */}
            <div
              style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}
            >
              <button
                type="button"
                onClick={closeAdjustments}
                style={{
                  background: "#fafaf6",
                  color: "#0a0a0a",
                  border: "1px solid #d8d6ce",
                  borderRadius: 10,
                  padding: "10px 16px",
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: "pointer",
                  fontFamily: GEIST,
                }}
              >
                Fechar
              </button>
              <a
                href={`/adaptar/resultado?adaptationId=${adaptation.id}`}
                style={{
                  background: "#fff",
                  color: "#0a0a0a",
                  border: "1.5px solid rgba(10,10,10,0.70)",
                  borderRadius: 10,
                  padding: "10px 16px",
                  fontSize: 13,
                  fontWeight: 500,
                  textDecoration: "none",
                  display: "inline-flex",
                  alignItems: "center",
                  fontFamily: GEIST,
                }}
              >
                Ver análise completa →
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function AnalisesSection({
  application,
  isArchived,
  onUpdated,
}: {
  application: JobApplicationDetailDto;
  isArchived?: boolean;
  onUpdated: () => void;
}) {
  const adaptations = application.cvAdaptations;

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          marginBottom: 6,
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
          ANÁLISES DESTA CANDIDATURA
        </div>
        <div style={{ fontFamily: MONO, fontSize: 10, color: "#a8a6a0" }}>
          {adaptations.length}{" "}
          {adaptations.length === 1 ? "análise" : "análises"} · mesma vaga
        </div>
      </div>

      <div
        style={{
          background: "rgba(255,255,255,0.55)",
          border: "1px solid rgba(10,10,10,0.07)",
          borderRadius: 12,
          padding: "2px 18px",
        }}
      >
        {adaptations.length === 0 ? (
          <div
            style={{
              padding: "24px 0",
              textAlign: "center",
              color: "#8a8a85",
              fontSize: 13,
              fontFamily: GEIST,
            }}
          >
            Nenhuma análise registrada ainda.
          </div>
        ) : (
          (() => {
            const sorted = [...adaptations].sort((a, b) => {
              const aIsSent =
                a.id === application.currentCvAdaptationId &&
                application.appliedAt !== null;
              const bIsSent =
                b.id === application.currentCvAdaptationId &&
                application.appliedAt !== null;
              if (aIsSent !== bIsSent) return aIsSent ? -1 : 1;
              const aScore = a.scoreAfter ?? -1;
              const bScore = b.scoreAfter ?? -1;
              return bScore - aScore;
            });
            const maxScore = Math.max(...sorted.map((a) => a.scoreAfter ?? -1));
            const bestId =
              maxScore >= 0
                ? (sorted.find((a) => (a.scoreAfter ?? -1) === maxScore)?.id ??
                  null)
                : null;
            return sorted.map((a, idx, arr) => {
              const isCurrent = a.id === application.currentCvAdaptationId;
              const isBest = bestId !== null && a.id === bestId;
              const isSent =
                a.id === application.currentCvAdaptationId &&
                application.appliedAt !== null;
              const isLast = idx === arr.length - 1;
              return (
                <AnaliseRow
                  key={a.id}
                  adaptation={a}
                  applicationId={application.id}
                  isCurrent={isCurrent}
                  isBest={isBest}
                  isSent={isSent}
                  isLast={isLast}
                  companyName={application.companyName}
                  jobTitle={application.jobTitle}
                  isArchived={isArchived}
                  onUpdated={onUpdated}
                />
              );
            });
          })()
        )}

        {/* Nova análise button */}
        {!isArchived && <button
          type="button"
          onClick={() => {
            if (application.jobDescriptionText) {
              sessionStorage.setItem(
                "adaptar_prefill_job_description",
                application.jobDescriptionText,
              );
            }
            sessionStorage.setItem(
              "adaptar_prefill_application_id",
              application.id,
            );
            window.location.href = "/adaptar";
          }}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 7,
            width: "100%",
            padding: "15px 0 13px",
            border: "none",
            background: "transparent",
            color: "#3a5008",
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
            fontFamily: GEIST,
            textDecoration: "none",
            boxSizing: "border-box",
          }}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M12 5v14M5 12h14" />
          </svg>
          Fazer nova análise desta vaga
        </button>}
      </div>
    </div>
  );
}

// ─── Notes ───────────────────────────────────────────────────────

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
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          marginBottom: 6,
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
          NOTAS
        </div>
        {editing ? (
          <button
            type="button"
            onClick={() => {
              setEditing(false);
              setNote(currentNotes ?? "");
              setError(null);
            }}
            style={{
              fontFamily: MONO,
              fontSize: 10,
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
              fontSize: 10,
              color: "#3a5008",
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: 0,
            }}
          >
            {currentNotes ? "Editar nota" : "+ Adicionar"}
          </button>
        )}
      </div>

      <div
        style={{
          background: "rgba(255,255,255,0.55)",
          border: "1px solid rgba(10,10,10,0.07)",
          borderRadius: 12,
          padding: "4px 18px",
        }}
      >
        {editing ? (
          <div style={{ padding: "14px 0" }}>
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
              rows={3}
              style={{
                ...inputStyle,
                resize: "none",
                minHeight: 72,
                lineHeight: 1.55,
                marginBottom: 8,
              }}
            />
            {error && (
              <p
                style={{
                  margin: "0 0 8px",
                  fontSize: 12,
                  color: "#991b1b",
                  background: "#fee2e2",
                  padding: "6px 10px",
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
                  padding: "7px 14px",
                  borderRadius: 8,
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
            <div style={{ padding: "12px 0" }}>
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
                  {new Date(lastNoteEvent.createdAt).toLocaleDateString(
                    "pt-BR",
                    {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    },
                  )}
                </div>
              )}
              <div
                style={{
                  fontSize: 12.5,
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
              padding: "14px 0",
              fontSize: 12.5,
              color: "#8a8a85",
              fontFamily: GEIST,
              lineHeight: 1.5,
            }}
          >
            Nenhuma nota adicionada ainda.
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Timeline (registro de eventos) ──────────────────────────────

type AdaptationSummary = JobApplicationDetailDto["cvAdaptations"][number];

type TimelineItem =
  | { kind: "event"; event: JobApplicationEvent }
  | {
      kind: "analysis";
      id: string;
      createdAt: string;
      scoreBefore: number | null;
      scoreAfter: number | null;
    };

function Timeline({
  events,
  scoreBefore,
  scoreAfter,
  cvAdaptations,
}: {
  events: JobApplicationEvent[];
  scoreBefore: number | null;
  scoreAfter: number | null;
  cvAdaptations: AdaptationSummary[];
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const displayItems: TimelineItem[] = [
    ...events
      .filter((e) => e.eventType !== "ANALYSIS_COMPLETED")
      .map((e): TimelineItem => ({ kind: "event", event: e })),
    ...cvAdaptations.map(
      (a): TimelineItem => ({
        kind: "analysis",
        id: a.id,
        createdAt: a.createdAt,
        scoreBefore: a.scoreBefore,
        scoreAfter: a.scoreAfter,
      }),
    ),
  ].sort(
    (a, b) =>
      new Date(b.kind === "event" ? b.event.createdAt : b.createdAt).getTime() -
      new Date(a.kind === "event" ? a.event.createdAt : a.createdAt).getTime(),
  );

  if (displayItems.length === 0) return null;

  const shouldClamp = displayItems.length > 5;

  const scrollTimeline = (direction: "up" | "down") => {
    const node = scrollRef.current;
    if (!node) return;

    node.scrollBy({
      top: direction === "down" ? 180 : -180,
      behavior: "smooth",
    });
  };

  function getItemBody(item: TimelineItem): React.ReactNode {
    if (item.kind === "analysis") {
      return item.scoreBefore !== null ? (
        <>
          Análise concluída. Score inicial <strong>{item.scoreBefore}%</strong>.
        </>
      ) : (
        "Análise da vaga concluída."
      );
    }

    const event = item.event;
    switch (event.eventType) {
      case "APPLICATION_CREATED": {
        const origin = event.metadata?.origin;
        return origin === "manual" || origin === "imported_url"
          ? "Candidatura criada manualmente."
          : "Candidatura criada automaticamente.";
      }
      case "CV_READY":
        if (scoreAfter !== null && scoreBefore !== null) {
          return (
            <>
              CV adaptado gerado. Score subiu para{" "}
              <strong>{scoreAfter}%</strong> (+{scoreAfter - scoreBefore}{" "}
              pontos).
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
      case "STATUS_CHANGED": {
        if (!event.newStatus) return "Status atualizado.";
        const label = getStatusConfig(event.newStatus).label;
        const ititle =
          typeof event.metadata?.interviewTitle === "string"
            ? event.metadata.interviewTitle
            : null;
        return (
          <>
            Status atualizado para <strong>{label}</strong>
            {ititle ? (
              <>
                {" "}
                — <em>{ititle}</em>
              </>
            ) : null}
            .
          </>
        );
      }
      case "MARKED_AS_SENT":
        return "Você se candidatou.";
      case "NOTE_ADDED":
        return "Nota adicionada.";
      case "INTERVIEW_PREP_GENERATED":
        return "Preparação para entrevista gerada com IA.";
      default:
        return event.eventType;
    }
  }

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          marginBottom: 6,
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
          REGISTRO DE EVENTOS
        </div>
        <span style={{ fontFamily: MONO, fontSize: 10, color: "#a8a6a0" }}>
          {displayItems.length}{" "}
          {displayItems.length === 1 ? "evento" : "eventos"}
        </span>
      </div>

      <div
        style={{
          background: "rgba(255,255,255,0.55)",
          border: "1px solid rgba(10,10,10,0.07)",
          borderRadius: 12,
          padding: "16px 16px",
        }}
      >
        {shouldClamp && (
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: 8,
              marginBottom: 12,
            }}
          >
            <button
              type="button"
              aria-label="Subir eventos"
              onClick={() => scrollTimeline("up")}
              style={{
                width: 28,
                height: 28,
                borderRadius: 999,
                border: "1px solid rgba(10,10,10,0.12)",
                background: "rgba(255,255,255,0.92)",
                color: "#3a3a36",
                cursor: "pointer",
                fontSize: 12,
                fontFamily: GEIST,
              }}
            >
              ↑
            </button>
            <button
              type="button"
              aria-label="Descer eventos"
              onClick={() => scrollTimeline("down")}
              style={{
                width: 28,
                height: 28,
                borderRadius: 999,
                border: "1px solid rgba(10,10,10,0.12)",
                background: "rgba(255,255,255,0.92)",
                color: "#3a3a36",
                cursor: "pointer",
                fontSize: 12,
                fontFamily: GEIST,
              }}
            >
              ↓
            </button>
          </div>
        )}

        <div
          ref={scrollRef}
          className={shouldClamp ? "timeline-scroll" : undefined}
          style={{
            display: "flex",
            flexDirection: "column",
            maxHeight: shouldClamp ? 344 : undefined,
            overflowY: shouldClamp ? "auto" : undefined,
            scrollbarWidth: "none",
            msOverflowStyle: "none",
          }}
        >
          {displayItems.map((item, idx) => {
            const isLast = idx === displayItems.length - 1;
            const isAccent =
              item.kind === "analysis" ||
              (item.kind === "event" && item.event.eventType === "CV_READY");
            const itemKey =
              item.kind === "event" ? item.event.id : `analysis-${item.id}`;
            const itemDate =
              item.kind === "event" ? item.event.createdAt : item.createdAt;
            const itemLabel =
              item.kind === "event"
                ? item.event.eventType.toLowerCase().replace(/_/g, ".")
                : "analysis.completed";
            return (
              <div
                key={itemKey}
                style={{
                  display: "grid",
                  gridTemplateColumns: "90px 16px 1fr",
                  gap: 10,
                  alignItems: "flex-start",
                  paddingBottom: isLast ? 0 : 12,
                  position: "relative",
                }}
              >
                <div
                  style={{
                    fontFamily: MONO,
                    fontSize: 10,
                    color: "#8a8a85",
                    letterSpacing: 0.3,
                    paddingTop: 1,
                  }}
                >
                  {new Date(itemDate).toLocaleDateString("pt-BR", {
                    day: "2-digit",
                    month: "short",
                  })}
                </div>

                <div style={{ position: "relative", alignSelf: "stretch" }}>
                  {!isLast && (
                    <div
                      style={{
                        position: "absolute",
                        left: 6,
                        top: 14,
                        bottom: -12,
                        width: 1,
                        background: "rgba(10,10,10,0.08)",
                      }}
                    />
                  )}
                  <div
                    style={{
                      position: "relative",
                      width: 13,
                      height: 13,
                      borderRadius: "50%",
                      background: isAccent ? "#c6ff3a" : "#fff",
                      border: isAccent
                        ? "1px solid rgba(110,150,20,0.4)"
                        : "1px solid rgba(10,10,10,0.18)",
                      boxShadow: isAccent
                        ? "0 0 0 3px rgba(198,255,58,0.18)"
                        : "0 0 0 2px rgba(255,255,255,0.55)",
                    }}
                  />
                </div>

                <div style={{ flex: 1 }}>
                  <p
                    style={{
                      margin: 0,
                      fontSize: 12.5,
                      color: "#0a0a0a",
                      lineHeight: 1.5,
                      marginBottom: 2,
                      fontFamily: GEIST,
                    }}
                  >
                    {getItemBody(item)}
                  </p>
                  <span
                    style={{
                      fontFamily: MONO,
                      fontSize: 9.5,
                      letterSpacing: 0.5,
                      color: "#8a8a85",
                    }}
                  >
                    {itemLabel}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── CV card (sidebar) ────────────────────────────────────────────

function CvCard({ application }: { application: JobApplicationDetailDto }) {
  const latest = application.cvAdaptations[0] ?? null;
  const isSent = application.appliedAt !== null;
  const cvName = `CV-${application.companyName.replace(/\s+/g, "-")}-${application.jobTitle.replace(/\s+/g, "-")}.pdf`;
  const [downloading, setDownloading] = useState<"pdf" | "docx" | null>(null);
  const [downloadStage, setDownloadStage] =
    useState<DownloadProgressStage | null>(null);

  if (!latest) return null;

  const isUnlocked = latest.isUnlocked;

  const handleDownload = async (format: "pdf" | "docx") => {
    if (downloading) return;
    setDownloading(format);
    setDownloadStage("preparing");
    try {
      await downloadFromApi({
        url: `/api/cv-adaptation/${latest.id}/download?format=${format}`,
        fallbackFilename: cvName.replace(
          /\.pdf$/i,
          format === "pdf" ? ".pdf" : ".docx",
        ),
        onStageChange: setDownloadStage,
      });
    } finally {
      setDownloading(null);
      setDownloadStage(null);
    }
  };

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          marginBottom: 6,
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
          {isSent ? "CV ENVIADO" : "CV ADAPTADO"}
        </div>
        {isSent && (
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              fontFamily: MONO,
              fontSize: 10,
              color: "#3a5008",
              letterSpacing: 0.3,
            }}
          >
            <svg
              width="9"
              height="9"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <rect x="3" y="11" width="18" height="10" rx="2" />
              <path d="M7 11V8a5 5 0 0 1 10 0v3" />
            </svg>
            cravado
          </div>
        )}
      </div>

      <div
        style={{
          background: isSent
            ? "linear-gradient(180deg, rgba(198,255,58,0.10) 0%, rgba(255,255,255,0.55) 70%)"
            : "rgba(255,255,255,0.55)",
          border: isSent
            ? "1px solid rgba(110,150,20,0.28)"
            : "1px solid rgba(10,10,10,0.07)",
          borderRadius: 12,
          padding: "14px 16px",
        }}
      >
        {/* File preview */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 11,
            marginBottom: 11,
            background: "#fff",
            border: "1px solid rgba(10,10,10,0.06)",
            borderRadius: 9,
            padding: "9px 11px",
          }}
        >
          <div
            style={{
              width: 32,
              height: 40,
              background: "#0a0a0a",
              color: "#c6ff3a",
              borderRadius: 4,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: MONO,
              fontSize: 9.5,
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
                fontSize: 12,
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
                fontSize: 9.5,
                color: "#8a8a85",
                marginTop: 2,
              }}
            >
              {new Date(latest.createdAt).toLocaleDateString("pt-BR", {
                day: "2-digit",
                month: "short",
              })}
              {application.scoreAfter !== null &&
                ` · score ${application.scoreAfter}%`}
            </div>
          </div>
        </div>

        {isSent && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontSize: 11,
              color: "#3a5008",
              lineHeight: 1.4,
              marginBottom: 11,
              fontFamily: GEIST,
            }}
          >
            <svg
              width="9"
              height="9"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <rect x="3" y="11" width="18" height="10" rx="2" />
              <path d="M7 11V8a5 5 0 0 1 10 0v3" />
            </svg>
            Cravado no envio ·{" "}
            {application.appliedAt &&
              new Date(application.appliedAt).toLocaleDateString("pt-BR", {
                day: "2-digit",
                month: "short",
              })}{" "}
            · não muda mais.
          </div>
        )}

        {isUnlocked ? (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 8,
            }}
          >
            <button
              type="button"
              onClick={() => void handleDownload("pdf")}
              disabled={downloading !== null}
              style={{
                background: "#fff",
                color: "#0a0a0a",
                border: "1px solid rgba(10,10,10,0.13)",
                borderRadius: 7,
                padding: "7px 10px",
                fontSize: 11.5,
                fontWeight: 500,
                cursor: downloading ? "not-allowed" : "pointer",
                fontFamily: GEIST,
              }}
            >
              Baixar PDF
            </button>
            <button
              type="button"
              onClick={() => void handleDownload("docx")}
              disabled={downloading !== null}
              style={{
                background: "#fff",
                color: "#0a0a0a",
                border: "1px solid rgba(10,10,10,0.13)",
                borderRadius: 7,
                padding: "7px 10px",
                fontSize: 11.5,
                fontWeight: 500,
                cursor: downloading ? "not-allowed" : "pointer",
                fontFamily: GEIST,
              }}
            >
              Baixar DOCX
            </button>
          </div>
        ) : (
          <Link
            href={buildCvUnlockPlansHref({
              adaptationId: latest.id,
              source: "candidatura-cv-unlock",
              nextPath: `/candidaturas/${application.id}`,
            })}
            style={{
              display: "block",
              textAlign: "center",
              padding: "8px 12px",
              borderRadius: 7,
              border: "1px solid rgba(10,10,10,0.12)",
              background: "#fff",
              color: "#0a0a0a",
              fontSize: 12,
              fontWeight: 500,
              textDecoration: "none",
              fontFamily: GEIST,
            }}
          >
            Liberar CV
          </Link>
        )}
        <DownloadProgressOverlay
          open={downloadStage !== null}
          stage={downloadStage}
          format={downloading}
        />
      </div>
    </div>
  );
}

// ─── Detalhes card ────────────────────────────────────────────────

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
                  fontSize: 10.5,
                  color: "#0a0a0a",
                  textDecoration: "underline",
                  textUnderlineOffset: 2,
                  wordBreak: "break-all" as const,
                }}
              >
                {application.jobUrl.replace(/^https?:\/\//, "").slice(0, 32)}
              </a>
            ),
          },
        ]
      : []),
    {
      k: "Origem",
      v: (
        <span style={{ fontFamily: MONO, fontSize: 10.5, color: "#5a5a55" }}>
          {origin}
        </span>
      ),
    },
    {
      k: "Criada",
      v: new Date(application.createdAt).toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      }),
    },
    ...(application.appliedAt
      ? [
          {
            k: "Enviada",
            v: new Date(application.appliedAt).toLocaleDateString("pt-BR", {
              day: "2-digit",
              month: "short",
              year: "numeric",
            }),
          },
        ]
      : []),
    ...(application.nextActionAt
      ? [
          {
            k: "Entrevista",
            v: (
              <strong style={{ color: "#0a0a0a" }}>
                {new Date(application.nextActionAt).toLocaleDateString(
                  "pt-BR",
                  { day: "2-digit", month: "short" },
                )}{" "}
                ·{" "}
                {new Date(application.nextActionAt).toLocaleTimeString(
                  "pt-BR",
                  { hour: "2-digit", minute: "2-digit" },
                )}
              </strong>
            ),
          },
        ]
      : []),
  ];

  return (
    <div>
      <div
        style={{
          fontFamily: MONO,
          fontSize: 10,
          letterSpacing: 1.2,
          color: "#8a8a85",
          fontWeight: 500,
          marginBottom: 6,
        }}
      >
        DETALHES
      </div>
      <div
        style={{
          background: "rgba(255,255,255,0.55)",
          border: "1px solid rgba(10,10,10,0.07)",
          borderRadius: 12,
          padding: "4px 16px",
        }}
      >
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
                fontSize: 9.5,
                color: "#8a8a85",
                letterSpacing: 0.4,
                flexShrink: 0,
              }}
            >
              {row.k}
            </span>
            <span
              style={{
                fontSize: 12,
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

// ─── Hired celebration modal ──────────────────────────────────────

function HiredConfetti({ active }: { active: boolean }) {
  const pieces = useMemo(() => {
    const arr = [];
    const rand = (seed: number) => {
      const x = Math.sin(seed * 9999) * 10000;
      return x - Math.floor(x);
    };
    for (let i = 0; i < 40; i++) {
      const r1 = rand(i + 1);
      const r2 = rand(i + 31);
      const r3 = rand(i + 71);
      const r4 = rand(i + 113);
      arr.push({
        i,
        left: 8 + r1 * 84,
        dx: (r2 - 0.5) * 260,
        rot: 200 + r3 * 720,
        dur: 1.8 + r4 * 1.4,
        delay: r1 * 0.45,
        size: 6 + r2 * 8,
        color: (
          ["#c6ff3a", "#0a0a0a", "#f5c518", "#fafaf6", "#c6ff3a"] as const
        )[Math.floor(r3 * 5)],
        shape: r4 > 0.5 ? "rect" : "circle",
      });
    }
    return arr;
  }, []);

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        overflow: "hidden",
        zIndex: 0,
        borderRadius: 20,
      }}
    >
      {pieces.map((p) => (
        <span
          key={p.i}
          style={{
            position: "absolute",
            left: `${p.left}%`,
            top: "18%",
            width: p.size,
            height: p.shape === "circle" ? p.size : p.size * 0.5,
            background: p.color,
            borderRadius: p.shape === "circle" ? "50%" : 2,
            opacity: 0,
            // @ts-expect-error CSS custom properties
            "--dx": `${p.dx}px`,
            "--rot": `${p.rot}deg`,
            animation: active
              ? `cv-fall-loop 5s cubic-bezier(0.22,0.61,0.36,1) ${p.delay}s infinite`
              : "none",
            boxShadow:
              p.color === "#c6ff3a" ? "0 0 8px rgba(198,255,58,0.4)" : "none",
          }}
        />
      ))}
    </div>
  );
}

function HiredCelebrationModal({
  applicationId,
  companyName,
  jobTitle,
  onClose,
  onUpdated,
}: {
  applicationId: string;
  companyName: string;
  jobTitle: string;
  onClose: () => void;
  onUpdated: () => void;
}) {
  const { visible: mounted, close } = useModalFade(onClose);
  const [pending, startTransition] = useTransition();

  function handleConfirm() {
    startTransition(async () => {
      try {
        await updateJobApplicationStatus(applicationId, "HIRED");
        close();
        onUpdated();
      } catch {
        // silent
      }
    });
  }

  const stagger = (delay: number): React.CSSProperties => ({
    transform: mounted ? "translateY(0)" : "translateY(8px)",
    opacity: mounted ? 1 : 0,
    transition: `transform 0.5s cubic-bezier(0.22,1,0.36,1) ${delay}s, opacity 0.45s ease-out ${delay}s`,
  });

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 70,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(10,10,10,0.45)",
        padding: "0 16px",
        opacity: mounted ? 1 : 0,
        transition: "opacity 180ms ease",
      }}
    >
      <style>{`
        @keyframes cv-fall {
          0%   { transform: translate3d(0,-40px,0) rotate(0deg); opacity: 0; }
          12%  { opacity: 1; }
          100% { transform: translate3d(var(--dx,0),480px,0) rotate(var(--rot,540deg)); opacity: 0; }
        }
        @keyframes cv-fall-loop {
          0%   { transform: translate3d(0,-40px,0) rotate(0deg); opacity: 0; }
          8%   { opacity: 1; }
          48%  { transform: translate3d(var(--dx,0),520px,0) rotate(var(--rot,540deg)); opacity: 0; }
          100% { transform: translate3d(0,-40px,0) rotate(0deg); opacity: 0; }
        }
        @keyframes cv-pulse {
          0%   { transform: scale(0.6); opacity: 0.55; }
          70%  { transform: scale(1.55); opacity: 0; }
          100% { transform: scale(1.55); opacity: 0; }
        }
      `}</style>
      <div
        style={{
          position: "relative",
          width: "100%",
          maxWidth: 500,
          background: "#fafaf6",
          borderRadius: 20,
          overflow: "hidden",
          boxShadow: "0 24px 72px rgba(10,10,10,0.22)",
        }}
      >
        <HiredConfetti active={mounted} />

        <div
          style={{
            position: "relative",
            zIndex: 1,
            padding: "40px 28px 28px",
            textAlign: "center",
          }}
        >
          {/* Check circle */}
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              marginBottom: 20,
            }}
          >
            <div
              style={{
                position: "relative",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <span
                style={{
                  position: "absolute",
                  width: 78,
                  height: 78,
                  borderRadius: "50%",
                  background: "rgba(198,255,58,0.55)",
                  animation: mounted
                    ? "cv-pulse 1.6s ease-out 0.1s 1 forwards"
                    : "none",
                }}
              />
              <div
                style={{
                  width: 72,
                  height: 72,
                  borderRadius: "50%",
                  background: "#c6ff3a",
                  border: "1px solid rgba(64,84,16,0.18)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  boxShadow:
                    "0 6px 20px -6px rgba(198,255,58,0.6), inset 0 1px 0 rgba(255,255,255,0.4)",
                  position: "relative",
                  zIndex: 2,
                }}
              >
                <svg
                  width="34"
                  height="34"
                  viewBox="0 0 24 24"
                  fill="none"
                  aria-hidden
                >
                  <path
                    d="M5 12.5l4.5 4.5L19 7"
                    stroke="#0a0a0a"
                    strokeWidth="2.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{
                      strokeDasharray: 30,
                      strokeDashoffset: mounted ? 0 : 30,
                      transition:
                        "stroke-dashoffset 0.55s cubic-bezier(0.6,0,0.4,1) 0.2s",
                    }}
                  />
                </svg>
              </div>
            </div>
          </div>

          {/* Label */}
          <div
            style={{
              ...stagger(0.3),
              fontFamily: MONO,
              fontSize: 10,
              letterSpacing: "0.14em",
              color: "#8a8a85",
              fontWeight: 500,
              marginBottom: 14,
            }}
          >
            STATUS · CONTRATADO
          </div>

          {/* Title */}
          <div style={stagger(0.38)}>
            <h2
              style={{
                margin: "0 0 6px",
                fontSize: 26,
                fontWeight: 500,
                letterSpacing: "-0.04em",
                lineHeight: 1.1,
                color: "#0a0a0a",
                fontFamily: GEIST,
              }}
            >
              Parabéns!
            </h2>
            <div
              style={{
                fontSize: 22,
                fontWeight: 400,
                fontStyle: "italic",
                fontFamily: "var(--font-instrument-serif), Georgia, serif",
                color: "#0a0a0a",
                marginBottom: 16,
                lineHeight: 1.2,
              }}
            >
              Você foi contratado.
            </div>
          </div>

          {/* Body */}
          <div style={{ ...stagger(0.46), marginBottom: 28 }}>
            <p
              style={{
                margin: 0,
                fontSize: 14,
                color: "#5a5a55",
                lineHeight: 1.6,
                fontFamily: GEIST,
              }}
            >
              A vaga de {jobTitle} na {companyName} é sua. Atualizamos a jornada
              e guardamos o CV que te levou até aqui.
            </p>
          </div>

          {/* Buttons */}
          <div style={{ ...stagger(0.52), display: "flex", gap: 8 }}>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={pending}
              style={{
                flex: 2,
                padding: "12px 0",
                borderRadius: 10,
                border: "none",
                background: pending ? "rgba(10,10,10,0.08)" : "#0a0a0a",
                color: pending ? "#8a8a85" : "#fafaf6",
                fontSize: 13.5,
                fontWeight: 500,
                cursor: pending ? "not-allowed" : "pointer",
                fontFamily: GEIST,
                transition: "opacity 140ms ease",
              }}
            >
              {pending ? "Salvando…" : "Concluir candidatura"}
            </button>
            <button
              type="button"
              onClick={close}
              style={{
                flex: 1,
                padding: "12px 0",
                borderRadius: 10,
                border: "1px solid rgba(10,10,10,0.12)",
                background: "rgba(255,255,255,0.7)",
                color: "#3a3a36",
                fontSize: 13.5,
                fontWeight: 500,
                cursor: "pointer",
                fontFamily: GEIST,
              }}
            >
              Cancelar
            </button>
          </div>

          {/* Footer note */}
          <div style={{ ...stagger(0.56), marginTop: 16 }}>
            <span
              style={{
                fontSize: 11.5,
                color: "#a8a6a0",
                fontFamily: MONO,
                letterSpacing: 0.2,
              }}
            >
              ◎ CV enviado preservado · candidatura arquivada como contratada
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Rejection feedback modal ─────────────────────────────────────

function RejectionFeedbackModal({
  applicationId,
  companyName,
  jobTitle,
  onClose,
  onUpdated,
}: {
  applicationId: string;
  companyName: string;
  jobTitle: string;
  onClose: () => void;
  onUpdated: () => void;
}) {
  const { visible, close } = useModalFade(onClose);
  const [strengths, setStrengths] = useState("");
  const [improvements, setImprovements] = useState("");
  const [pending, startTransition] = useTransition();
  const [showSkipNudge, setShowSkipNudge] = useState(false);

  function handleSave(skip = false) {
    startTransition(async () => {
      try {
        await submitRejectionFeedback(applicationId, {
          rejectionStrengths: skip ? undefined : strengths.trim() || undefined,
          rejectionImprovements: skip
            ? undefined
            : improvements.trim() || undefined,
        });
        close();
        onUpdated();
      } catch {
        // silent
      }
    });
  }

  function handleSkipClick() {
    if (!strengths.trim() && !improvements.trim()) {
      setShowSkipNudge(true);
    } else {
      handleSave(true);
    }
  }

  const textareaStyle: React.CSSProperties = {
    ...inputStyle,
    resize: "none",
    minHeight: 72,
    lineHeight: 1.5,
  };

  const labelStyle: React.CSSProperties = {
    display: "block",
    fontFamily: MONO,
    fontSize: 9.5,
    letterSpacing: 0.8,
    color: "#8a8a85",
    fontWeight: 500,
    marginBottom: 5,
    textTransform: "uppercase",
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 70,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(10,10,10,0.40)",
        padding: "0 16px",
        opacity: visible ? 1 : 0,
        transition: "opacity 180ms ease",
      }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 480,
          background: "#fafaf6",
          borderRadius: 20,
          overflow: "hidden",
          boxShadow: "0 24px 72px rgba(10,10,10,0.20)",
          transform: visible ? "translateY(0)" : "translateY(12px)",
          transition:
            "transform 200ms cubic-bezier(0.22,1,0.36,1), opacity 180ms ease",
          opacity: visible ? 1 : 0,
        }}
      >
        {/* Top accent */}
        <div
          style={{
            height: 4,
            background:
              "linear-gradient(90deg, rgba(10,10,10,0.12), rgba(10,10,10,0.04))",
          }}
        />

        <div style={{ padding: "28px 28px 24px" }}>
          {/* Encouraging header */}
          <div style={{ marginBottom: 22 }}>
            <div
              style={{
                fontFamily: MONO,
                fontSize: 10,
                letterSpacing: "0.14em",
                color: "#8a8a85",
                fontWeight: 500,
                marginBottom: 10,
                textTransform: "uppercase",
              }}
            >
              {jobTitle} · {companyName}
            </div>
            <h2
              style={{
                margin: "0 0 6px",
                fontSize: 22,
                fontWeight: 500,
                letterSpacing: "-0.03em",
                color: "#0a0a0a",
                fontFamily: GEIST,
                lineHeight: 1.2,
              }}
            >
              Tudo bem, faz parte.
            </h2>
            <p
              style={{
                margin: 0,
                fontSize: 14,
                color: "#5a5a55",
                lineHeight: 1.6,
                fontFamily: GEIST,
              }}
            >
              Na próxima você vai melhor, e o EarlyCV vai te ajudar a chegar
              mais preparado. Conta pra gente como foi para aprendermos juntos.
            </p>
          </div>

          {/* AI badge */}
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              background: "rgba(10,10,10,0.04)",
              border: "1px solid rgba(10,10,10,0.08)",
              borderRadius: 6,
              padding: "5px 10px",
              marginBottom: 20,
            }}
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
              aria-hidden
              style={{ color: "#6a6560" }}
            >
              <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z" />
              <path d="M12 8v4l3 3" />
            </svg>
            <span
              style={{
                fontFamily: MONO,
                fontSize: 9.5,
                color: "#6a6560",
                letterSpacing: 0.4,
              }}
            >
              Suas respostas ajudam a te preparar melhor para as próximas
            </span>
          </div>

          {/* Fields */}
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>O que você foi bem neste processo?</label>
            <textarea
              value={strengths}
              onChange={(e) => setStrengths(e.target.value)}
              placeholder="Ex: apresentei bem minha trajetória, fui claro nas respostas técnicas..."
              style={textareaStyle}
            />
          </div>

          <div style={{ marginBottom: 22 }}>
            <label style={labelStyle}>O que poderia ter ido melhor?</label>
            <textarea
              value={improvements}
              onChange={(e) => setImprovements(e.target.value)}
              placeholder="Ex: poderia ter pesquisado mais sobre a empresa, preparado melhor o case..."
              style={textareaStyle}
            />
          </div>

          {/* Nudge when skipping without filling */}
          {showSkipNudge && (
            <div
              style={{
                background: "rgba(60,100,220,0.05)",
                border: "1px solid rgba(60,100,220,0.18)",
                borderRadius: 10,
                padding: "12px 14px",
                marginBottom: 14,
                fontSize: 13,
                color: "#1a2a5a",
                lineHeight: 1.55,
                fontFamily: GEIST,
              }}
            >
              Preencher esses campos ajuda o EarlyCV a te preparar melhor para os próximos processos — a IA usa esse contexto para dar orientações personalizadas.
              <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                <button
                  type="button"
                  onClick={() => setShowSkipNudge(false)}
                  style={{
                    flex: 1,
                    padding: "8px 0",
                    borderRadius: 8,
                    border: "none",
                    background: "#1a3a7a",
                    color: "#fff",
                    fontSize: 12.5,
                    fontWeight: 500,
                    cursor: "pointer",
                    fontFamily: GEIST,
                  }}
                >
                  Preencher
                </button>
                <button
                  type="button"
                  onClick={() => handleSave(true)}
                  disabled={pending}
                  style={{
                    flex: 1,
                    padding: "8px 0",
                    borderRadius: 8,
                    border: "1px solid rgba(10,10,10,0.12)",
                    background: "transparent",
                    color: "#8a8a85",
                    fontSize: 12.5,
                    fontWeight: 400,
                    cursor: pending ? "not-allowed" : "pointer",
                    fontFamily: GEIST,
                  }}
                >
                  Confirmar sem preencher
                </button>
              </div>
            </div>
          )}

          {/* Actions */}
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              onClick={() => handleSave(false)}
              disabled={pending}
              style={{
                flex: 2,
                padding: "11px 0",
                borderRadius: 10,
                border: "none",
                background: !pending ? "#0a0a0a" : "rgba(10,10,10,0.08)",
                color: !pending ? "#fafaf6" : "#8a8a85",
                fontSize: 13.5,
                fontWeight: 500,
                cursor: pending ? "not-allowed" : "pointer",
                fontFamily: GEIST,
                transition: "opacity 140ms ease",
              }}
            >
              {pending ? "Salvando…" : "Salvar e marcar como recusado"}
            </button>
            <button
              type="button"
              onClick={handleSkipClick}
              disabled={pending}
              style={{
                flex: 1,
                padding: "11px 0",
                borderRadius: 10,
                border: "1px solid rgba(10,10,10,0.12)",
                background: "rgba(255,255,255,0.7)",
                color: "#8a8a85",
                fontSize: 13,
                fontWeight: 400,
                cursor: pending ? "not-allowed" : "pointer",
                fontFamily: GEIST,
              }}
            >
              Pular
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Status card (próxima ação) ───────────────────────────────────

function StatusPopover({
  applicationId,
  status,
  unlockedAdaptations,
  onClose,
  onUpdated,
  onInterviewSelected,
  onHiredSelected,
  onRejectedSelected,
}: {
  applicationId: string;
  status: JobApplicationStatus;
  unlockedAdaptations: Array<{
    id: string;
    jobTitle: string | null;
    companyName: string | null;
    createdAt: string;
    scoreAfter: number | null;
  }>;
  onClose: () => void;
  onUpdated: () => void;
  onInterviewSelected: () => void;
  onHiredSelected: () => void;
  onRejectedSelected: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [savingStatus, setSavingStatus] = useState<JobApplicationStatus | null>(
    null,
  );
  const [cvPickStep, setCvPickStep] = useState(false);
  const [selectedCvId, setSelectedCvId] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  function saveApplied(currentCvAdaptationId?: string) {
    setSavingStatus("APPLIED");
    startTransition(async () => {
      try {
        await updateJobApplicationStatus(
          applicationId,
          "APPLIED",
          currentCvAdaptationId,
        );
        onClose();
        onUpdated();
      } catch {
        setSavingStatus(null);
        setCvPickStep(false);
      }
    });
  }

  function handleSelect(newStatus: JobApplicationStatus) {
    if (newStatus === status || pending) return;
    if (newStatus === "INTERVIEW") {
      onClose();
      onInterviewSelected();
      return;
    }
    if (newStatus === "HIRED") {
      onClose();
      onHiredSelected();
      return;
    }
    if (newStatus === "REJECTED") {
      onClose();
      onRejectedSelected();
      return;
    }
    if (newStatus === "APPLIED" && unlockedAdaptations.length > 1) {
      setCvPickStep(true);
      setSelectedCvId(unlockedAdaptations[0]?.id ?? null);
      return;
    }
    if (newStatus === "APPLIED") {
      saveApplied(unlockedAdaptations[0]?.id);
      return;
    }
    setSavingStatus(newStatus);
    startTransition(async () => {
      try {
        await updateJobApplicationStatus(applicationId, newStatus);
        onClose();
        onUpdated();
      } catch {
        setSavingStatus(null);
      }
    });
  }

  if (cvPickStep) {
    return (
      <div
        ref={ref}
        className="status-popover"
        style={{
          position: "absolute",
          top: "calc(100% + 6px)",
          right: 0,
          zIndex: 50,
          width: 260,
          background: "#fff",
          border: "1px solid rgba(10,10,10,0.10)",
          borderRadius: 12,
          padding: "14px 14px 12px",
          boxShadow: "0 8px 24px rgba(10,10,10,0.12)",
          animation: "dropdownFadeIn 150ms cubic-bezier(0.22,1,0.36,1)",
        }}
      >
        <div
          style={{
            fontFamily: GEIST,
            fontSize: 12.5,
            fontWeight: 600,
            color: "#0a0a0a",
            marginBottom: 10,
          }}
        >
          Qual CV foi usado na candidatura?
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 6,
            marginBottom: 12,
          }}
        >
          {unlockedAdaptations.map((a) => {
            const isSelected = selectedCvId === a.id;
            const date = new Date(a.createdAt).toLocaleDateString("pt-BR", {
              day: "2-digit",
              month: "short",
            });
            return (
              <button
                key={a.id}
                type="button"
                onClick={() => setSelectedCvId(a.id)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "8px 10px",
                  borderRadius: 8,
                  border: isSelected
                    ? "1.5px solid #aadb2a"
                    : "1px solid rgba(10,10,10,0.10)",
                  background: isSelected
                    ? "rgba(198,255,58,0.10)"
                    : "rgba(10,10,10,0.02)",
                  cursor: "pointer",
                  textAlign: "left",
                  fontFamily: GEIST,
                  width: "100%",
                }}
              >
                <div
                  style={{
                    width: 14,
                    height: 14,
                    borderRadius: "50%",
                    border: isSelected
                      ? "4px solid #aadb2a"
                      : "1.5px solid rgba(10,10,10,0.25)",
                    flexShrink: 0,
                    background: "#fff",
                    boxSizing: "border-box",
                  }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: 500,
                      color: "#0a0a0a",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {date}
                    {a.scoreAfter !== null ? ` · ${a.scoreAfter}%` : ""}
                  </div>
                  <div
                    style={{
                      fontFamily: MONO,
                      fontSize: 10,
                      color: "#b0aea6",
                      marginTop: 2,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    ID: {a.id}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button
            type="button"
            onClick={() => saveApplied(selectedCvId ?? undefined)}
            disabled={pending || !selectedCvId}
            style={{
              flex: 1,
              padding: "8px 0",
              borderRadius: 8,
              border: "none",
              background:
                pending || !selectedCvId ? "rgba(10,10,10,0.08)" : "#0a0a0a",
              color: pending || !selectedCvId ? "#8a8a85" : "#fafaf6",
              fontSize: 12.5,
              fontWeight: 500,
              cursor: pending || !selectedCvId ? "not-allowed" : "pointer",
              fontFamily: GEIST,
            }}
          >
            {pending ? "Salvando…" : "Confirmar"}
          </button>
          <button
            type="button"
            onClick={() => setCvPickStep(false)}
            disabled={pending}
            style={{
              padding: "8px 12px",
              borderRadius: 8,
              border: "1px solid rgba(10,10,10,0.12)",
              background: "transparent",
              color: "#8a8a85",
              fontSize: 12.5,
              cursor: pending ? "not-allowed" : "pointer",
              fontFamily: GEIST,
            }}
          >
            Voltar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={ref}
      className="status-popover"
      style={{
        position: "absolute",
        top: "calc(100% + 6px)",
        right: 0,
        zIndex: 50,
        minWidth: 180,
        background: "#fff",
        border: "1px solid rgba(10,10,10,0.10)",
        borderRadius: 12,
        padding: "6px",
        boxShadow: "0 8px 24px rgba(10,10,10,0.12)",
        animation: "dropdownFadeIn 150ms cubic-bezier(0.22,1,0.36,1)",
      }}
    >
      {USER_VISIBLE_STATUS_OPTIONS.map((opt) => {
        const isCurrent = opt.value === status;
        const isSaving = savingStatus === opt.value;
        const isCurrentlyInterview =
          status === "INTERVIEW" ||
          status === "IN_PROCESS" ||
          status === "ASSESSMENT" ||
          status === "OFFER";
        const displayLabel =
          opt.value === "INTERVIEW" && isCurrentlyInterview
            ? "Nova entrevista"
            : opt.label;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => handleSelect(opt.value)}
            disabled={pending}
            style={{
              display: "block",
              width: "100%",
              padding: "8px 12px",
              borderRadius: 7,
              border: "none",
              background: isCurrent ? "rgba(10,10,10,0.05)" : "transparent",
              color: isCurrent ? "#0a0a0a" : "#3a3a36",
              fontSize: 13,
              fontWeight: isCurrent ? 600 : 400,
              textAlign: "left",
              cursor: isCurrent || pending ? "default" : "pointer",
              fontFamily: GEIST,
              opacity: pending && !isSaving ? 0.4 : 1,
            }}
          >
            {isSaving ? "Salvando…" : displayLabel}
          </button>
        );
      })}
    </div>
  );
}

// ─── Interview schedule modal ─────────────────────────────────────

function InterviewScheduleModal({
  applicationId,
  onClose,
  onUpdated,
}: {
  applicationId: string;
  onClose: () => void;
  onUpdated: () => void;
}) {
  const today = new Date();
  const localDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const localTime = `${String(today.getHours()).padStart(2, "0")}:${String(today.getMinutes()).padStart(2, "0")}`;

  const { visible, close } = useModalFade(onClose);
  const [date, setDate] = useState(localDate);
  const [time, setTime] = useState(localTime);
  const [title, setTitle] = useState("");
  const [interviewer, setInterviewer] = useState("");
  const [meetingUrl, setMeetingUrl] = useState("");
  const [location, setLocation] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSave() {
    if (!date || !time || !title.trim()) {
      setError("Data, hora e título são obrigatórios.");
      return;
    }
    const scheduledAt = new Date(`${date}T${time}:00`).toISOString();
    const url = meetingUrl.trim()
      ? /^https?:\/\//i.test(meetingUrl.trim())
        ? meetingUrl.trim()
        : `https://${meetingUrl.trim()}`
      : undefined;
    setError(null);
    startTransition(async () => {
      try {
        await scheduleInterview(applicationId, {
          scheduledAt,
          interviewTitle: title.trim(),
          interviewerName: interviewer.trim() || undefined,
          interviewMeetingUrl: url,
          interviewLocation: location.trim() || undefined,
        });
        close();
        onUpdated();
      } catch {
        setError("Falha ao salvar. Tente novamente.");
      }
    });
  }

  const labelStyle: React.CSSProperties = {
    display: "block",
    fontFamily: MONO,
    fontSize: 9.5,
    letterSpacing: 0.8,
    color: "#8a8a85",
    fontWeight: 500,
    marginBottom: 5,
    textTransform: "uppercase",
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 70,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(10,10,10,0.35)",
        padding: "0 16px",
        opacity: visible ? 1 : 0,
        transition: "opacity 180ms ease",
      }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 460,
          background: "#fafaf6",
          borderRadius: 16,
          padding: "28px 24px 24px",
          boxShadow: "0 20px 60px rgba(10,10,10,0.18)",
          transform: visible ? "translateY(0)" : "translateY(12px)",
          transition:
            "transform 200ms cubic-bezier(0.22,1,0.36,1), opacity 180ms ease",
          opacity: visible ? 1 : 0,
        }}
      >
        <div
          style={{
            fontFamily: MONO,
            fontSize: 10,
            letterSpacing: 1.2,
            color: "#8a8a85",
            fontWeight: 500,
            marginBottom: 20,
            textTransform: "uppercase",
          }}
        >
          Agendar entrevista
        </div>

        {/* Date + time row */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 12,
            marginBottom: 14,
          }}
        >
          <div>
            <label style={labelStyle}>Data</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              style={{ ...inputStyle }}
            />
          </div>
          <div>
            <label style={labelStyle}>Hora</label>
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              style={{ ...inputStyle }}
            />
          </div>
        </div>

        {/* Title */}
        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Título da entrevista</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Ex: Entrevista RH, Entrevista Gestor..."
            style={{ ...inputStyle }}
          />
        </div>

        {/* Interviewer */}
        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Entrevistador (opcional)</label>
          <input
            type="text"
            value={interviewer}
            onChange={(e) => setInterviewer(e.target.value)}
            placeholder="Nome do entrevistador"
            style={{ ...inputStyle }}
          />
        </div>

        {/* Meeting link */}
        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>Link da reunião (opcional)</label>
          <input
            type="url"
            value={meetingUrl}
            onChange={(e) => setMeetingUrl(e.target.value)}
            placeholder="meet.google.com/..."
            style={{ ...inputStyle }}
          />
        </div>

        {/* Location */}
        <div style={{ marginBottom: error ? 8 : 20 }}>
          <label style={labelStyle}>Endereço / local (opcional)</label>
          <input
            type="text"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="Av. Paulista, 1000 — São Paulo"
            style={{ ...inputStyle }}
          />
        </div>

        {error && (
          <p
            style={{
              margin: "0 0 14px",
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

        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            onClick={close}
            style={{
              flex: 1,
              padding: "10px 0",
              borderRadius: 8,
              border: "1px solid rgba(10,10,10,0.12)",
              background: "#fff",
              color: "#0a0a0a",
              fontSize: 13,
              fontWeight: 500,
              cursor: "pointer",
              fontFamily: GEIST,
            }}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={pending}
            style={{
              flex: 1,
              padding: "10px 0",
              borderRadius: 8,
              border: "none",
              background: !pending ? "#0a0a0a" : "rgba(10,10,10,0.08)",
              color: !pending ? "#fafaf6" : "#8a8a85",
              fontSize: 13,
              fontWeight: 500,
              cursor: pending ? "not-allowed" : "pointer",
              fontFamily: GEIST,
              transition: "all 140ms ease",
            }}
          >
            {pending ? "Salvando…" : "Confirmar entrevista"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Interview scheduled card ──────────────────────────────────────

function InterviewScheduledCard({
  application,
  onSchedule,
}: {
  application: JobApplicationDetailDto;
  onSchedule: () => void;
}) {
  const isInterviewStatus =
    application.status === "INTERVIEW" ||
    application.status === "IN_PROCESS" ||
    application.status === "ASSESSMENT" ||
    application.status === "OFFER";

  if (!isInterviewStatus) return null;

  const hasSchedule = application.nextActionAt !== null;

  if (!hasSchedule) {
    return (
      <div
        style={{
          background: "rgba(245,197,24,0.08)",
          border: "1px dashed rgba(180,140,10,0.30)",
          borderRadius: 12,
          padding: "14px 18px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <span
          style={{
            fontSize: 13,
            color: "#7a5a04",
            fontFamily: GEIST,
          }}
        >
          Nenhuma entrevista agendada ainda.
        </span>
        <button
          type="button"
          onClick={onSchedule}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            padding: "7px 13px",
            borderRadius: 8,
            border: "1px solid rgba(180,140,10,0.35)",
            background: "rgba(245,197,24,0.15)",
            color: "#7a5a04",
            fontSize: 12.5,
            fontWeight: 500,
            cursor: "pointer",
            fontFamily: GEIST,
            whiteSpace: "nowrap",
          }}
        >
          + Agendar
        </button>
      </div>
    );
  }

  const dt = new Date(application.nextActionAt!);
  const dateStr = dt.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
  });
  const timeStr = dt.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div
      className="interview-card"
      style={{
        background: "rgba(245,197,24,0.10)",
        border: "1px solid rgba(180,140,10,0.22)",
        borderRadius: 12,
        padding: "14px 18px",
        display: "flex",
        alignItems: "center",
        gap: 14,
      }}
    >
      {/* Calendar icon */}
      <div
        style={{
          flexShrink: 0,
          width: 36,
          height: 36,
          borderRadius: 8,
          background: "rgba(245,197,24,0.20)",
          border: "1px solid rgba(180,140,10,0.20)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#7a5a04",
        }}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontFamily: MONO,
            fontSize: 9.5,
            letterSpacing: 1,
            color: "#9a7a14",
            fontWeight: 500,
            marginBottom: 3,
            textTransform: "uppercase",
          }}
        >
          Entrevista agendada
        </div>
        <div
          style={{
            fontSize: 13.5,
            fontWeight: 500,
            color: "#0a0a0a",
            fontFamily: GEIST,
            marginBottom: 2,
          }}
        >
          {dateStr} · {timeStr}
          {application.interviewTitle ? ` — ${application.interviewTitle}` : ""}
          {application.companyName ? ` com ${application.companyName}` : ""}
        </div>
        {(application.interviewerName || application.interviewLocation) && (
          <div style={{ fontSize: 12, color: "#6a6560", fontFamily: GEIST }}>
            {[application.interviewerName, application.interviewLocation]
              .filter(Boolean)
              .join(" · ")}
          </div>
        )}
      </div>

      {/* Actions */}
      <div
        className="interview-card-actions"
        style={{ display: "flex", gap: 8, flexShrink: 0, alignItems: "center" }}
      >
        {application.interviewMeetingUrl && (
          <a
            href={application.interviewMeetingUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              padding: "7px 13px",
              borderRadius: 8,
              border: "1px solid rgba(180,140,10,0.30)",
              background: "rgba(245,197,24,0.15)",
              color: "#7a5a04",
              fontSize: 12.5,
              fontWeight: 500,
              textDecoration: "none",
              fontFamily: GEIST,
            }}
          >
            Entrar na reunião ↗
          </a>
        )}

        <AddToCalendarButton application={application} />

        <button
          type="button"
          onClick={onSchedule}
          style={{
            display: "inline-flex",
            alignItems: "center",
            padding: "7px 13px",
            borderRadius: 8,
            border: "1px solid rgba(10,10,10,0.12)",
            background: "rgba(255,255,255,0.7)",
            color: "#6a6560",
            fontSize: 12.5,
            fontWeight: 500,
            cursor: "pointer",
            fontFamily: GEIST,
          }}
        >
          Editar
        </button>
      </div>
    </div>
  );
}

// ─── Add to calendar ──────────────────────────────────────────────

function formatIcsDate(iso: string): string {
  return iso
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "")
    .replace("Z", "Z");
}

function buildGoogleCalendarUrl(application: JobApplicationDetailDto): string {
  const dt = new Date(application.nextActionAt!);
  const end = new Date(dt.getTime() + 60 * 60 * 1000); // +1h
  const fmt = (d: Date) =>
    d
      .toISOString()
      .replace(/[-:]/g, "")
      .replace(/\.\d{3}/, "");
  const title = [application.interviewTitle, application.companyName]
    .filter(Boolean)
    .join(" — ");
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: title,
    dates: `${fmt(dt)}/${fmt(end)}`,
    details: [
      application.interviewerName
        ? `Entrevistador: ${application.interviewerName}`
        : "",
      application.interviewMeetingUrl
        ? `Link: ${application.interviewMeetingUrl}`
        : "",
    ]
      .filter(Boolean)
      .join("\n"),
    ...(application.interviewLocation || application.interviewMeetingUrl
      ? {
          location:
            application.interviewLocation ?? application.interviewMeetingUrl!,
        }
      : {}),
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function downloadIcs(application: JobApplicationDetailDto) {
  const dt = new Date(application.nextActionAt!);
  const end = new Date(dt.getTime() + 60 * 60 * 1000);
  const title = [application.interviewTitle, application.companyName]
    .filter(Boolean)
    .join(" — ");
  const uid = `interview-${application.id}-${dt.getTime()}@earlycv`;
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//EarlyCV//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `DTSTART:${formatIcsDate(dt.toISOString())}`,
    `DTEND:${formatIcsDate(end.toISOString())}`,
    `SUMMARY:${title}`,
    application.interviewerName
      ? `DESCRIPTION:Entrevistador: ${application.interviewerName}`
      : "",
    application.interviewLocation
      ? `LOCATION:${application.interviewLocation}`
      : application.interviewMeetingUrl
        ? `LOCATION:${application.interviewMeetingUrl}`
        : "",
    `UID:${uid}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ]
    .filter((l) => l !== "")
    .join("\r\n");

  const blob = new Blob([lines], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `entrevista-${application.companyName.replace(/\s+/g, "-").toLowerCase()}.ics`;
  a.click();
  URL.revokeObjectURL(url);
}

function AddToCalendarButton({
  application,
}: {
  application: JobApplicationDetailDto;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [open]);

  const btnStyle: React.CSSProperties = {
    display: "block",
    width: "100%",
    padding: "8px 14px",
    border: "none",
    background: "transparent",
    color: "#0a0a0a",
    fontSize: 13,
    fontWeight: 400,
    textAlign: "left",
    cursor: "pointer",
    fontFamily: GEIST,
    borderRadius: 7,
    whiteSpace: "nowrap",
  };

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 5,
          padding: "7px 13px",
          borderRadius: 8,
          border: "1.5px dashed rgba(180,140,10,0.40)",
          background: open ? "rgba(245,197,24,0.22)" : "rgba(245,197,24,0.12)",
          color: "#7a5a04",
          fontSize: 12.5,
          fontWeight: 500,
          cursor: "pointer",
          fontFamily: GEIST,
        }}
      >
        <svg
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
          <line
            x1="8"
            y1="14"
            x2="8"
            y2="14"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
          <line
            x1="12"
            y1="14"
            x2="12"
            y2="14"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
          <line
            x1="16"
            y1="14"
            x2="16"
            y2="14"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
          <line
            x1="8"
            y1="18"
            x2="8"
            y2="18"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
          <line
            x1="12"
            y1="18"
            x2="12"
            y2="18"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
        </svg>
        Salvar na agenda ▾
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            right: 0,
            zIndex: 50,
            background: "#fff",
            border: "1px solid rgba(10,10,10,0.10)",
            borderRadius: 10,
            padding: "5px",
            boxShadow: "0 8px 24px rgba(10,10,10,0.12)",
            minWidth: 190,
            animation: "dropdownFadeIn 150ms cubic-bezier(0.22,1,0.36,1)",
          }}
        >
          <a
            href={buildGoogleCalendarUrl(application)}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setOpen(false)}
            style={{ ...btnStyle, textDecoration: "none" }}
            onMouseEnter={(e) =>
              ((e.currentTarget as HTMLElement).style.background =
                "rgba(10,10,10,0.04)")
            }
            onMouseLeave={(e) =>
              ((e.currentTarget as HTMLElement).style.background =
                "transparent")
            }
          >
            Google Agenda
          </a>
          <button
            type="button"
            onClick={() => {
              downloadIcs(application);
              setOpen(false);
            }}
            style={btnStyle}
            onMouseEnter={(e) =>
              ((e.currentTarget as HTMLElement).style.background =
                "rgba(10,10,10,0.04)")
            }
            onMouseLeave={(e) =>
              ((e.currentTarget as HTMLElement).style.background =
                "transparent")
            }
          >
            Apple / iCal / Outlook
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Job URL modal ────────────────────────────────────────────────

function JobUrlModal({
  applicationId,
  currentUrl,
  onClose,
  onUpdated,
}: {
  applicationId: string;
  currentUrl: string | null;
  onClose: () => void;
  onUpdated: () => void;
}) {
  const { visible, close } = useModalFade(onClose);
  const [value, setValue] = useState(currentUrl ?? "");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  function normalize(raw: string): string {
    const trimmed = raw.trim();
    if (!trimmed) return trimmed;
    return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  }

  function handleSave() {
    const url = normalize(value);
    if (!url) return;
    try {
      new URL(url);
    } catch {
      setError("URL inválida.");
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        await updateJobApplicationUrl(applicationId, url);
        close();
        onUpdated();
      } catch {
        setError("Falha ao salvar. Tente novamente.");
      }
    });
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 70,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(10,10,10,0.35)",
        padding: "0 16px",
        opacity: visible ? 1 : 0,
        transition: "opacity 180ms ease",
      }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 440,
          background: "#fafaf6",
          borderRadius: 16,
          padding: "28px 24px 24px",
          boxShadow: "0 20px 60px rgba(10,10,10,0.18)",
          transform: visible ? "translateY(0)" : "translateY(12px)",
          transition:
            "transform 200ms cubic-bezier(0.22,1,0.36,1), opacity 180ms ease",
          opacity: visible ? 1 : 0,
        }}
      >
        <div
          style={{
            fontFamily: MONO,
            fontSize: 10,
            letterSpacing: 1.2,
            color: "#8a8a85",
            fontWeight: 500,
            marginBottom: 14,
            textTransform: "uppercase",
          }}
        >
          Link da vaga
        </div>
        <input
          ref={inputRef}
          type="url"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSave();
            if (e.key === "Escape") onClose();
          }}
          placeholder="https://linkedin.com/jobs/..."
          style={{ ...inputStyle, marginBottom: error ? 8 : 16 }}
        />
        {error && (
          <p
            style={{
              margin: "0 0 12px",
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
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            onClick={close}
            style={{
              flex: 1,
              padding: "10px 0",
              borderRadius: 8,
              border: "1px solid rgba(10,10,10,0.12)",
              background: "#fff",
              color: "#0a0a0a",
              fontSize: 13,
              fontWeight: 500,
              cursor: "pointer",
              fontFamily: GEIST,
            }}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!value.trim() || pending}
            style={{
              flex: 1,
              padding: "10px 0",
              borderRadius: 8,
              border: "none",
              background:
                value.trim() && !pending ? "#0a0a0a" : "rgba(10,10,10,0.08)",
              color: value.trim() && !pending ? "#fafaf6" : "#8a8a85",
              fontSize: 13,
              fontWeight: 500,
              cursor: value.trim() && !pending ? "pointer" : "not-allowed",
              fontFamily: GEIST,
              transition: "all 140ms ease",
            }}
          >
            {pending ? "Salvando…" : "Salvar"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── StatusBadge ──────────────────────────────────────────────────

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
        padding: "4px 10px 4px 8px",
        fontFamily: MONO,
        fontSize: 11,
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

// ─── Main export ──────────────────────────────────────────────────

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
  const [showPrep, setShowPrep] = useState(false);
  const [showStatusEdit, setShowStatusEdit] = useState(false);
  const [showUrlModal, setShowUrlModal] = useState(false);
  const [showInterviewModal, setShowInterviewModal] = useState(false);
  const [showHiredModal, setShowHiredModal] = useState(false);
  const [showRejectionModal, setShowRejectionModal] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmDeleteVisible, setConfirmDeleteVisible] = useState(false);
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const closeTimerRef = useRef<number | null>(null);

  function handleUpdated() {
    router.refresh();
  }

  const isPrepEligible = PREP_ELIGIBLE_STATUSES.includes(application.status);
  const isInterview = application.status === "INTERVIEW";
  const isArchived = application.archivedAt !== null;
  const isFinalized =
    application.status === "HIRED" ||
    application.status === "REJECTED" ||
    application.status === "WITHDRAWN";
  const isArchivedManually = isArchived && !isFinalized;
  const hasUnlockedCv =
    application.bestCvState === "unlocked" ||
    application.bestCvState === "ready" ||
    application.cvAdaptations.some(
      (a) => a.isUnlocked || a.status === "delivered",
    );
  const canDelete = isArchivedManually && !hasUnlockedCv;
  const hasCvAdaptations = application.cvAdaptations.length > 0;
  const origin = ORIGIN_LABELS[application.origin] ?? application.origin;
  const bestAdaptation =
    application.cvAdaptations.find(
      (adaptation) => adaptation.id === application.bestCvAdaptationId,
    ) ?? null;
  const bestScore =
    bestAdaptation?.scoreAfter ??
    bestAdaptation?.scoreBefore ??
    application.scoreAfter ??
    application.scoreBefore;

  const handleArchive = async () => {
    if (archiving) return;
    setArchiveError(null);
    setArchiving(true);
    try {
      await archiveJobApplication(application.id);
      router.push("/candidaturas?view=arquivadas");
    } catch (err) {
      setArchiveError(
        err instanceof Error ? err.message : "Não foi possível arquivar.",
      );
    } finally {
      setArchiving(false);
    }
  };

  const handleRestore = async () => {
    if (restoring) return;
    setArchiveError(null);
    setRestoring(true);
    try {
      await restoreJobApplication(application.id);
      router.push("/candidaturas");
    } catch (err) {
      setArchiveError(
        err instanceof Error ? err.message : "Não foi possível restaurar.",
      );
    } finally {
      setRestoring(false);
    }
  };

  const handleDelete = async () => {
    if (deleting || !canDelete) return;
    setArchiveError(null);
    setDeleting(true);
    try {
      await deleteJobApplication(application.id);
      closeDeleteModal();
      router.push("/candidaturas?view=arquivadas");
      router.refresh();
    } catch (err) {
      setArchiveError(
        err instanceof Error ? err.message : "Não foi possível excluir.",
      );
    } finally {
      setDeleting(false);
    }
  };

  const openDeleteModal = () => {
    setConfirmDelete(true);
    setConfirmDeleteVisible(false);
    window.requestAnimationFrame(() => setConfirmDeleteVisible(true));
  };

  const closeDeleteModal = () => {
    setConfirmDeleteVisible(false);
    if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = window.setTimeout(() => {
      setConfirmDelete(false);
      closeTimerRef.current = null;
    }, 180);
  };

  useEffect(() => {
    return () => {
      if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current);
    };
  }, []);

  return (
    <PageShell>
      <style>{`
        @keyframes dropdownFadeIn {
          from { opacity: 0; transform: translateY(-5px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .analise-row-btns { width: 100%; }
        .analise-btn-base-cv { margin-left: auto; }
        @media (max-width: 767px) {
          .detail-wrapper { padding: 12px 14px 60px !important; }
          .detail-top-spacer { padding-top: 54px !important; margin-bottom: 12px !important; }
          .detail-hero-grid { grid-template-columns: 1fr !important; }
          .detail-hero-actions { flex-wrap: wrap !important; gap: 6px !important; align-items: stretch !important; }
          .detail-hero-actions > *:not(.detail-prep-btn) { flex: 1 !important; }
          .detail-hero-actions > div:not(.detail-prep-btn) { display: flex !important; }
          .detail-hero-actions > div:not(.detail-prep-btn) > button,
          .detail-hero-actions > button:not(.detail-prep-btn) { width: 100% !important; justify-content: center !important; }
          .detail-prep-btn { order: 10 !important; width: 100% !important; justify-content: center !important; }
          .jornada-steps-row { display: none !important; }
          .jornada-compact { display: block !important; }
          .analise-row-actions { flex-wrap: wrap !important; justify-content: flex-start !important; gap: 6px !important; }
          .analise-row-btns { flex-direction: column !important; align-items: flex-start !important; }
          .analise-btns-group-a { flex-wrap: wrap !important; }
          .analise-btns-group-b { flex-wrap: nowrap !important; width: 100% !important; }
          .analise-btns-group-b > * { flex: 1 !important; justify-content: center !important; }
          .analise-btn-base-cv { flex: none !important; margin-left: 0 !important; white-space: nowrap !important; }
          .interview-card { flex-wrap: wrap !important; align-items: flex-start !important; }
          .interview-card-actions { width: 100% !important; flex-shrink: unset !important; padding-left: 50px !important; }
          .status-popover {
            position: fixed !important;
            top: 50% !important;
            left: 50% !important;
            right: auto !important;
            bottom: auto !important;
            transform: translate(-50%, -50%) !important;
            width: 280px !important;
            max-height: 70vh !important;
            overflow-y: auto !important;
            z-index: 300 !important;
            box-shadow: 0 20px 60px rgba(10,10,10,0.25) !important;
          }
        }
        @media (min-width: 768px) {
          .jornada-compact { display: none !important; }
        }
      `}</style>
      <div
        aria-hidden
        style={{
          position: "fixed",
          inset: 0,
          pointerEvents: "none",
          opacity: 0.5,
          mixBlendMode: "multiply",
          zIndex: 0,
          backgroundImage: `url("data:image/svg+xml;utf8,<svg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.035 0'/></filter><rect width='100%25' height='100%25' filter='url(%23n)'/></svg>")`,
        }}
      />

      <main
        style={{
          fontFamily: GEIST,
          minHeight: "100dvh",
          background:
            "radial-gradient(ellipse 80% 40% at 50% 0%, #f9f8f4 0%, #efeee9 100%)",
          color: "#0a0a0a",
          position: "relative",
        }}
      >
        {header}

        <div
          className="detail-wrapper"
          style={{
            maxWidth: 1200,
            margin: "0 auto",
            padding: "12px 40px 80px",
            position: "relative",
            zIndex: 2,
          }}
        >
          {/* Breadcrumb */}
          <div className="detail-top-spacer" style={{ paddingTop: 72, marginBottom: 20 }}>
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
                href="/candidaturas"
                style={{ color: "#8a8a85", textDecoration: "none" }}
              >
                Minhas candidaturas
              </Link>
              <span style={{ color: "#c0beb4" }}>/</span>
              <span style={{ color: "#0a0a0a" }}>{application.jobTitle}</span>
            </div>
          </div>

          {/* Hero */}
          <div style={{ marginBottom: 18 }}>
            {/* Company / location */}
            <div
              style={{
                fontFamily: MONO,
                fontSize: 10.5,
                color: "#6a6560",
                letterSpacing: 0.5,
                marginBottom: 7,
                textTransform: "uppercase",
              }}
            >
              {application.companyName}
              {application.location ? ` · ${application.location}` : ""}
            </div>

            {/* Title */}
            <h1
              style={{
                margin: "0 0 11px",
                fontSize: "clamp(22px, 2.4vw, 30px)",
                fontWeight: 500,
                letterSpacing: -1,
                lineHeight: 1.15,
                color: "#0a0a0a",
              }}
            >
              {application.jobTitle}
            </h1>

            {/* Badge + stats + actions — all on the same line */}
            <div
              className="detail-hero-grid"
              style={{
                display: "grid",
                gridTemplateColumns: "1fr auto",
                gap: 16,
                alignItems: "center",
              }}
            >
              {/* Left: pill + stats */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 9,
                  flexWrap: "wrap",
                }}
              >
                <StatusBadge status={application.status} />
                <span style={{ color: "#c0beb4", fontSize: 12 }}>·</span>
                <span style={{ fontSize: 12.5, color: "#5a5a55" }}>
                  <strong>{application.cvAdaptations.length}</strong>{" "}
                  {application.cvAdaptations.length === 1
                    ? "análise"
                    : "análises"}
                </span>
                {bestScore !== null && (
                  <>
                    <span style={{ color: "#c0beb4", fontSize: 12 }}>·</span>
                    <span style={{ fontSize: 12.5, color: "#5a5a55" }}>
                      melhor score{" "}
                      <strong
                        style={{ color: getDashboardScoreColor(bestScore) }}
                      >
                        {bestScore}%
                      </strong>
                    </span>
                  </>
                )}
                <span style={{ color: "#c0beb4", fontSize: 12 }}>·</span>
                <span
                  style={{
                    fontFamily: MONO,
                    fontSize: 10.5,
                    color: "#a8a6a0",
                    letterSpacing: 0.4,
                  }}
                >
                  {origin}
                </span>
              </div>

              {/* Right: actions */}
              <div className="detail-hero-actions" style={{ display: "flex", gap: 8, alignItems: "center" }}>
                {/* Status button + inline popover */}
                <div style={{ position: "relative" }}>
                  <button
                    type="button"
                    onClick={() => setShowStatusEdit((v) => !v)}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 5,
                      padding: "8px 13px",
                      borderRadius: 8,
                      border: "1px solid rgba(10,10,10,0.12)",
                      background: showStatusEdit
                        ? "#f0f0ea"
                        : "rgba(255,255,255,0.7)",
                      color: "#3a3a36",
                      fontSize: 12.5,
                      fontWeight: 500,
                      cursor: "pointer",
                      fontFamily: GEIST,
                    }}
                  >
                    Status ▾
                  </button>
                  {showStatusEdit && (
                    <StatusPopover
                      applicationId={application.id}
                      status={application.status}
                      unlockedAdaptations={application.cvAdaptations.filter(
                        (a) => a.isUnlocked,
                      )}
                      onClose={() => setShowStatusEdit(false)}
                      onUpdated={handleUpdated}
                      onInterviewSelected={() => setShowInterviewModal(true)}
                      onHiredSelected={() => setShowHiredModal(true)}
                      onRejectedSelected={() => setShowRejectionModal(true)}
                    />
                  )}
                </div>

                {/* Link da vaga */}
                <button
                  type="button"
                  onClick={() => setShowUrlModal(true)}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 5,
                    padding: "8px 13px",
                    borderRadius: 8,
                    border: application.jobUrl
                      ? "1px solid rgba(10,10,10,0.20)"
                      : "1px dashed rgba(10,10,10,0.20)",
                    background: application.jobUrl
                      ? "rgba(255,255,255,0.7)"
                      : "transparent",
                    color: application.jobUrl ? "#3a3a36" : "#8a8a85",
                    fontSize: 12.5,
                    fontWeight: 500,
                    cursor: "pointer",
                    fontFamily: GEIST,
                  }}
                >
                  {application.jobUrl ? "Editar link ↗" : "+ Link da vaga"}
                </button>

                {isPrepEligible && (
                  <button
                    type="button"
                    className="detail-prep-btn"
                    onClick={() => setShowPrep(true)}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 5,
                      padding: "8px 15px",
                      borderRadius: 8,
                      border: isInterview
                        ? "1px solid rgba(110,150,20,0.35)"
                        : "1px solid rgba(10,10,10,0.12)",
                      background: isInterview
                        ? "#c6ff3a"
                        : "rgba(255,255,255,0.7)",
                      color: "#0a0a0a",
                      fontSize: 12.5,
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
                {(isArchived || !isFinalized) && (
                  <button
                    type="button"
                    onClick={() =>
                      void (isArchived ? handleRestore() : handleArchive())
                    }
                    disabled={archiving || restoring || deleting}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 5,
                      padding: "8px 13px",
                      borderRadius: 8,
                      border: "1px solid rgba(10,10,10,0.12)",
                      background: "rgba(255,255,255,0.7)",
                      color: "#3a3a36",
                      fontSize: 12.5,
                      fontWeight: 500,
                      cursor:
                        archiving || restoring || deleting
                          ? "not-allowed"
                          : "pointer",
                      fontFamily: GEIST,
                    }}
                  >
                    {isArchived
                      ? restoring
                        ? "Restaurando..."
                        : "Restaurar"
                      : archiving
                        ? "Arquivando..."
                        : "Arquivar"}
                  </button>
                )}
                {canDelete && (
                  <button
                    type="button"
                    onClick={() => {
                      setArchiveError(null);
                      openDeleteModal();
                    }}
                    disabled={deleting || archiving || restoring}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 5,
                      padding: "8px 13px",
                      borderRadius: 8,
                      border: "1px solid rgba(185,28,28,0.28)",
                      background: "rgba(255,255,255,0.7)",
                      color: "#7f1d1d",
                      fontSize: 12.5,
                      fontWeight: 500,
                      cursor:
                        deleting || archiving || restoring
                          ? "not-allowed"
                          : "pointer",
                      fontFamily: GEIST,
                    }}
                  >
                    {deleting ? "Excluindo..." : "Excluir"}
                  </button>
                )}
              </div>
            </div>

            {archiveError && (
              <p style={{ margin: "10px 0 0", fontSize: 12, color: "#991b1b" }}>
                {archiveError}
              </p>
            )}
          </div>

          {/* Jornada stepper */}
          {!isArchivedManually && (
            <Jornada
              application={application}
              onUpdated={handleUpdated}
              onRejected={() => setShowRejectionModal(true)}
            />
          )}

          {/* Entrevista agendada */}
          {!isArchivedManually && (
            <div style={{ marginBottom: 28 }}>
              <InterviewScheduledCard
                application={application}
                onSchedule={() => setShowInterviewModal(true)}
              />
            </div>
          )}

          {/* Main grid */}
          <div
            className="candidatura-grid"
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 340px",
              gap: 28,
              alignItems: "start",
            }}
          >
            {/* Left column */}
            <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
              <AnalisesSection
                application={application}
                isArchived={isArchivedManually}
                onUpdated={handleUpdated}
              />
              <NotesSection
                applicationId={application.id}
                currentNotes={application.notes}
                events={application.events}
                onUpdated={handleUpdated}
              />
            </div>

            {/* Right column */}
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              <DetalhesCard application={application} />

              <Timeline
                events={application.events}
                scoreBefore={application.scoreBefore}
                scoreAfter={application.scoreAfter}
                cvAdaptations={application.cvAdaptations}
              />
            </div>
          </div>
        </div>

        {/* Hired celebration modal */}
        {showHiredModal && (
          <HiredCelebrationModal
            applicationId={application.id}
            companyName={application.companyName}
            jobTitle={application.jobTitle}
            onClose={() => setShowHiredModal(false)}
            onUpdated={handleUpdated}
          />
        )}

        {/* Rejection feedback modal */}
        {showRejectionModal && (
          <RejectionFeedbackModal
            applicationId={application.id}
            companyName={application.companyName}
            jobTitle={application.jobTitle}
            onClose={() => setShowRejectionModal(false)}
            onUpdated={handleUpdated}
          />
        )}

        {/* Interview schedule modal */}
        {showInterviewModal && (
          <InterviewScheduleModal
            applicationId={application.id}
            onClose={() => setShowInterviewModal(false)}
            onUpdated={handleUpdated}
          />
        )}

        {/* Job URL modal */}
        {showUrlModal && (
          <JobUrlModal
            applicationId={application.id}
            currentUrl={application.jobUrl}
            onClose={() => setShowUrlModal(false)}
            onUpdated={handleUpdated}
          />
        )}

        {/* Delete confirmation modal */}
        {confirmDelete && (
          <div
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
              role="dialog"
              aria-modal="true"
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
                Confirmar exclusão
              </p>
              <p
                style={{
                  margin: "0 0 14px",
                  fontSize: 13.5,
                  color: "#55524d",
                  lineHeight: 1.45,
                }}
              >
                Esta candidatura será removida e não poderá ser restaurada.
              </p>
              <div
                style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}
              >
                <button
                  type="button"
                  onClick={closeDeleteModal}
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
                  {deleting ? "Excluindo..." : "Confirmar exclusão"}
                </button>
              </div>
            </div>
          </div>
        )}

        <style>{`
          @media (max-width: 760px) {
            .candidatura-grid { grid-template-columns: 1fr !important; }
          }
          .timeline-scroll::-webkit-scrollbar { display: none; }
        `}</style>
      </main>

      <PublicFooter />

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
