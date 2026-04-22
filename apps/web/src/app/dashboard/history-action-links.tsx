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
  const GEIST = "var(--font-geist), -apple-system, system-ui, sans-serif";
  const GREEN_HIGHLIGHT = "#c6ff3a";
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
    <div className="mt-3 flex flex-wrap gap-2">
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
              background: "rgba(10,10,10,0.35)",
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
                background: "#fff",
                fontFamily: GEIST,
                border: "1px solid rgba(10,10,10,0.08)",
                borderRadius: 20,
                padding: "24px",
                boxShadow: "0 24px 60px -20px rgba(10,10,10,0.35)",
                transition: "all 240ms ease-out",
                opacity: adjustmentsVisible ? 1 : 0,
                transform: adjustmentsVisible
                  ? "translateY(0) scale(1)"
                  : "translateY(8px) scale(0.98)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  justifyContent: "space-between",
                  gap: 12,
                  marginBottom: 12,
                }}
              >
                <div>
                  <h3
                    id="dashboard-ajustes-feitos-title"
                    style={{
                      fontSize: 18,
                      fontWeight: 500,
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
                  onClick={closeAdjustmentsPopup}
                  aria-label="Fechar ajustes feitos"
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
                    flexShrink: 0,
                  }}
                >
                  ×
                </button>
              </div>

              <div
                style={{
                  background: "#f7f7f4",
                  border: "1px solid rgba(10,10,10,0.08)",
                  borderRadius: 12,
                  padding: "10px 12px",
                  marginBottom: 14,
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                }}
              >
                <p
                  style={{
                    fontSize: 11,
                    color: "#8a8a85",
                    margin: 0,
                    textTransform: "uppercase",
                    letterSpacing: 0.5,
                    fontWeight: 600,
                  }}
                >
                  Contexto da analise
                </p>
                <p style={{ fontSize: 13, color: "#0a0a0a", margin: 0 }}>
                  <strong>Vaga:</strong>{" "}
                  {analysisContext.jobTitle ?? "Vaga sem titulo"}
                </p>
                <p style={{ fontSize: 13, color: "#0a0a0a", margin: 0 }}>
                  <strong>CV master usado:</strong>{" "}
                  {analysisContext.masterResumeTitle ?? "Nao identificado"}
                </p>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 10,
                  marginBottom: 14,
                }}
              >
                <div
                  style={{
                    background: "#f7f7f4",
                    border: "1px solid rgba(10,10,10,0.08)",
                    borderRadius: 12,
                    padding: "12px 14px",
                  }}
                >
                  <p
                    style={{
                      fontSize: 11,
                      color: "#8a8a85",
                      margin: "0 0 4px",
                    }}
                  >
                    Score antes
                  </p>
                  <p
                    style={{
                      fontSize: 24,
                      fontWeight: 500,
                      margin: 0,
                      color: "#0a0a0a",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {adjustments.scoreBefore !== null
                      ? `${adjustments.scoreBefore}%`
                      : "--"}
                  </p>
                </div>
                <div
                  style={{
                    background: "rgba(198,255,58,0.16)",
                    border: `1px solid ${GREEN_HIGHLIGHT}`,
                    borderRadius: 12,
                    padding: "12px 14px",
                  }}
                >
                  <p
                    style={{
                      fontSize: 11,
                      color: "#4f5f16",
                      margin: "0 0 4px",
                    }}
                  >
                    Score final apos ajustes
                  </p>
                  <p
                    style={{
                      fontSize: 24,
                      fontWeight: 500,
                      margin: 0,
                      color: "#2f3f00",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {adjustments.scoreFinal !== null
                      ? `${adjustments.scoreFinal}%`
                      : "--"}
                  </p>
                </div>
              </div>

              <div
                style={{
                  borderLeft: `3px solid ${GREEN_HIGHLIGHT}`,
                  paddingLeft: 12,
                  marginBottom: 18,
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                }}
              >
                <p
                  style={{
                    fontSize: 11,
                    letterSpacing: 0.6,
                    color: "#4f5f16",
                    margin: 0,
                    textTransform: "uppercase",
                    fontWeight: 600,
                  }}
                >
                  O que foi feito no seu CV
                </p>
                <p
                  style={{
                    fontSize: 13.5,
                    color: "#3f3f3c",
                    lineHeight: 1.6,
                    margin: 0,
                  }}
                >
                  {adjustments.notes ??
                    "Nesta análise, o score e os ajustes aplicados foram registrados sem texto descritivo adicional."}
                </p>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    type="button"
                    onClick={closeAdjustmentsPopup}
                    style={{
                      background: "#ffffff",
                      color: "#111111",
                      border: "1px solid rgba(10,10,10,0.14)",
                      borderRadius: 10,
                      padding: "10px 14px",
                      fontSize: 12,
                      fontWeight: 600,
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
                      background: "#111111",
                      color: "#ffffff",
                      border: "1px solid #111111",
                      borderRadius: 10,
                      padding: "10px 14px",
                      fontSize: 12,
                      fontWeight: 600,
                      textDecoration: "none",
                      lineHeight: 1,
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontFamily: GEIST,
                    }}
                  >
                    Ver analise completa
                  </a>
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
