import type {
  AnalysisCvSnapshot,
  CvAdaptation,
  CvAdaptationStatus,
  PaymentStatus,
} from "@prisma/client";

export type CvAdaptationResponseDto = {
  id: string;
  status: CvAdaptationStatus;
  jobTitle: string | null;
  companyName: string | null;
  previewText: string | null;
  masterResumeId: string;
  templateId: string | null;
  template: {
    id: string;
    name: string;
    slug: string;
  } | null;
  paymentStatus: PaymentStatus;
  paidAt: string | null;
  isUnlocked: boolean;
  unlockedAt: string | null;
  adaptedResumeId: string | null;
  analysisCvSnapshotId: string | null;
  canDownloadBaseCv: boolean;
  baseCvDownloadKind:
    | "original_file"
    | "markdown_snapshot"
    | "unavailable_legacy";
  createdAt: string;
  updatedAt: string;
};

export const createCvAdaptationResponseDto = (
  adaptation: CvAdaptation & {
    template?: { id: string; name: string; slug: string } | null;
    analysisCvSnapshot?: Pick<
      AnalysisCvSnapshot,
      "sourceType" | "originalFileStorageKey"
    > | null;
  },
): CvAdaptationResponseDto => ({
  id: adaptation.id,
  status: adaptation.status,
  jobTitle: adaptation.jobTitle,
  companyName: adaptation.companyName,
  previewText: adaptation.previewText,
  masterResumeId: adaptation.masterResumeId,
  templateId: adaptation.templateId,
  template: adaptation.template
    ? {
        id: adaptation.template.id,
        name: adaptation.template.name,
        slug: adaptation.template.slug,
      }
    : null,
  paymentStatus: adaptation.paymentStatus,
  paidAt: adaptation.paidAt ? adaptation.paidAt.toISOString() : null,
  isUnlocked: adaptation.isUnlocked,
  unlockedAt: adaptation.unlockedAt ? adaptation.unlockedAt.toISOString() : null,
  adaptedResumeId: adaptation.adaptedResumeId,
  analysisCvSnapshotId: adaptation.analysisCvSnapshotId,
  canDownloadBaseCv: Boolean(adaptation.analysisCvSnapshotId),
  baseCvDownloadKind: adaptation.analysisCvSnapshotId
    ? adaptation.analysisCvSnapshot?.sourceType === "uploaded_file" &&
      adaptation.analysisCvSnapshot.originalFileStorageKey
      ? "original_file"
      : "markdown_snapshot"
    : "unavailable_legacy",
  createdAt: adaptation.createdAt.toISOString(),
  updatedAt: adaptation.updatedAt.toISOString(),
});
