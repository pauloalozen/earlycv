"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { DownloadProgressOverlay } from "@/components/download-progress-overlay";
import {
  type DownloadProgressStage,
  downloadFromApi,
} from "@/lib/client-download";
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
  hasCredits: boolean | null;
};

export function HistoryActionLinks({ actions, hasCredits }: Props) {
  const router = useRouter();
  const [openingReview, setOpeningReview] = useState(false);
  const [redeeming, setRedeeming] = useState(false);
  const [downloading, setDownloading] = useState<"pdf" | "docx" | null>(null);
  const [downloadStage, setDownloadStage] =
    useState<DownloadProgressStage | null>(null);
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
    </div>
  );
}
