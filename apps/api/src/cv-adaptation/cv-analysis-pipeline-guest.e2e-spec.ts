// Fase 2D — testes reais de banco (Postgres local, earlycv_test) do pipeline
// canônico ligado à análise de VISITANTE (docs/specs/2026-09-04-cv-canonical-
// profile-pipeline-plan.md, escopo Fase 2D). Espelha
// cv-analysis-pipeline.e2e-spec.ts (Fase 2C, caminho autenticado), cobrindo
// os cenários específicos do guest: TalentSubject/TalentProfile mesmo sem
// identidade, Master provisório (PROMOTE_IF_FIRST), concorrência real,
// retry sem duplicar, invariante succeeded, ausência de IA no request e
// flag desligada preservando o caminho legado.
process.env.CV_STRUCTURED_PROFILE_PIPELINE_ENABLED = "true";

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";

import { PrismaClient } from "@prisma/client";
import { CvMasterPromotionService } from "../cv-processing/cv-master-promotion.service";
import { CvProcessingWorker } from "../cv-processing/cv-processing.worker";
import { CvProcessingEntrypointService } from "../cv-processing/cv-processing-entrypoint.service";
import { CvProcessingJobService } from "../cv-processing/cv-processing-job.service";
import { CvTalentCaptureService } from "../cv-processing/cv-talent-capture.service";
import { CvUserProfileSyncService } from "../cv-processing/cv-user-profile-sync.service";
import { DatabaseService } from "../database/database.service";
import { IngestionLockRepository } from "../ingestion/ingestion-lock.repository";
import type { MasterCvCanonicalExtractionOutput } from "../master-cv-canonical-extraction/master-cv-canonical-extraction.types";
import { ProfileCanonicalMergeService } from "../profiles/profile-canonical-merge.service";
import { ProfileReadinessService } from "../profiles/profile-readiness.service";
import { TalentSubjectService } from "../talent-subjects/talent-subject.service";
import { CvAdaptationService } from "./cv-adaptation.service";
import { CvAnalysisWorker } from "./cv-analysis.worker";

const CvAdaptationServiceCtor = CvAdaptationService as unknown as new (
  ...args: unknown[]
) => CvAdaptationService;

const prisma = new PrismaClient();
const database = new DatabaseService(prisma);
const jobService = new CvProcessingJobService(database);
const talentCapture = new CvTalentCaptureService(database);
const userProfileSync = new CvUserProfileSyncService(
  new ProfileCanonicalMergeService(),
  new ProfileReadinessService(),
);
const masterPromotion = new CvMasterPromotionService(database, userProfileSync);
const lockRepository = new IngestionLockRepository(database);
const talentSubjectService = new TalentSubjectService(database);

const JOB_DESCRIPTION =
  "Vaga para analista com responsabilidades, requisitos de experiencia, habilidades tecnicas e colaboracao com produto e dados.";

function buildCvText(name: string, marker: string): string {
  return [
    name,
    "Resumo",
    `Profissional com experiência em ${marker}, formação superior concluída em 2020 e boas habilidades de comunicação.`,
    "Experiência",
    `2020 - 2023 | Analista - ${marker}`,
  ].join("\n");
}

class FakeStorage {
  readonly puts: Array<{ key: string; body: Buffer }> = [];
  private readonly objects = new Map<string, Buffer>();

  async putObject(key: string, body: Buffer): Promise<string> {
    this.puts.push({ key, body });
    this.objects.set(key, body);
    return `fake://${key}`;
  }

  async getObject(key: string): Promise<Buffer> {
    const object = this.objects.get(key);
    if (!object) {
      const error = new Error(`NoSuchKey: ${key}`) as Error & { name: string };
      error.name = "NoSuchKey";
      throw error;
    }
    return object;
  }

  async deleteObject(): Promise<void> {
    return;
  }
}

