// Fase 2E (docs/specs/2026-09-04-cv-canonical-profile-pipeline-plan.md,
// seção 4) — testes reais de banco (Postgres local, earlycv_test) do
// BRANCHING dentro de CvAdaptationService#claimGuestAnalysisJob: com a
// flag ligada E a AnalysisJob tendo cvProcessingJobId preenchido, o claim
// granular novo (ClaimSourceGrantService) roda ALÉM do claim legado
// (saveGuestPreview); sem cvProcessingJobId (mesmo com a flag ligada), ou
// com a flag desligada, o caminho é 100% legado — o serviço novo nunca é
// chamado. cv-adaptation.service.spec.ts (108 testes, banco fake) já
// cobre o comportamento legado bit a bit com a flag desligada; este
// arquivo cobre especificamente a decisão condicional, com um double
// espião no lugar do ClaimSourceGrantService real (o comportamento
// interno dele já está coberto por claim-source-grant.service.spec.ts).
process.env.CV_STRUCTURED_PROFILE_PIPELINE_ENABLED = "true";

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";

import { PrismaClient } from "@prisma/client";

import { DatabaseService } from "../database/database.service";
import { CvAdaptationService } from "./cv-adaptation.service";

const CvAdaptationServiceCtor = CvAdaptationService as unknown as new (
  ...args: unknown[]
) => CvAdaptationService;

const prisma = new PrismaClient();
const database = new DatabaseService(prisma);

class ClaimSourceGrantSpy {
  calls: Array<{
    userId: string;
    analysisJobId: string;
    cvProcessingJobId: string;
  }> = [];

  async claim(input: {
    userId: string;
    analysisJobId: string;
    cvProcessingJobId: string;
  }) {
    this.calls.push(input);
    return {
      cvSourceId: "n/a",
      grantCreated: true,
      equivalence: null,
      subject: null,
      master: null,
    };
  }
}

function buildService(claimSourceGrantService: ClaimSourceGrantSpy) {
  return new CvAdaptationServiceCtor(
    database, // database
    undefined, // _aiService
    undefined, // paymentService
    undefined, // pdfService
    undefined, // docxService
    undefined, // protectedAnalyzeService
    undefined, // storage
    undefined, // analysisTelemetry
    undefined, // jobApplicationsService
    undefined, // profileMergeService
    undefined, // profileReadinessService
    undefined, // jobCanonicalizationService
    undefined, // jobRequirementSetsService
    undefined, // talentProfileCapture
    undefined, // masterCvCanonicalExtractionService
    undefined, // funnelEvents
    undefined, // cvProcessingEntrypoint
    undefined, // cvMasterPromotionForAnalysis
    undefined, // talentSubjectService
    claimSourceGrantService, // claimSourceGrantService (Fase 2E)
  );
}

async function createUser() {
  return prisma.user.create({
    data: {
      email: `claim-canonical-branch+${randomUUID()}@example.com`,
      name: "Claim Canonical Branch Test",
    },
  });
}

async function createSucceededSnapshot() {
  return prisma.analysisCvSnapshot.create({
    data: {
      sourceType: "text_input",
      textStorageKey: `inline:${randomUUID()}`,
      textSha256: randomUUID(),
      textSizeBytes: 100,
      professionalProfileFingerprint: randomUUID(),
      professionalProfileJson: {},
    },
  });
}

async function createSucceededGuestAnalysisJob(input: {
  userId: string;
  snapshotId: string;
  cvProcessingJobId?: string;
  cvSubmissionId?: string;
}) {
  return prisma.analysisJob.create({
    data: {
      ownerKind: "guest",
      status: "succeeded",
      userId: input.userId,
      analysisCvSnapshotId: input.snapshotId,
      adaptedContentJson: { vaga: { cargo: "Analista", empresa: "Acme" } },
      previewText: "preview",
      masterCvText: "CV completo",
      jobDescriptionText:
        "Vaga com descricao suficientemente longa para passar na validacao interna.",
      jobTitle: "Analista",
      companyName: "Acme",
      cvProcessingJobId: input.cvProcessingJobId ?? null,
      cvSubmissionId: input.cvSubmissionId ?? null,
    },
  });
}

