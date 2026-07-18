import assert from "node:assert/strict";
import { test } from "node:test";
import type { CvAdaptation } from "@prisma/client";

import { createCvAdaptationResponseDto } from "./cv-adaptation-response.dto";

function buildBaseAdaptation(): CvAdaptation {
  return {
    id: "adapt-1",
    userId: "user-1",
    masterResumeId: null,
    templateId: null,
    canonicalJobId: null,
    jobRequirementSetId: null,
    adaptationSource: "uploaded_content",
    inputMode: "file_upload",
    jobDescriptionText: "Vaga de teste",
    jobTitle: null,
    companyName: null,
    status: "delivered",
    adaptedContentJson: null,
    previewText: null,
    adaptedResumeId: null,
    aiAuditJson: null,
    editedCvJson: null,
    paymentStatus: "none",
    paymentProvider: null,
    paymentReference: null,
    paymentAmountInCents: null,
    paymentCurrency: "BRL",
    paidAt: null,
    mpPaymentId: null,
    mpMerchantOrderId: null,
    mpPreferenceId: null,
    failureReason: null,
    isUnlocked: false,
    unlockedAt: null,
    analysisCvSnapshotId: null,
    userProfileSnapshotJson: null,
    uploadedContentSnapshotJson: null,
    analysisInputSnapshotJson: null,
    generationInputSnapshotJson: null,
    createdAt: new Date("2026-07-18T12:00:00.000Z"),
    updatedAt: new Date("2026-07-18T12:00:00.000Z"),
    jobApplicationId: null,
  };
}

test("sourceCvFileName comes from the analysis snapshot, never from the live masterResume, when a snapshot exists", () => {
  const dto = createCvAdaptationResponseDto({
    ...buildBaseAdaptation(),
    analysisCvSnapshotId: "snap-1",
    // masterResume ainda existe e tem um título diferente do snapshot —
    // o snapshot deve vencer sempre que presente, mesmo com o resume vivo.
    masterResume: { title: "CV Master atual", sourceFileName: "atual.pdf" },
    analysisCvSnapshot: {
      sourceType: "uploaded_file",
      originalFileStorageKey: "snapshots/cv.pdf",
      originalFileName: "cv-usado-na-analise.pdf",
    },
  });

  assert.equal(dto.sourceCvFileName, "cv-usado-na-analise.pdf");
});

test("sourceCvFileName survives the master resume being deleted (masterResume: null via SetNull)", () => {
  const dto = createCvAdaptationResponseDto({
    ...buildBaseAdaptation(),
    analysisCvSnapshotId: "snap-1",
    masterResumeId: null,
    masterResume: null,
    analysisCvSnapshot: {
      sourceType: "uploaded_file",
      originalFileStorageKey: "snapshots/cv.pdf",
      originalFileName: "cv-usado-na-analise.pdf",
    },
  });

  assert.equal(dto.sourceCvFileName, "cv-usado-na-analise.pdf");
  assert.equal(dto.canDownloadBaseCv, true);
});

test("sourceCvFileName falls back to masterResume only for legacy adaptations without a snapshot", () => {
  const dto = createCvAdaptationResponseDto({
    ...buildBaseAdaptation(),
    analysisCvSnapshotId: null,
    masterResume: { title: "CV Master antigo", sourceFileName: null },
    analysisCvSnapshot: null,
  });

  assert.equal(dto.sourceCvFileName, "CV Master antigo");
  assert.equal(dto.baseCvDownloadKind, "unavailable_legacy");
});

test("sourceCvFileName is null when there is neither a snapshot nor a master resume left", () => {
  const dto = createCvAdaptationResponseDto({
    ...buildBaseAdaptation(),
    analysisCvSnapshotId: null,
    masterResume: null,
    analysisCvSnapshot: null,
  });

  assert.equal(dto.sourceCvFileName, null);
});