function fakeCanonicalOutput(
  fullName: string | null = null,
): MasterCvCanonicalExtractionOutput {
  return {
    canonicalProfile: {
      fullName,
      headline: fullName ? "Analista" : null,
      email: null,
      phone: null,
      linkedinUrl: null,
      location: { city: null, state: null, country: null },
      professionalSummary: fullName ? "Resumo profissional de teste." : null,
      experiences: [],
      education: [],
      skills: ["SQL", "Excel"],
      languages: [],
      certifications: [],
    },
    extractionCoverage: {
      identifiedFields: [],
      missingFields: [],
      fieldStatus: {},
    },
    confidence: {},
    evidence: {},
  } as unknown as MasterCvCanonicalExtractionOutput;
}

class FakeProtectedAnalyzeService {
  turnstileCalls = 0;
  computeCalls = 0;
  private readonly cache = new Map<string, unknown>();
  private failNextCompute = false;

  async precheckTurnstile() {
    this.turnstileCalls += 1;
    return { ok: true as const };
  }

  setFailNextCompute(fail: boolean) {
    this.failNextCompute = fail;
  }

  async executeProtectedAnalyze(input: {
    payload: unknown;
    loadMasterCvText: () => Promise<string>;
  }) {
    const key = JSON.stringify(input.payload);
    const cached = this.cache.get(key);
    if (cached) {
      return {
        ok: true as const,
        cached: true,
        canonicalHash: key,
        result: cached,
      };
    }

    if (this.failNextCompute) {
      this.failNextCompute = false;
      throw new Error("falha simulada na chamada de IA da análise");
    }

    this.computeCalls += 1;
    const masterCvText = await input.loadMasterCvText();
    const result = {
      adaptedContentJson: {
        vaga: { cargo: "Analista", empresa: "Acme" },
        scoreBefore: 40,
        scoreAfter: 85,
      },
      analysisModel: "fake-model",
      analysisPromptVersion: "v1",
      masterCvText,
      previewText: "preview de teste",
      structuredRequirements: [],
    };
    this.cache.set(key, result);
    return { ok: true as const, cached: false, canonicalHash: key, result };
  }
}

function buildCvAdaptationService(
  protectedAnalyze: FakeProtectedAnalyzeService,
  entrypoint: Pick<
    CvProcessingEntrypointService,
    "enqueueFromUserText" | "enqueueFromGuestText"
  >,
  masterPromotionForAnalysis: Pick<
    CvMasterPromotionService,
    "getActiveDesignation"
  >,
  subjectService: Pick<
    TalentSubjectService,
    "resolveForGuestSession"
  > = talentSubjectService,
) {
  return new CvAdaptationServiceCtor(
    database, // database
    undefined, // _aiService
    undefined, // paymentService
    undefined, // pdfService
    undefined, // docxService
    protectedAnalyze, // protectedAnalyzeService
    undefined, // storage -> default no-op
    undefined, // analysisTelemetry -> default
    undefined, // jobApplicationsService -> default
    undefined, // profileMergeService -> default
    undefined, // profileReadinessService -> default
    undefined, // jobCanonicalizationService (optional)
    undefined, // jobRequirementSetsService (optional)
    undefined, // talentProfileCapture -> default
    undefined, // masterCvCanonicalExtractionService (optional)
    undefined, // funnelEvents -> default
    entrypoint, // cvProcessingEntrypoint (Fase 2C/2D)
    masterPromotionForAnalysis, // cvMasterPromotionForAnalysis
    subjectService, // talentSubjectService (Fase 2D)
  );
}

function buildProcessingWorker(
  extract: () => Promise<MasterCvCanonicalExtractionOutput>,
  storage: FakeStorage,
) {
  return new CvProcessingWorker(
    database,
    lockRepository,
    jobService,
    { extract },
    talentCapture,
    masterPromotion,
    storage,
  );
}

function buildAnalysisWorker(cvAdaptationService: CvAdaptationService) {
  return new CvAnalysisWorker(
    database,
    lockRepository,
    userProfileSync,
    cvAdaptationService,
  );
}

async function processOneCvJob(worker: CvProcessingWorker, jobId: string) {
  const claimed = await jobService.claimOne(
    jobId,
    `test-worker-${randomUUID()}`,
  );
  assert.ok(claimed, `cv processing job ${jobId} deveria estar PENDING`);
  await (
    worker as unknown as { processJob: (job: typeof claimed) => Promise<void> }
  ).processJob(claimed);
  return database.cvProcessingJob.findUniqueOrThrow({ where: { id: jobId } });
}

