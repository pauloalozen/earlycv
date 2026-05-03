"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  CvReleaseModal,
  type CvReleaseModalStatus,
} from "@/components/cv-release-modal";
import { DownloadProgressOverlay } from "@/components/download-progress-overlay";
import {
  type DownloadProgressStage,
  downloadFromApi,
} from "@/lib/client-download";
import {
  type DashboardAdjustmentsData,
  shouldShowAdjustmentsAction,
} from "@/lib/dashboard-adjustments";
import { getReviewActionCopy } from "@/lib/review-action-copy";

type Props = {
  actions: {
    resultHref: string;
    redeemHref: string;
    plansHref: string;
    pdfHref: string;
    docxHref: string;
    baseCvHref: string;
    canDownloadBaseCv: boolean;
    baseCvDownloadKind:
      | "original_file"
      | "markdown_snapshot"
      | "unavailable_legacy";
    canDownload: boolean;
    canRedeem: boolean;
    isProcessing: boolean;
    selectedMissingKeywords?: string[];
  };
  adjustments: DashboardAdjustmentsData;
  analysisContext: {
    jobTitle: string | null;
    masterResumeTitle: string | null;
  };
  hasCredits: boolean | null;
  hideBaseCvAction?: boolean;
  removeTopMargin?: boolean;
};

const GEIST = "var(--font-geist), -apple-system, system-ui, sans-serif";
const GEIST_MONO = "var(--font-geist-mono), monospace";

const MIN_RELEASE_LOADING_MS = 3000;
const REDEEM_REQUEST_TIMEOUT_MS = 15_000;
const CREDIT_REDEEMED_EVENT = "dashboard:credit-redeemed";

const buildRedeemSessionKey = (redeemHref: string) =>
  `dashboard-cv-redeemed:${redeemHref}`;

const waitForMinimumDuration = async (startedAt: number, minMs: number) => {
  const elapsed = Date.now() - startedAt;
  if (elapsed >= minMs) return;
  await new Promise((resolve) => setTimeout(resolve, minMs - elapsed));
};

function ActionIcon({
  kind,
}: {
  kind: "review" | "download" | "unlock" | "edit";
}) {
  if (kind === "review") {
    return (
      <svg
        aria-hidden="true"
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    );
  }

  if (kind === "unlock") {
    return (
      <svg
        aria-hidden="true"
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="4" y="11" width="16" height="10" rx="2" ry="2" />
        <path d="M8 11V8a4 4 0 1 1 8 0" />
      </svg>
    );
  }

  if (kind === "edit") {
    return (
      <svg
        aria-hidden="true"
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
      </svg>
    );
  }

  return (
    <svg
      aria-hidden="true"
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 3v12" />
      <path d="m7 10 5 5 5-5" />
      <path d="M5 21h14" />
    </svg>
  );
}

