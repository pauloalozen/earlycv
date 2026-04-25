type CvAdaptationStatus = "pending" | "analyzing" | "awaiting_payment" | "paid" | "delivered" | "failed";
type PaymentStatus = "none" | "pending" | "completed" | "failed" | "refunded";

export type HistoryAdaptationItem = {
  id: string;
  status: CvAdaptationStatus;
  paymentStatus: PaymentStatus;
};

export function getHistoryActions(item: HistoryAdaptationItem) {
  const resultHref = `/adaptar/resultado?adaptationId=${item.id}`;
  const redeemHref = `/api/cv-adaptation/${item.id}/redeem-credit`;

  return {
    resultHref,
    redeemHref,
    pdfHref: `/api/cv-adaptation/${item.id}/download?format=pdf`,
    docxHref: `/api/cv-adaptation/${item.id}/download?format=docx`,
    canDownload: item.paymentStatus === "completed",
    canRedeem:
      item.paymentStatus !== "completed" &&
      item.status !== "analyzing" &&
      item.status !== "failed",
    isProcessing: item.status === "analyzing",
  };
}