async function processOneAnalysisJob(worker: CvAnalysisWorker, jobId: string) {
  const job = await database.analysisJob.findUniqueOrThrow({
    where: { id: jobId },
    include: { cvProcessingJob: true },
  });
  assert.ok(job.cvProcessingJob, "AnalysisJob sem cvProcessingJob associado");
  const claimed = await (
    worker as unknown as { claim: (id: string) => Promise<typeof job | null> }
  ).claim(jobId);
  assert.ok(claimed, `analysis job ${jobId} deveria estar pending`);
  await (
    worker as unknown as {
      processReadyJob: (
        job: typeof claimed,
        cvProcessingJob: { cvStructuredProfileId: string | null },
      ) => Promise<void>;
    }
  ).processReadyJob(claimed, {
    cvStructuredProfileId: job.cvProcessingJob.cvStructuredProfileId,
  });
  return database.analysisJob.findUniqueOrThrow({ where: { id: jobId } });
}

function guestAnalysisContext(sessionPublicToken: string) {
  return {
    correlationId: `corr-${randomUUID()}`,
    ip: "203.0.113.10",
    requestId: `req-${randomUUID()}`,
    sessionInternalId: null,
    sessionPublicToken,
    userId: null,
  };
}

test("guest 1) TalentSubject sem NENHUM sinal de identidade ainda termina com TalentProfile completo", async () => {
  const storage = new FakeStorage();
  const cvWorker = buildProcessingWorker(
    async () => fakeCanonicalOutput(null),
    storage,
  );
  const protectedAnalyze = new FakeProtectedAnalyzeService();
  const entrypoint = new CvProcessingEntrypointService(
    database,
    jobService,
    storage,
  );
  const service = buildCvAdaptationService(
    protectedAnalyze,
    entrypoint,
    masterPromotion,
  );

  const sessionToken = `session-${randomUUID()}`;
  const started = await service.startGuestAnalysisJob(
    JOB_DESCRIPTION,
    undefined,
    buildCvText("Visitante Anônimo", "logística"),
    "turnstile-token",
    guestAnalysisContext(sessionToken),
  );

  const row = await database.analysisJob.findUniqueOrThrow({
    where: { id: started.jobId },
  });
  assert.ok(row.cvProcessingJobId);
  assert.equal(row.userId, null);
  assert.ok(row.guestSessionHash);

  const cvJobBefore = await database.cvProcessingJob.findUniqueOrThrow({
    where: { id: row.cvProcessingJobId as string },
  });
  const cvSource = await database.cvSource.findUniqueOrThrow({
    where: { id: cvJobBefore.cvSourceId },
  });
  assert.equal(cvSource.ownerType, "GUEST");
  assert.ok(cvSource.talentSubjectId);

  await processOneCvJob(cvWorker, row.cvProcessingJobId as string);

  const talentProfile = await prisma.talentProfile.findUniqueOrThrow({
    where: { talentSubjectId: cvSource.talentSubjectId as string },
  });
  assert.equal(talentProfile.userId, null);
  assert.equal(talentProfile.fullName, null);
});

test("guest 2) duas análises da MESMA sessão resolvem pro MESMO TalentSubject", async () => {
  const storage = new FakeStorage();
  const protectedAnalyze = new FakeProtectedAnalyzeService();
  const entrypoint = new CvProcessingEntrypointService(
    database,
    jobService,
    storage,
  );
  const service = buildCvAdaptationService(
    protectedAnalyze,
    entrypoint,
    masterPromotion,
  );

  const sessionToken = `session-${randomUUID()}`;
  const first = await service.startGuestAnalysisJob(
    JOB_DESCRIPTION,
    undefined,
    buildCvText("Sessão Repetida A", "dados"),
    "turnstile-token",
    guestAnalysisContext(sessionToken),
  );
  const second = await service.startGuestAnalysisJob(
    JOB_DESCRIPTION,
    undefined,
    buildCvText("Sessão Repetida B", "produto"),
    "turnstile-token",
    guestAnalysisContext(sessionToken),
  );

  const firstRow = await database.analysisJob.findUniqueOrThrow({
    where: { id: first.jobId },
  });
  const secondRow = await database.analysisJob.findUniqueOrThrow({
    where: { id: second.jobId },
  });
  const firstCvJob = await database.cvProcessingJob.findUniqueOrThrow({
    where: { id: firstRow.cvProcessingJobId as string },
  });
  const secondCvJob = await database.cvProcessingJob.findUniqueOrThrow({
    where: { id: secondRow.cvProcessingJobId as string },
  });
  const firstSource = await database.cvSource.findUniqueOrThrow({
    where: { id: firstCvJob.cvSourceId },
  });
  const secondSource = await database.cvSource.findUniqueOrThrow({
    where: { id: secondCvJob.cvSourceId },
  });

  assert.equal(firstSource.talentSubjectId, secondSource.talentSubjectId);
});

