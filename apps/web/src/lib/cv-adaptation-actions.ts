type CvAdaptationStatus =
  | "pending"
  | "analyzing"
  | "awaiting_payment"
  | "paid"
  | "delivered"
  | "failed";
type PaymentStatus = "none" | "pending" | "completed" | "failed" | "refunded";

export type HistoryAdaptationItem = {
  id: string;
  status: CvAdaptationStatus;
  paymentStatus: PaymentStatus;
  canDownloadBaseCv: boolean;
  baseCvDownloadKind:
    | "original_file"
    | "markdown_snapshot"
    | "unavailable_legacy";
};

export function getHistoryActions(
  item: HistoryAdaptationItem,
  selectedMissingKeywords: string[] = [],
) {
  const resultHref = `/adaptar/resultado?adaptationId=${item.id}`;
  const redeemHref = `/api/cv-adaptation/${item.id}/redeem-credit`;

  return {
    resultHref,
    redeemHref,
    plansHref: `/planos?aid=${item.id}&source=resultado-buy-credits`,
    pdfHref: `/api/cv-adaptation/${item.id}/download?format=pdf`,
    docxHref: `/api/cv-adaptation/${item.id}/download?format=docx`,
    baseCvHref: `/api/cv-adaptation/${item.id}/base-cv`,
    canDownloadBaseCv: item.canDownloadBaseCv,
    baseCvDownloadKind: item.baseCvDownloadKind,
    canDownload: item.paymentStatus === "completed",
    canRedeem:
      item.paymentStatus !== "completed" &&
      item.status !== "analyzing" &&
      item.status !== "failed",
    isProcessing: item.status === "analyzing",
    ...(selectedMissingKeywords.length > 0
      ? { selectedMissingKeywords }
      : {}),
  };
}
