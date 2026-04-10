"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { getReviewActionCopy } from "@/lib/review-action-copy";

type Props = {
  actions: {
    resultHref: string;
    pdfHref: string;
    docxHref: string;
    canDownload: boolean;
    isProcessing: boolean;
  };
};

export function HistoryActionLinks({ actions }: Props) {
  const router = useRouter();
  const [openingReview, setOpeningReview] = useState(false);
  const chipClassName =
    "inline-flex h-8 items-center rounded-[10px] border border-[#DADADA] bg-white px-3 text-xs leading-none font-semibold transition-colors hover:border-[#BEBEBE]";

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
        style={{ color: "#111111" }}
        className={`${chipClassName} ${openingReview ? "cursor-not-allowed opacity-75" : ""}`}
      >
        {getReviewActionCopy(openingReview)}
      </a>

      {actions.canDownload ? (
        <>
          <a
            href={actions.pdfHref}
            style={{ color: "#111111" }}
            className={chipClassName}
          >
            Baixar PDF
          </a>
          <a
            href={actions.docxHref}
            style={{ color: "#111111" }}
            className={chipClassName}
          >
            Baixar DOCX
          </a>
        </>
      ) : actions.isProcessing ? (
        <span className="rounded-[10px] bg-[#F2F2F2] px-3 py-1.5 text-xs font-semibold text-[#666666]">
          Analise em processamento...
        </span>
      ) : (
        <span className="rounded-[10px] bg-[#F2F2F2] px-3 py-1.5 text-xs font-semibold text-[#666666]">
          Aguardando pagamento
        </span>
      )}
    </div>
  );
}