test("guest 3/4) primeira análise promove Master provisório; segunda análise do mesmo TalentSubject NÃO substitui", async () => {
  const storage = new FakeStorage();
  const cvWorker = buildProcessingWorker(
    async () => fakeCanonicalOutput("Visitante Master"),
    storage,
  );
  const protectedAnalyze = new FakeProtectedAnalyzeService();
  const entrypoint = new CvProcessingEntrypointService(
    database,
    jobService,
    storage,
  );
  const service = buildCvAdaptationService(
    protectedAnalyze,
    entrypoint,
    masterPromotion,
  );

  const sessionToken = `session-${randomUUID()}`;
  const first = await service.startGuestAnalysisJob(
    JOB_DESCRIPTION,
    undefined,
    buildCvText("Visitante Master", "engenharia"),
    "turnstile-token",
    guestAnalysisContext(sessionToken),
  );
  const firstRow = await database.analysisJob.findUniqueOrThrow({
    where: { id: first.jobId },
  });
  const firstCvJob = await database.cvProcessingJob.findUniqueOrThrow({
    where: { id: firstRow.cvProcessingJobId as string },
  });
  assert.equal(firstCvJob.masterIntent, "PROMOTE_IF_FIRST");
  await processOneCvJob(cvWorker, firstCvJob.id);

  const talentSubjectId = (
    await database.cvSource.findUniqueOrThrow({
      where: { id: firstCvJob.cvSourceId },
    })
  ).talentSubjectId as string;
  const designationAfterFirst = await masterPromotion.getActiveDesignation({
    ownerType: "GUEST",
    talentSubjectId,
  });
  assert.ok(designationAfterFirst);

  const second = await service.startGuestAnalysisJob(
    JOB_DESCRIPTION,
    undefined,
    buildCvText("Conteúdo Bem Diferente", "vendas"),
    "turnstile-token",
    guestAnalysisContext(sessionToken),
  );
  const secondRow = await database.analysisJob.findUniqueOrThrow({
    where: { id: second.jobId },
  });
  const secondCvJob = await database.cvProcessingJob.findUniqueOrThrow({
    where: { id: secondRow.cvProcessingJobId as string },
  });
  assert.equal(secondCvJob.masterIntent, "NONE"); // já existe designação ativa

  await processOneCvJob(cvWorker, secondCvJob.id);

  const designationAfterSecond = await masterPromotion.getActiveDesignation({
    ownerType: "GUEST",
    talentSubjectId,
  });
  assert.equal(designationAfterSecond?.id, designationAfterFirst?.id);
});

