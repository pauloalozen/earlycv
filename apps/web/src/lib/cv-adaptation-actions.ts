import type { CvAdaptationStatus, PaymentStatus } from "@prisma/client";

export type HistoryAdaptationItem = {
  id: string;
  status: CvAdaptationStatus;
  paymentStatus: PaymentStatus;
};

export function getHistoryActions(item: HistoryAdaptationItem) {
  const resultHref = `/adaptar/${item.id}/resultado`;

  return {
    resultHref,
    pdfHref: `/api/cv-adaptation/${item.id}/download?format=pdf`,
    docxHref: `/api/cv-adaptation/${item.id}/download?format=docx`,
    canDownload: item.status === "delivered",
    isProcessing: item.status === "analyzing" || item.status === "paid",
  };
}
