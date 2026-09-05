// Fase 2G (docs/specs/2026-09-04-cv-canonical-profile-pipeline-plan.md,
// item 2 do plano de fechamento): claimGuest() e saveGuestPreview() foram
// auditados e confirmados VIVOS no frontend (ver relatório da Fase 2G) —
// nenhuma fase anterior os integrava ao pipeline canônico. Este spec cobre
// a integração nova (#enqueueCanonicalMasterProcessing), com mocks
// completos de `this.database` (mesmo padrão de
// cv-adaptation.service.spec.ts — os 108 testes legados, que continuam
// intocados: este arquivo nunca liga a flag globalmente, só dentro de cada
// teste, e cada arquivo de teste roda em processo próprio via node:test).
import assert from "node:assert/strict";
import { test } from "node:test";

import { CvAdaptationService } from "./cv-adaptation.service";

const CvAdaptationServiceCtor = CvAdaptationService as unknown as new (
  ...args: unknown[]
) => CvAdaptationService;

async function withFlagEnabled<T>(fn: () => Promise<T>): Promise<T> {
  const prev = process.env.CV_STRUCTURED_PROFILE_PIPELINE_ENABLED;
  process.env.CV_STRUCTURED_PROFILE_PIPELINE_ENABLED = "true";
  try {
    return await fn();
  } finally {
    if (prev === undefined) {
      delete process.env.CV_STRUCTURED_PROFILE_PIPELINE_ENABLED;
    } else {
      process.env.CV_STRUCTURED_PROFILE_PIPELINE_ENABLED = prev;
    }
  }
}

const JOB_DESCRIPTION =
  "Vaga para analista com responsabilidades, requisitos de experiencia, habilidades tecnicas e colaboracao com produto e dados.";

test("saveGuestPreview (flag ligada, primeiro CV do usuário — sem arquivo): enfileira CvProcessingJob com PROMOTE_IF_FIRST, ALÉM do legado", async () => {
  await withFlagEnabled(async () => {
    const enqueueCalls: Array<{ userId: string; masterIntent: string }> = [];

    const service = new CvAdaptationServiceCtor(
      {
        resumeTemplate: { findFirst: async () => null },
        resume: {
          findFirst: async () => null, // sem master existente
          create: async () => ({ id: "new-master-1" }),
        },
        cvAdaptation: {
          findFirst: async () => null,
          findUnique: async () => null,
          create: async ({ data }: { data: Record<string, unknown> }) => ({
            id: "adapt-1",
            createdAt: new Date(),
            updatedAt: new Date(),
            ...data,
          }),
          updateMany: async () => ({ count: 0 }),
        },
        analysisJob: { updateMany: async () => ({ count: 0 }) },
        analysisCvSnapshot: {
          findUnique: async () => ({
            id: "snapshot-1",
            userId: "user-1",
            guestSessionHash: null,
            expiresAt: null,
            claimedAt: null,
            claimedByUserId: null,
          }),
        },
      },
      { analyzeAndAdapt: async () => {} },
      { createIntent: async () => ({}) },
      { generatePdf: async () => Buffer.from("pdf") },
      {
        generateDocx: async () => Buffer.from("docx"),
        toPdf: async () => Buffer.from("pdf"),
      },
      { executeProtectedAnalyze: async () => ({ ok: true }) },
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
      {
        enqueueFromUserText: async (input: {
          userId: string;
          masterIntent: string;
        }) => {
          enqueueCalls.push({
            userId: input.userId,
            masterIntent: input.masterIntent,
          });
          return {
            cvSource: { id: "source-1" },
            cvSubmission: { id: "submission-1" },
            job: { id: "job-1" },
          };
        },
      }, // cvProcessingEntrypoint
    );

    await service.saveGuestPreview("user-1", {
      adaptedContentJson: { fit: { headline: "ok" } },
      companyName: "EarlyCV",
      jobDescriptionText: JOB_DESCRIPTION,
      jobTitle: "Analista",
      masterCvText: "CV enviado pelo usuario, com bastante conteúdo real.",
      analysisCvSnapshotId: "snapshot-1",
      previewText: "preview",
    } as never);

    assert.equal(enqueueCalls.length, 1);
    assert.equal(enqueueCalls[0]?.userId, "user-1");
    assert.equal(enqueueCalls[0]?.masterIntent, "PROMOTE_IF_FIRST");
  });
});