test("flag ligada + AnalysisJob SEM cvProcessingJobId: usa o caminho legado, ClaimSourceGrantService nunca é chamado", async () => {
  const user = await createUser();
  const snapshot = await createSucceededSnapshot();
  const job = await createSucceededGuestAnalysisJob({
    userId: user.id,
    snapshotId: snapshot.id,
  });

  const spy = new ClaimSourceGrantSpy();
  const service = buildService(spy);

  const result = await service.claimGuestAnalysisJob(user.id, job.id);

  assert.equal(result.status, "succeeded");
  assert.equal(spy.calls.length, 0);
});

test("flag ligada + AnalysisJob COM cvProcessingJobId: roda o claim granular novo ALÉM do legado (saveGuestPreview continua materializando o CvAdaptation)", async () => {
  const user = await createUser();
  const snapshot = await createSucceededSnapshot();

  const cvSource = await prisma.cvSource.create({
    data: {
      ownerType: "GUEST",
      talentSubjectId: (await prisma.talentSubject.create({ data: {} })).id,
      textStorageKey: "inline:x",
      textSha256: randomUUID(),
    },
  });
  const cvSubmission = await prisma.cvSubmission.create({
    data: { cvSourceId: cvSource.id, origin: "PASTED_TEXT" },
  });
  const cvProcessingJob = await prisma.cvProcessingJob.create({
    data: {
      cvSourceId: cvSource.id,
      cvSubmissionId: cvSubmission.id,
      status: "PENDING",
    },
  });

  const job = await createSucceededGuestAnalysisJob({
    userId: user.id,
    snapshotId: snapshot.id,
    cvProcessingJobId: cvProcessingJob.id,
    cvSubmissionId: cvSubmission.id,
  });

  const spy = new ClaimSourceGrantSpy();
  const service = buildService(spy);

  const result = await service.claimGuestAnalysisJob(user.id, job.id);

  assert.equal(result.status, "succeeded");
  assert.equal(spy.calls.length, 1);
  assert.deepEqual(spy.calls[0], {
    userId: user.id,
    analysisJobId: job.id,
    cvProcessingJobId: cvProcessingJob.id,
  });
});

test("flag ligada + AnalysisJob ainda não succeeded: nem o legado nem o claim novo materializam nada", async () => {
  const user = await createUser();
  const snapshot = await createSucceededSnapshot();

  const cvSource = await prisma.cvSource.create({
    data: {
      ownerType: "GUEST",
      talentSubjectId: (await prisma.talentSubject.create({ data: {} })).id,
      textStorageKey: "inline:y",
      textSha256: randomUUID(),
    },
  });
  const cvSubmission = await prisma.cvSubmission.create({
    data: { cvSourceId: cvSource.id, origin: "PASTED_TEXT" },
  });
  const cvProcessingJob = await prisma.cvProcessingJob.create({
    data: {
      cvSourceId: cvSource.id,
      cvSubmissionId: cvSubmission.id,
      status: "PENDING",
    },
  });

  const job = await prisma.analysisJob.create({
    data: {
      ownerKind: "guest",
      status: "processing",
      userId: user.id,
      analysisCvSnapshotId: snapshot.id,
      jobDescriptionText: "Vaga em processamento.",
      cvProcessingJobId: cvProcessingJob.id,
      cvSubmissionId: cvSubmission.id,
    },
  });

  const spy = new ClaimSourceGrantSpy();
  const service = buildService(spy);

  const result = await service.claimGuestAnalysisJob(user.id, job.id);

  assert.deepEqual(result, { status: "processing" });
  assert.equal(spy.calls.length, 0);
});