test("guest 8) concorrência real — dois CvProcessingJob do MESMO TalentSubject disputando o primeiro Master, exatamente um vence", async () => {
  const storage = new FakeStorage();
  const protectedAnalyze = new FakeProtectedAnalyzeService();
  const entrypoint = new CvProcessingEntrypointService(
    database,
    jobService,
    storage,
  );
  const service = buildCvAdaptationService(
    protectedAnalyze,
    entrypoint,
    masterPromotion,
  );

  const sessionToken = `session-${randomUUID()}`;
  const [first, second] = await Promise.all([
    service.startGuestAnalysisJob(
      JOB_DESCRIPTION,
      undefined,
      buildCvText("Concorrente Guest A", "suporte"),
      "turnstile-token",
      guestAnalysisContext(sessionToken),
    ),
    service.startGuestAnalysisJob(
      JOB_DESCRIPTION,
      undefined,
      buildCvText("Concorrente Guest B", "financas"),
      "turnstile-token",
      guestAnalysisContext(sessionToken),
    ),
  ]);

  const firstRow = await database.analysisJob.findUniqueOrThrow({
    where: { id: first.jobId },
  });
  const secondRow = await database.analysisJob.findUniqueOrThrow({
    where: { id: second.jobId },
  });
  const firstCvJob = await database.cvProcessingJob.findUniqueOrThrow({
    where: { id: firstRow.cvProcessingJobId as string },
  });
  const secondCvJob = await database.cvProcessingJob.findUniqueOrThrow({
    where: { id: secondRow.cvProcessingJobId as string },
  });
  const talentSubjectId = (
    await database.cvSource.findUniqueOrThrow({
      where: { id: firstCvJob.cvSourceId },
    })
  ).talentSubjectId as string;

  const cvWorkerA = buildProcessingWorker(
    async () => fakeCanonicalOutput("Concorrente Guest A"),
    storage,
  );
  const cvWorkerB = buildProcessingWorker(
    async () => fakeCanonicalOutput("Concorrente Guest B"),
    storage,
  );

  await Promise.all([
    processOneCvJob(cvWorkerA, firstCvJob.id),
    processOneCvJob(cvWorkerB, secondCvJob.id),
  ]);

  const activeDesignations = await prisma.cvMasterDesignation.findMany({
    where: { talentSubjectId, supersededAt: null },
  });
  assert.equal(activeDesignations.length, 1);

  const bothJobs = await prisma.cvProcessingJob.findMany({
    where: { id: { in: [firstCvJob.id, secondCvJob.id] } },
  });
  assert.ok(bothJobs.every((j) => j.status === "READY"));
});

test("guest 9) retry de AnalysisJob não duplica extração — reusa CvStructuredProfile já READY", async () => {
  const storage = new FakeStorage();
  let extractCalls = 0;
  const cvWorker = buildProcessingWorker(async () => {
    extractCalls += 1;
    return fakeCanonicalOutput("Retry Guest");
  }, storage);
  const protectedAnalyze = new FakeProtectedAnalyzeService();
  const entrypoint = new CvProcessingEntrypointService(
    database,
    jobService,
    storage,
  );
  const service = buildCvAdaptationService(
    protectedAnalyze,
    entrypoint,
    masterPromotion,
  );
  const analysisWorker = buildAnalysisWorker(service);

  const started = await service.startGuestAnalysisJob(
    JOB_DESCRIPTION,
    undefined,
    buildCvText("Retry Guest", "operacoes"),
    "turnstile-token",
    guestAnalysisContext(`session-${randomUUID()}`),
  );
  const row = await database.analysisJob.findUniqueOrThrow({
    where: { id: started.jobId },
  });
  await processOneCvJob(cvWorker, row.cvProcessingJobId as string);
  assert.equal(extractCalls, 1);

  protectedAnalyze.setFailNextCompute(true);
  const failed = await processOneAnalysisJob(analysisWorker, started.jobId);
  assert.equal(failed.status, "failed");

  await database.analysisJob.update({
    where: { id: started.jobId },
    data: { status: "pending", startedAt: null, lastError: null },
  });
  const retried = await processOneAnalysisJob(analysisWorker, started.jobId);
  assert.equal(retried.status, "succeeded");
  assert.equal(extractCalls, 1); // nenhuma extração nova no retry
});

test("guest 14) AnalysisJob succeeded sempre carrega cvStructuredProfileId de um CvStructuredProfile READY", async () => {
  const storage = new FakeStorage();
  const cvWorker = buildProcessingWorker(
    async () => fakeCanonicalOutput("Invariante Guest"),
    storage,
  );
  const protectedAnalyze = new FakeProtectedAnalyzeService();
  const entrypoint = new CvProcessingEntrypointService(
    database,
    jobService,
    storage,
  );
  const service = buildCvAdaptationService(
    protectedAnalyze,
    entrypoint,
    masterPromotion,
  );
  const analysisWorker = buildAnalysisWorker(service);

  const started = await service.startGuestAnalysisJob(
    JOB_DESCRIPTION,
    undefined,
    buildCvText("Invariante Guest", "projetos"),
    "turnstile-token",
    guestAnalysisContext(`session-${randomUUID()}`),
  );
  const row = await database.analysisJob.findUniqueOrThrow({
    where: { id: started.jobId },
  });
  await processOneCvJob(cvWorker, row.cvProcessingJobId as string);

  const final = await processOneAnalysisJob(analysisWorker, started.jobId);
  assert.equal(final.status, "succeeded");
  assert.ok(final.cvStructuredProfileId);

  const profile = await database.cvStructuredProfile.findUniqueOrThrow({
    where: { id: final.cvStructuredProfileId as string },
  });
  assert.equal(profile.status, "READY");
});