test("saveGuestPreview (flag desligada): nunca chama o pipeline novo", async () => {
  const enqueueCalls: unknown[] = [];

  const service = new CvAdaptationServiceCtor(
    {
      resumeTemplate: { findFirst: async () => null },
      resume: {
        findFirst: async () => null,
        create: async () => ({ id: "new-master-1" }),
      },
      cvAdaptation: {
        findFirst: async () => null,
        findUnique: async () => null,
        create: async ({ data }: { data: Record<string, unknown> }) => ({
          id: "adapt-1",
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data,
        }),
        updateMany: async () => ({ count: 0 }),
      },
      analysisJob: { updateMany: async () => ({ count: 0 }) },
      analysisCvSnapshot: {
        findUnique: async () => ({
          id: "snapshot-1",
          userId: "user-1",
          guestSessionHash: null,
          expiresAt: null,
          claimedAt: null,
          claimedByUserId: null,
        }),
      },
    },
    { analyzeAndAdapt: async () => {} },
    { createIntent: async () => ({}) },
    { generatePdf: async () => Buffer.from("pdf") },
    {
      generateDocx: async () => Buffer.from("docx"),
      toPdf: async () => Buffer.from("pdf"),
    },
    { executeProtectedAnalyze: async () => ({ ok: true }) },
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    {
      enqueueFromUserText: async (input: unknown) => {
        enqueueCalls.push(input);
        return {
          cvSource: { id: "source-1" },
          cvSubmission: { id: "submission-1" },
          job: { id: "job-1" },
        };
      },
    },
  );

  await service.saveGuestPreview("user-1", {
    adaptedContentJson: { fit: { headline: "ok" } },
    companyName: "EarlyCV",
    jobDescriptionText: JOB_DESCRIPTION,
    jobTitle: "Analista",
    masterCvText: "CV enviado pelo usuario, com bastante conteúdo real.",
    analysisCvSnapshotId: "snapshot-1",
    previewText: "preview",
  } as never);

  assert.equal(enqueueCalls.length, 0);
});

test("claimGuest (flag ligada, primeiro CV do usuário): enfileira CvProcessingJob com PROMOTE_IF_FIRST, ALÉM do legado", async () => {
  await withFlagEnabled(async () => {
    const enqueueCalls: Array<{ userId: string; masterIntent: string }> = [];

    const service = new CvAdaptationServiceCtor(
      {
        resumeTemplate: { findFirst: async () => null },
        user: {
          findUnique: async () => ({
            creditsRemaining: 3,
            internalRole: "user",
          }),
        },
        $transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
          fn({
            analysisCvSnapshot: {
              findUnique: async () => ({
                id: "snapshot-1",
                userId: null,
                guestSessionHash: null,
                expiresAt: null,
                claimedAt: null,
                claimedByUserId: null,
                originalFileName: null,
              }),
              update: async () => ({
                id: "snapshot-1",
                originalFileName: null,
              }),
            },
            resume: {
              findFirst: async () => null,
              create: async () => ({ id: "new-master-1" }),
            },
            cvAdaptation: {
              create: async ({ data }: { data: Record<string, unknown> }) => ({
                id: "adapt-1",
                createdAt: new Date(),
                updatedAt: new Date(),
                ...data,
              }),
              update: async ({ data }: { data: Record<string, unknown> }) => ({
                id: "adapt-1",
                createdAt: new Date(),
                updatedAt: new Date(),
                masterResume: { rawText: null },
                ...data,
              }),
            },
            user: { update: async () => ({}) },
            cvUnlock: { create: async () => ({}) },
          }),
      },
      { analyzeAndAdapt: async () => {} },
      { createIntent: async () => ({}) },
      { generatePdf: async () => Buffer.from("pdf") },
      {
        generateDocx: async () => Buffer.from("docx"),
        toPdf: async () => Buffer.from("pdf"),
      },
      { executeProtectedAnalyze: async () => ({ ok: true }) },
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      {
        enqueueFromUserText: async (input: {
          userId: string;
          masterIntent: string;
        }) => {
          enqueueCalls.push({
            userId: input.userId,
            masterIntent: input.masterIntent,
          });
          return {
            cvSource: { id: "source-1" },
            cvSubmission: { id: "submission-1" },
            job: { id: "job-1" },
          };
        },
      },
    );

    // ensureLegacyStructuredOutput chama outros serviços internos — não é o
    // foco deste teste (a auditoria/integração é sobre a promoção de
    // Master), então neutralizamos com um noop seguro.
    (
      service as unknown as {
        ensureLegacyStructuredOutput: (...args: unknown[]) => Promise<unknown>;
      }
    ).ensureLegacyStructuredOutput = async () => null;

    await service.claimGuest("user-1", {
      adaptedContentJson: { vaga: { cargo: "Analista", empresa: "Acme" } },
      previewText: "preview",
      jobDescriptionText: JOB_DESCRIPTION,
      jobTitle: "Analista",
      companyName: "Acme",
      masterCvText: "CV enviado pelo usuario, com bastante conteúdo real.",
      analysisCvSnapshotId: "snapshot-1",
    } as never);

    assert.equal(enqueueCalls.length, 1);
    assert.equal(enqueueCalls[0]?.userId, "user-1");
    assert.equal(enqueueCalls[0]?.masterIntent, "PROMOTE_IF_FIRST");
  });
});
