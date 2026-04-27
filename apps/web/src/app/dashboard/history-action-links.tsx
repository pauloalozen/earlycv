"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
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
    pdfHref: string;
    docxHref: string;
    canDownload: boolean;
    canRedeem: boolean;
    isProcessing: boolean;
  };
  adjustments: DashboardAdjustmentsData;
  analysisContext: {
    jobTitle: string | null;
    masterResumeTitle: string | null;
  };
  hasCredits: boolean | null;
};

const GEIST = "var(--font-geist), -apple-system, system-ui, sans-serif";
const GEIST_MONO = "var(--font-geist-mono), monospace";

export function HistoryActionLinks({
  actions,
  adjustments,
  analysisContext,
  hasCredits,
}: Props) {
  const router = useRouter();
  const [openingReview, setOpeningReview] = useState(false);
  const [redeeming, setRedeeming] = useState(false);
  const [downloading, setDownloading] = useState<"pdf" | "docx" | null>(null);
  const [downloadStage, setDownloadStage] =
    useState<DownloadProgressStage | null>(null);
  const [isClient, setIsClient] = useState(false);
  const [isAdjustmentsOpen, setIsAdjustmentsOpen] = useState(false);
  const [adjustmentsVisible, setAdjustmentsVisible] = useState(false);
  const chipClassName =
    "inline-flex h-8 appearance-none items-center justify-center whitespace-nowrap rounded-[10px] border border-[#DADADA] bg-white px-3 [font-family:var(--font-sans)] text-xs leading-none font-semibold transition-colors hover:border-[#BEBEBE]";
  const primaryChipClassName =
    "inline-flex h-8 appearance-none items-center justify-center whitespace-nowrap rounded-[10px] border border-[#111111] bg-[#111111] px-3 [font-family:var(--font-sans)] text-xs leading-none font-semibold transition-colors hover:bg-[#1F1F1F] disabled:opacity-75";
  const sharedChipTextStyle = {
    fontFamily: "var(--font-sans)",
    fontSize: "12px",
    fontWeight: 600,
    lineHeight: 1,
  } as const;
  const showAdjustmentsAction = shouldShowAdjustmentsAction({
    canDownload: actions.canDownload,
    notes: adjustments.notes,
    scoreBefore: adjustments.scoreBefore,
    scoreFinal: adjustments.scoreFinal,
  });

  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
    if (!isClient || !isAdjustmentsOpen) return;

    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setAdjustmentsVisible(false);
        setTimeout(() => setIsAdjustmentsOpen(false), 240);
      }
    };

    const previousOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    window.addEventListener("keydown", onEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
      window.removeEventListener("keydown", onEscape);
    };
  }, [isAdjustmentsOpen, isClient]);

  const closeAdjustmentsPopup = () => {
    setAdjustmentsVisible(false);
    setTimeout(() => setIsAdjustmentsOpen(false), 240);
  };

  const openAdjustmentsPopup = () => {
    setIsAdjustmentsOpen(true);
    requestAnimationFrame(() => setAdjustmentsVisible(true));
  };

  return (
    <div className="history-actions mt-3 flex flex-wrap gap-2">
      <style>{`
        @media (max-width: 640px) {
          .history-actions { display: grid !important; grid-template-columns: 1fr 1fr; }
          .history-actions > * { width: 100%; justify-content: center; }
        }
      `}</style>
      <a
        href={actions.resultHref}
        onClick={(event) => {
          event.preventDefault();
          if (openingReview) return;
          setOpeningReview(true);
          router.push(actions.resultHref);
        }}
        aria-disabled={openingReview}
        style={{ color: "#111111", ...sharedChipTextStyle }}
        className={`${chipClassName} ${openingReview ? "cursor-not-allowed opacity-75" : ""}`}
      >
        {getReviewActionCopy(openingReview)}
      </a>

      {actions.canDownload ? (
        <>
          {showAdjustmentsAction ? (
            <button
              type="button"
              onClick={openAdjustmentsPopup}
              style={{
                color: "#ffffff",
                borderColor: "#111111",
                background: "#111111",
                ...sharedChipTextStyle,
                fontFamily: GEIST,
              }}
              className={chipClassName}
            >
              Ajustes feitos
            </button>
          ) : null}
          <button
            type="button"
            onClick={async () => {
              if (downloading) return;
              setDownloading("pdf");
              try {
                await downloadFromApi({
                  url: actions.pdfHref,
                  fallbackFilename: "cv-adaptado.pdf",
                  onStageChange: setDownloadStage,
                });
              } finally {
                setDownloading(null);
                setDownloadStage(null);
              }
            }}
            style={{ color: "#111111", ...sharedChipTextStyle }}
            className={chipClassName}
            disabled={Boolean(downloading)}
          >
            Baixar PDF
          </button>
          <button
            type="button"
            onClick={async () => {
              if (downloading) return;
              setDownloading("docx");
              try {
                await downloadFromApi({
                  url: actions.docxHref,
                  fallbackFilename: "cv-adaptado.docx",
                  onStageChange: setDownloadStage,
                });
              } finally {
                setDownloading(null);
                setDownloadStage(null);
              }
            }}
            style={{ color: "#111111", ...sharedChipTextStyle }}
            className={chipClassName}
            disabled={Boolean(downloading)}
          >
            Baixar DOCX
          </button>
        </>
      ) : actions.isProcessing ? (
        <span className="rounded-[10px] bg-[#F2F2F2] px-3 py-1.5 text-xs font-semibold text-[#666666]">
          Análise em processamento...
        </span>
      ) : actions.canRedeem && hasCredits ? (
        <button
          type="button"
          onClick={async () => {
            if (redeeming) return;
            setRedeeming(true);
            try {
              const response = await fetch(actions.redeemHref, {
                method: "POST",
                cache: "no-store",
              });
              if (!response.ok) {
                throw new Error("Falha ao liberar CV");
              }
              router.push(actions.resultHref);
            } catch {
              setRedeeming(false);
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
          {redeeming ? "Liberando..." : "Liberar CV · 1 Crédito"}
        </button>
      ) : (
        <a
          href="/planos"
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
      {isClient &&
        isAdjustmentsOpen &&
        createPortal(
          <div
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 120,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "rgba(10,10,10,0.5)",
              padding: "0 16px",
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
              role="dialog"
              aria-modal="true"
              aria-labelledby="dashboard-ajustes-feitos-title"
              style={{
                position: "relative",
                width: "100%",
                maxWidth: 560,
                background: "#fafaf6",
                fontFamily: GEIST,
                border: "1px solid rgba(10,10,10,0.08)",
                borderRadius: 18,
                padding: "24px",
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
                <a
                  href={actions.resultHref}
                  onClick={closeAdjustmentsPopup}
                  style={{
                    background: "#0a0a0a",
                    color: "#fafaf6",
                    border: "1px solid #0a0a0a",
                    borderRadius: 10,
                    padding: "10px 16px",
                    fontSize: 13,
                    fontWeight: 500,
                    textDecoration: "none",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontFamily: GEIST,
                  }}
                >
                  Ver análise completa →
                </a>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