test("guest 15) nenhuma chamada de IA acontece dentro do request — só depois, nos workers", async () => {
  const storage = new FakeStorage();
  const cvWorker = buildProcessingWorker(
    async () => fakeCanonicalOutput("Sem IA no Request Guest"),
    storage,
  );
  const protectedAnalyze = new FakeProtectedAnalyzeService();
  const entrypoint = new CvProcessingEntrypointService(
    database,
    jobService,
    storage,
  );
  const service = buildCvAdaptationService(
    protectedAnalyze,
    entrypoint,
    masterPromotion,
  );
  const analysisWorker = buildAnalysisWorker(service);

  const started = await service.startGuestAnalysisJob(
    JOB_DESCRIPTION,
    undefined,
    buildCvText("Sem IA no Request Guest", "dados"),
    "turnstile-token",
    guestAnalysisContext(`session-${randomUUID()}`),
  );

  assert.equal(protectedAnalyze.computeCalls, 0);

  const row = await database.analysisJob.findUniqueOrThrow({
    where: { id: started.jobId },
  });
  await processOneCvJob(cvWorker, row.cvProcessingJobId as string);
  assert.equal(protectedAnalyze.computeCalls, 0);

  await processOneAnalysisJob(analysisWorker, started.jobId);
  assert.equal(protectedAnalyze.computeCalls, 1);
});

test("guest 16) flag desligada nunca chama o pipeline novo (dispatch legado de guest intacto)", async () => {
  let entrypointCalls = 0;
  const entrypoint: Pick<
    CvProcessingEntrypointService,
    "enqueueFromUserText" | "enqueueFromGuestText"
  > = {
    enqueueFromUserText: async () => {
      entrypointCalls += 1;
      throw new Error("não deveria ser chamado com a flag desligada");
    },
    enqueueFromGuestText: async () => {
      entrypointCalls += 1;
      throw new Error("não deveria ser chamado com a flag desligada");
    },
  };
  const protectedAnalyze = new FakeProtectedAnalyzeService();
  const service = buildCvAdaptationService(
    protectedAnalyze,
    entrypoint,
    masterPromotion,
  );

  const previous = process.env.CV_STRUCTURED_PROFILE_PIPELINE_ENABLED;
  process.env.CV_STRUCTURED_PROFILE_PIPELINE_ENABLED = "false";
  try {
    const result = await service.startGuestAnalysisJob(
      JOB_DESCRIPTION,
      undefined,
      buildCvText("Legado Guest Intacto", "atendimento"),
      "turnstile-token",
      guestAnalysisContext(`session-${randomUUID()}`),
    );
    assert.equal(result.status, "pending");

    let finalRow = await database.analysisJob.findUniqueOrThrow({
      where: { id: result.jobId },
    });
    const deadline = Date.now() + 5000;
    while (
      (finalRow.status === "processing" || finalRow.status === "pending") &&
      Date.now() < deadline
    ) {
      await new Promise((resolve) => setTimeout(resolve, 25));
      finalRow = await database.analysisJob.findUniqueOrThrow({
        where: { id: result.jobId },
      });
    }
    // Caminho legado real (protectedAnalyze fake configurado como acima)
    // deveria suceder normalmente — o que importa é que nunca tocou o
    // pipeline novo.
    assert.equal(finalRow.cvProcessingJobId, null);
  } finally {
    process.env.CV_STRUCTURED_PROFILE_PIPELINE_ENABLED = previous;
  }
  assert.equal(entrypointCalls, 0);
});