export function HistoryActionLinks({
  actions,
  adjustments,
  analysisContext,
  hasCredits,
  hideBaseCvAction = false,
  removeTopMargin = false,
}: Props) {
  const router = useRouter();
  const [openingReview, setOpeningReview] = useState(false);
  const [redeeming, setRedeeming] = useState(false);
  const [downloading, setDownloading] = useState<"pdf" | "docx" | null>(null);
  const [downloadingBaseCv, setDownloadingBaseCv] = useState(false);
  const [downloadStage, setDownloadStage] =
    useState<DownloadProgressStage | null>(null);
  const [isClient, setIsClient] = useState(false);
  const [isAdjustmentsOpen, setIsAdjustmentsOpen] = useState(false);
  const [adjustmentsVisible, setAdjustmentsVisible] = useState(false);
  const [releaseModalOpen, setReleaseModalOpen] = useState(false);
  const [releaseModalVisible, setReleaseModalVisible] = useState(false);
  const [releaseStatus, setReleaseStatus] =
    useState<CvReleaseModalStatus>("loading");
  const [releaseError, setReleaseError] = useState<string | null>(null);
  const [wasRedeemedInSession, setWasRedeemedInSession] = useState(false);
  const redeemInFlightRef = useRef(false);
  const isMountedRef = useRef(true);
  const adjustmentsCloseTimeoutRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);
  const releaseCloseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const redeemAbortControllerRef = useRef<AbortController | null>(null);
  const releaseWatchdogTimeoutRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);
  const adjustmentsDialogRef = useRef<HTMLDivElement | null>(null);
  const adjustmentsCloseButtonRef = useRef<HTMLButtonElement | null>(null);
  const adjustmentsTriggerRef = useRef<HTMLButtonElement | null>(null);
  const chipClassName =
    "inline-flex h-8 w-full appearance-none items-center justify-center gap-1.5 whitespace-nowrap rounded-[10px] border border-[#DADADA] bg-white px-3 [font-family:var(--font-sans)] text-xs leading-none font-semibold transition-colors hover:border-[#BEBEBE] sm:w-auto";
  const primaryChipClassName =
    "inline-flex h-8 w-full appearance-none items-center justify-center gap-1.5 whitespace-nowrap rounded-[10px] border border-[#111111] bg-[#111111] px-3 [font-family:var(--font-sans)] text-xs leading-none font-semibold transition-colors hover:bg-[#1F1F1F] disabled:opacity-75 sm:w-auto";
  const sharedChipTextStyle = {
    fontFamily: "var(--font-sans)",
    fontSize: "12px",
    fontWeight: 600,
    lineHeight: 1,
  } as const;
  const canDownloadNow = actions.canDownload || wasRedeemedInSession;
  const canRedeemNow = actions.canRedeem && !wasRedeemedInSession;

  const showAdjustmentsAction = shouldShowAdjustmentsAction({
    canDownload: canDownloadNow,
    notes: adjustments.notes,
    scoreBefore: adjustments.scoreBefore,
    scoreFinal: adjustments.scoreFinal,
  });

  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
    if (!isClient) return;
    try {
      const cached = sessionStorage.getItem(
        buildRedeemSessionKey(actions.redeemHref),
      );
      if (cached === "1") {
        setWasRedeemedInSession(true);
      }
    } catch {
      // no-op
    }
  }, [actions.redeemHref, isClient]);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      if (adjustmentsCloseTimeoutRef.current) {
        clearTimeout(adjustmentsCloseTimeoutRef.current);
      }
      if (releaseCloseTimeoutRef.current) {
        clearTimeout(releaseCloseTimeoutRef.current);
      }
      if (redeemAbortControllerRef.current) {
        redeemAbortControllerRef.current.abort();
      }
      if (releaseWatchdogTimeoutRef.current) {
        clearTimeout(releaseWatchdogTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!releaseModalOpen || releaseStatus !== "loading") return;
    if (releaseWatchdogTimeoutRef.current) {
      clearTimeout(releaseWatchdogTimeoutRef.current);
    }

    releaseWatchdogTimeoutRef.current = setTimeout(() => {
      if (!isMountedRef.current) return;
      setReleaseStatus("error");
      setReleaseError(
        "A liberacao esta demorando mais do que o esperado. Tente novamente.",
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

  useEffect(() => {
    if (!isClient || !isAdjustmentsOpen) return;

    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setAdjustmentsVisible(false);
        if (adjustmentsCloseTimeoutRef.current) {
          clearTimeout(adjustmentsCloseTimeoutRef.current);
        }
        adjustmentsCloseTimeoutRef.current = setTimeout(() => {
          if (!isMountedRef.current) return;
          setIsAdjustmentsOpen(false);
        }, 240);
        return;
      }

      if (event.key === "Tab") {
        const root = adjustmentsDialogRef.current;
        if (!root) return;

        const focusables = root.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        );
        if (focusables.length === 0) return;

        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        const current = document.activeElement as HTMLElement | null;

        if (event.shiftKey && current === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && current === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };

    const previousOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    window.addEventListener("keydown", onEscape);
    requestAnimationFrame(() => adjustmentsCloseButtonRef.current?.focus());

    return () => {
      document.body.style.overflow = previousOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
      window.removeEventListener("keydown", onEscape);
    };
  }, [isAdjustmentsOpen, isClient]);

  const closeAdjustmentsPopup = () => {
    setAdjustmentsVisible(false);
    if (adjustmentsCloseTimeoutRef.current) {
      clearTimeout(adjustmentsCloseTimeoutRef.current);
    }
    adjustmentsCloseTimeoutRef.current = setTimeout(() => {
      if (!isMountedRef.current) return;
      setIsAdjustmentsOpen(false);
      adjustmentsTriggerRef.current?.focus();
    }, 240);
  };

  const openAdjustmentsPopup = () => {
    setIsAdjustmentsOpen(true);
    requestAnimationFrame(() => setAdjustmentsVisible(true));
  };

  const closeReleaseModal = () => {
    setReleaseModalVisible(false);
    if (releaseCloseTimeoutRef.current) {
      clearTimeout(releaseCloseTimeoutRef.current);
    }
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
        url: format === "pdf" ? actions.pdfHref : actions.docxHref,
        fallbackFilename:
          format === "pdf" ? "cv-adaptado.pdf" : "cv-adaptado.docx",
        onStageChange: setDownloadStage,
      });
    } finally {
      if (isMountedRef.current) {
        setDownloading(null);
        setDownloadStage(null);
      }
    }
  };

  const handleDownloadBaseCv = async () => {
    if (downloadingBaseCv) return;
    setDownloadingBaseCv(true);
    try {
      await downloadFromApi({
        url: actions.baseCvHref,
        fallbackFilename:
          actions.baseCvDownloadKind === "markdown_snapshot"
            ? "cv-base-analise.md"
            : "cv-base-analise",
        onStageChange: setDownloadStage,
      });
    } finally {
      if (isMountedRef.current) {
        setDownloadingBaseCv(false);
        setDownloadStage(null);
      }
    }
  };

  return (
    <div
      className={`history-actions mt-3 grid w-full grid-cols-2 gap-2 sm:mt-0 sm:flex sm:w-auto sm:flex-wrap ${removeTopMargin ? "mt-0" : ""}`}
    >
      <button
        type="button"
        onClick={() => {
          if (openingReview) return;
          setOpeningReview(true);
          router.push(actions.resultHref);
        }}
        aria-disabled={openingReview}
        style={{ color: "#111111", ...sharedChipTextStyle }}
        className={`${chipClassName} ${openingReview ? "cursor-not-allowed opacity-75" : ""}`}
      >
        <span aria-hidden="true" style={{ display: "inline-flex" }}>
          <ActionIcon kind="review" />
        </span>
        {getReviewActionCopy(openingReview)}
      </button>

      {!hideBaseCvAction && actions.canDownloadBaseCv ? (
        <button
          type="button"
          onClick={handleDownloadBaseCv}
          title="Baixa o CV base usado na analise e adaptacao (apenas para conferencia)."
          style={{ color: "#111111", ...sharedChipTextStyle }}
          className={chipClassName}
          disabled={downloadingBaseCv}
        >
          <span aria-hidden="true" style={{ display: "inline-flex" }}>
            <ActionIcon kind="download" />
          </span>
          Baixar CV usado na análise
        </button>
      ) : null}

      {canDownloadNow ? (
        <>
          <button
            type="button"
            onClick={() => handleDownload("pdf")}
            style={{ color: "#111111", ...sharedChipTextStyle }}
            className={chipClassName}
            disabled={Boolean(downloading)}
          >
            <span aria-hidden="true" style={{ display: "inline-flex" }}>
              <ActionIcon kind="download" />
            </span>
            Baixar PDF
          </button>
          <button
            type="button"
            onClick={() => handleDownload("docx")}
            style={{ color: "#111111", ...sharedChipTextStyle }}
            className={chipClassName}
            disabled={Boolean(downloading)}
          >
            <span aria-hidden="true" style={{ display: "inline-flex" }}>
              <ActionIcon kind="download" />
            </span>
            Baixar DOCX
          </button>
          {showAdjustmentsAction ? (
            <button
              type="button"
              onClick={openAdjustmentsPopup}
              ref={adjustmentsTriggerRef}
              style={{
                color: "#ffffff",
                borderColor: "#111111",
                background: "#111111",
                ...sharedChipTextStyle,
                fontFamily: GEIST,
              }}
              className={chipClassName}
            >
              <span aria-hidden="true" style={{ display: "inline-flex" }}>
                <ActionIcon kind="edit" />
              </span>
              Ajustes feitos
            </button>
          ) : null}
        </>
      ) : actions.isProcessing ? (
        <span className="rounded-[10px] bg-[#F2F2F2] px-3 py-1.5 text-xs font-semibold text-[#666666]">
          Análise em processamento...
        </span>
      ) : canRedeemNow && hasCredits ? (
        <button
          type="button"
          onClick={async () => {
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
            const timeoutId = setTimeout(() => controller.abort(), REDEEM_REQUEST_TIMEOUT_MS);

            try {
              const redeemRequest = fetch(actions.redeemHref, {
                method: "POST",
                cache: "no-store",
                signal: controller.signal,
                ...(actions.selectedMissingKeywords?.length
                  ? {
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        selectedMissingKeywords:
                          actions.selectedMissingKeywords,
                      }),
                    }
                  : {}),
              });

              const response = (await Promise.race([
                redeemRequest,
                new Promise<Response>((_, reject) => {
                  setTimeout(() => {
                    reject(
                      new DOMException(
                        "Redeem request timeout",
                        "AbortError",
                      ),
                    );
                  }, REDEEM_REQUEST_TIMEOUT_MS + 500);
                }),
              ])) as Response;
              if (!response.ok) {
                let apiMessage = "Falha ao liberar CV";
                try {
                  const body = (await response.json()) as { message?: string };
                  if (typeof body.message === "string" && body.message.trim()) {
                    apiMessage = body.message;
                  }
                } catch {
                  // noop
                }
                throw new Error(apiMessage);
              }

              await waitForMinimumDuration(startedAt, MIN_RELEASE_LOADING_MS);
              if (!isMountedRef.current) return;
              setWasRedeemedInSession(true);
              try {
                sessionStorage.setItem(
                  buildRedeemSessionKey(actions.redeemHref),
                  "1",
                );
              } catch {
                // no-op
              }
              setReleaseStatus("success");
              window.dispatchEvent(new Event(CREDIT_REDEEMED_EVENT));
            } catch (error) {
              if (!isMountedRef.current) return;
              const message = (() => {
                if (
                  error instanceof DOMException &&
                  error.name === "AbortError"
                ) {
                  return "A liberacao demorou mais do que o esperado. Verifique sua conexao e tente novamente.";
                }
                if (error instanceof TypeError) {
                  return "Nao foi possivel conectar ao servidor. Verifique sua internet e tente novamente.";
                }
                if (error instanceof Error && error.message) {
                  return error.message;
                }
                return "Nao foi possivel liberar o CV agora. Tente novamente.";
              })();
              setReleaseStatus("error");
              setReleaseError(message);
            } finally {
              clearTimeout(timeoutId);
              if (redeemAbortControllerRef.current === controller) {
                redeemAbortControllerRef.current = null;
              }
              if (isMountedRef.current) {
                setRedeeming(false);
              }
              redeemInFlightRef.current = false;
            }
          }}
          style={{
            color: "#ffffff",
            textAlign: "center",
            ...sharedChipTextStyle,
          }}
          className={primaryChipClassName}
          disabled={redeeming}
        >
          <span aria-hidden="true" className="hidden sm:inline-flex">
            <ActionIcon kind="unlock" />
          </span>
          {redeeming ? "Liberando..." : "Liberar CV · 1 Crédito"}
        </button>
      ) : (
        <a
          href={actions.plansHref}
          style={{
            color: "#ffffff",
            ...sharedChipTextStyle,
          }}
          className="rounded-[10px] bg-[#111111] px-3 py-2.5 text-xs font-semibold"
        >
          Liberar CV · 1 Crédito
        </a>
      )}
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
        onDownloadPdf={() => handleDownload("pdf")}
        onDownloadDocx={() => handleDownload("docx")}
        downloading={downloading}
        canDownload={releaseStatus === "success"}
      />
      {isClient &&
        isAdjustmentsOpen &&
        createPortal(
          <div
            className="flex items-start justify-center overflow-y-auto p-4 sm:p-6 lg:items-center"
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 120,
              background: "rgba(10,10,10,0.5)",
              padding: "16px",
              transition: "opacity 240ms ease-out",
              opacity: adjustmentsVisible ? 1 : 0,
            }}
          >
            <button
              type="button"
              aria-label="Fechar ajustes feitos"
              onClick={closeAdjustmentsPopup}
              style={{
                position: "absolute",
                inset: 0,
                background: "none",
                border: "none",
                cursor: "pointer",
              }}
            />
            <div
              className="history-adjustments-modal w-full max-w-[560px] overflow-y-auto rounded-[18px] p-4 sm:p-6"
              role="dialog"
              aria-modal="true"
              aria-labelledby="dashboard-ajustes-feitos-title"
              ref={adjustmentsDialogRef}
              style={{
                position: "relative",
                maxHeight: "calc(100dvh - 32px)",
                background: "#fafaf6",
                fontFamily: GEIST,
                border: "1px solid rgba(10,10,10,0.08)",
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
                className="history-adjustments-scores flex-col sm:flex-row"
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
                    id="dashboard-ajustes-feitos-title"
                    style={{
                      fontSize: 18,
                      fontWeight: 500,
                      letterSpacing: "-0.4px",
                      color: "#0a0a0a",
                      margin: "0 0 4px",
                      fontFamily: GEIST,
                    }}
                  >
                    Ajustes feitos
                  </h3>
                  <p
                    style={{
                      fontSize: 13.5,
                      color: "#6a6560",
                      margin: 0,
                      fontFamily: GEIST,
                    }}
                  >
                    Resumo do que foi aplicado no seu CV para esta vaga.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={closeAdjustmentsPopup}
                  aria-label="Fechar"
                  ref={adjustmentsCloseButtonRef}
                  className="hidden sm:flex"
                  style={{
                    background: "rgba(10,10,10,0.05)",
                    border: "none",
                    borderRadius: 8,
                    width: 32,
                    height: 32,
                    cursor: "pointer",
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
                    fontFamily: GEIST_MONO,
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
                <p
                  style={{
                    fontSize: 13,
                    color: "#0a0a0a",
                    margin: 0,
                    fontFamily: GEIST,
                  }}
                >
                  <span style={{ fontWeight: 500 }}>Vaga:</span>{" "}
                  {analysisContext.jobTitle ?? "Vaga sem título"}
                </p>
                <p
                  style={{
                    fontSize: 13,
                    color: "#0a0a0a",
                    margin: 0,
                    fontFamily: GEIST,
                  }}
                >
                  <span style={{ fontWeight: 500 }}>CV master usado:</span>{" "}
                  {analysisContext.masterResumeTitle ?? "Não identificado"}
                </p>
              </div>

              {/* Score cards */}
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
                      fontFamily: GEIST_MONO,
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
                      fontFamily: GEIST,
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {adjustments.scoreBefore !== null
                      ? `${adjustments.scoreBefore}%`
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
                      fontFamily: GEIST_MONO,
                      fontSize: 9.5,
                      fontWeight: 500,
                      letterSpacing: 1,
                      textTransform: "uppercase",
                      color: "#405410",
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
                      color: "#405410",
                      fontFamily: GEIST,
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {adjustments.scoreFinal !== null
                      ? `${adjustments.scoreFinal}%`
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
                    fontFamily: GEIST_MONO,
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
                    fontFamily: GEIST,
                  }}
                >
                  {adjustments.notes ??
                    "Nesta análise, o score e os ajustes aplicados foram registrados sem texto descritivo adicional."}
                </p>
              </div>

              {/* Actions */}
              <div
                className="history-adjustments-actions flex-col sm:flex-row"
                style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}
              >
                <button
                  type="button"
                  onClick={closeAdjustmentsPopup}
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
                <button
                  type="button"
                  onClick={() => {
                    closeAdjustmentsPopup();
                    router.push(actions.resultHref);
                  }}
                  style={{
                    background: "#0a0a0a",
                    color: "#fafaf6",
                    border: "1px solid #0a0a0a",
                    borderRadius: 10,
                    padding: "10px 16px",
                    fontSize: 13,
                    fontWeight: 500,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontFamily: GEIST,
                    cursor: "pointer",
                  }}
                >
                  Ver análise completa →
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
