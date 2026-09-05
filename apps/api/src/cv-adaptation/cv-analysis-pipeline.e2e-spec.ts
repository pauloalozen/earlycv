// Fase 2C — testes reais de banco (Postgres local, earlycv_test) do pipeline
// canônico ligado à análise autenticada
// (docs/specs/2026-09-04-cv-canonical-profile-pipeline-plan.md, seções 1, 5,
// 9, 10, 11, 17). Cobre os 17 cenários mínimos exigidos no plano de
// implementação da Fase 2C. Segue o mesmo padrão dos specs de Fase 2A/2B
// (cv-master-promotion.service.spec.ts, cv-processing.worker.spec.ts):
// instâncias reais construídas diretamente (sem TestingModule), Postgres
// real para tudo que envolve concorrência, fakes só para IA/storage.
//
// A flag é ligada uma única vez, no escopo do módulo — cada arquivo de teste
// roda em processo próprio (node:test isola por arquivo), então isso nunca
// vaza para outros specs (confirmado rodando
// cv-adaptation.service.spec.ts — 108 testes legados — sem esta flag, todos
// verdes).
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

const JOB_DESCRIPTION =
  "Vaga para analista com responsabilidades, requisitos de experiencia, habilidades tecnicas e colaboracao com produto e dados.";

// Texto de CV que sempre passa validateCvTextInput (>=120 chars, >=3 linhas
// não vazias, sinal de seção de CV + ano) — evita repetir fixtures curtas
// demais em cada teste.
function buildCvText(name: string, marker: string): string {
  return [
    name,
    "Resumo",
    `Profissional com experiência em ${marker}, formação superior concluída em 2020 e boas habilidades de comunicação.`,
    "Experiência",
    `2020 - 2023 | Analista - ${marker}`,
  ].join("\n");
}

async function createUser() {
  return prisma.user.create({
    data: {
      email: `cv-analysis-pipeline+${randomUUID()}@example.com`,
      name: "CV Analysis Pipeline Test",
      profile: { create: {} },
    },
  });
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
  fullName: string,
): MasterCvCanonicalExtractionOutput {
  return {
    canonicalProfile: {
      fullName,
      headline: "Analista",
      email: null,
      phone: null,
      linkedinUrl: null,
      location: { city: null, state: null, country: null },
      professionalSummary: "Resumo profissional de teste.",
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
  };
}

// Duplo de teste do gateway de proteção (turnstile + dedup por payload +
// chamada real de IA). Implementa a MESMA garantia de idempotência por
// payload que AnalysisProtectionFacade.executeProtectedAnalysis já oferece
// em produção (cache por hash do payload) — sem isso, os testes de retry
// (9/10) não conseguiriam provar "não recomputa" de forma realista.
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
  entrypoint: Pick<CvProcessingEntrypointService, "enqueueFromUserText">,
  masterPromotionForAnalysis: Pick<
    CvMasterPromotionService,
    "getActiveDesignation"
  >,
) {
  return new CvAdaptationServiceCtor(
    database, // database
    undefined, // _aiService (não usado — protectedAnalyzeService é o gateway)
    undefined, // paymentService
    undefined, // pdfService
    undefined, // docxService
    protectedAnalyze, // protectedAnalyzeService
    undefined, // storage -> default (no-op) — snapshot da análise não é o foco aqui
    undefined, // analysisTelemetry -> default
    undefined, // jobApplicationsService -> default
    undefined, // profileMergeService -> default
    undefined, // profileReadinessService -> default
    undefined, // jobCanonicalizationService (optional)
    undefined, // jobRequirementSetsService (optional)
    undefined, // talentProfileCapture -> default
    undefined, // masterCvCanonicalExtractionService (optional)
    undefined, // funnelEvents -> default
    entrypoint, // cvProcessingEntrypoint (Fase 2C)
    masterPromotionForAnalysis, // cvMasterPromotionForAnalysis (Fase 2C)
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

// Reivindica e processa só o CvProcessingJob indicado (mesmo padrão de
// cv-processing.worker.spec.ts#processOne) — o banco de teste é
// compartilhado entre arquivos de spec, então usar o scanner de PENDING
// completo processaria jobs de outros testes.
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

// Idem para AnalysisJob — chama a claim + processamento privados do
// CvAnalysisWorker diretamente sobre um job específico, sem passar pelo
// scanner de lote (evita interferência entre specs).
async function processOneAnalysisJob(worker: CvAnalysisWorker, jobId: string) {
  const job = await database.analysisJob.findUniqueOrThrow({
    where: { id: jobId },
    include: { cvProcessingJob: true },
  });
  assert.ok(job.cvProcessingJob, "AnalysisJob sem cvProcessingJob associado");
  const claimed = await (
    worker as unknown as {
      claim: (id: string) => Promise<typeof job | null>;
    }
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

// Igual à real processPendingBatch (mesma decisão READY vs. FAILED), mas só
// para o job indicado — usado quando o teste não sabe (ou não quer
// pressupor) se o CvProcessingJob correspondente terminou READY ou FAILED.
async function processOneAnalysisJobRespectingDependency(
  worker: CvAnalysisWorker,
  jobId: string,
) {
  const job = await database.analysisJob.findUniqueOrThrow({
    where: { id: jobId },
    include: { cvProcessingJob: true },
  });
  assert.ok(job.cvProcessingJob, "AnalysisJob sem cvProcessingJob associado");

  if (job.cvProcessingJob.status === "FAILED") {
    const claimed = await (
      worker as unknown as { claim: (id: string) => Promise<typeof job | null> }
    ).claim(jobId);
    assert.ok(claimed, `analysis job ${jobId} deveria estar pending`);
    await database.analysisJob.update({
      where: { id: jobId },
      data: {
        status: "failed",
        finishedAt: new Date(),
        lastError:
          job.cvProcessingJob.lastError ??
          "o processamento do CV (extração) falhou antes da análise poder rodar",
      },
    });
    return database.analysisJob.findUniqueOrThrow({ where: { id: jobId } });
  }

  return processOneAnalysisJob(worker, jobId);
}

// ---------------------------------------------------------------------------
// 1. Análise usando o Master atual (já processado) — sem nova extração.
// ---------------------------------------------------------------------------
test("1) análise reusa Master já processado — sem nova extração", async () => {
  const user = await createUser();
  const storage = new FakeStorage();
  let extractCalls = 0;
  const cvWorker = buildProcessingWorker(async () => {
    extractCalls += 1;
    return fakeCanonicalOutput("Fulano Master");
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

  // Cria o Master primeiro.
  const setup = await service.startAuthenticatedAnalysisJob(user.id, {
    jobDescriptionText: JOB_DESCRIPTION,
    masterCvText: buildCvText("Fulano Master", "dados"),
  });
  const setupJob = await database.analysisJob.findUniqueOrThrow({
    where: { id: setup.jobId },
  });
  assert.ok(setupJob.cvProcessingJobId);
  await processOneCvJob(cvWorker, setupJob.cvProcessingJobId as string);
  assert.equal(extractCalls, 1);

  // Segunda análise, sem enviar arquivo/texto/masterResumeId — reusa Master.
  const second = await service.startAuthenticatedAnalysisJob(user.id, {
    jobDescriptionText: JOB_DESCRIPTION,
  });
  const secondJob = await database.analysisJob.findUniqueOrThrow({
    where: { id: second.jobId },
  });
  assert.equal(secondJob.cvProcessingJobId, setupJob.cvProcessingJobId);
  assert.equal(extractCalls, 1); // nenhuma extração nova só por reusar

  const finalSecond = await processOneAnalysisJob(analysisWorker, second.jobId);
  assert.equal(finalSecond.status, "succeeded");
  assert.equal(protectedAnalyze.computeCalls, 1);
  assert.equal(extractCalls, 1);
});

// ---------------------------------------------------------------------------
// 2/4. Primeiro CV do usuário (sem Master) — promove via PROMOTE_IF_FIRST.
// ---------------------------------------------------------------------------
test("2) primeira análise de usuário sem Master promove (PROMOTE_IF_FIRST)", async () => {
  const user = await createUser();
  const storage = new FakeStorage();
  const cvWorker = buildProcessingWorker(
    async () => fakeCanonicalOutput("Primeira Vez"),
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

  const started = await service.startAuthenticatedAnalysisJob(user.id, {
    jobDescriptionText: JOB_DESCRIPTION,
    masterCvText: buildCvText("Primeira Vez", "vendas"),
  });
  const analysisJobRow = await database.analysisJob.findUniqueOrThrow({
    where: { id: started.jobId },
  });
  assert.equal(analysisJobRow.status, "pending");
  const cvJob = await database.cvProcessingJob.findUniqueOrThrow({
    where: { id: analysisJobRow.cvProcessingJobId as string },
  });
  assert.equal(cvJob.masterIntent, "PROMOTE_IF_FIRST");

  await processOneCvJob(cvWorker, cvJob.id);
  const designation = await prisma.cvMasterDesignation.findFirst({
    where: { userId: user.id, supersededAt: null },
  });
  assert.ok(designation, "Master deveria ter sido promovido");

  const finalAnalysis = await processOneAnalysisJob(
    analysisWorker,
    started.jobId,
  );
  assert.equal(finalAnalysis.status, "succeeded");
  assert.ok(finalAnalysis.cvStructuredProfileId);
});

// ---------------------------------------------------------------------------
// 3. CV diferente do Master, sem promoção (masterIntent NONE).
// ---------------------------------------------------------------------------
test("3) texto diferente do Master, sem saveAsMaster — nunca promove (masterIntent NONE)", async () => {
  const user = await createUser();
  const storage = new FakeStorage();
  const cvWorker = buildProcessingWorker(
    async () => fakeCanonicalOutput("Original"),
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

  // Master já existente.
  const setup = await service.startAuthenticatedAnalysisJob(user.id, {
    jobDescriptionText: JOB_DESCRIPTION,
    masterCvText: buildCvText("Original", "financas"),
  });
  const setupJob = await database.analysisJob.findUniqueOrThrow({
    where: { id: setup.jobId },
  });
  await processOneCvJob(cvWorker, setupJob.cvProcessingJobId as string);
  const activeBefore = await masterPromotion.getActiveDesignation({
    ownerType: "USER",
    userId: user.id,
  });
  assert.ok(activeBefore);

  // Nova análise com texto DIFERENTE, sem saveAsMaster.
  const diff = await service.startAuthenticatedAnalysisJob(user.id, {
    jobDescriptionText: JOB_DESCRIPTION,
    masterCvText: buildCvText("Texto completamente diferente", "marketing"),
    saveAsMaster: false,
  });
  const diffJobRow = await database.analysisJob.findUniqueOrThrow({
    where: { id: diff.jobId },
  });
  const diffCvJob = await database.cvProcessingJob.findUniqueOrThrow({
    where: { id: diffJobRow.cvProcessingJobId as string },
  });
  assert.equal(diffCvJob.masterIntent, "NONE");
  assert.notEqual(diffCvJob.cvSourceId, setupJob.cvProcessingJobId); // fonte nova

  await processOneCvJob(cvWorker, diffCvJob.id);
  const activeAfter = await masterPromotion.getActiveDesignation({
    ownerType: "USER",
    userId: user.id,
  });
  assert.equal(activeAfter?.id, activeBefore?.id); // Master não mudou
});

// ---------------------------------------------------------------------------
// 5/6. CV diferente do Master, COM promoção explícita (PROMOTE_EXPLICIT).
// A variante "arquivo diferente" é coberta usando masterResumeId (reuso de
// um Resume já existente, sem passar pelo parser real de PDF — extração de
// texto de arquivo já é uma utilidade legada, testada em outro lugar; o que
// importa aqui é a decisão de masterIntent, idêntica nos dois casos).
// ---------------------------------------------------------------------------
test("5) texto diferente do Master, saveAsMaster=true — promove (PROMOTE_EXPLICIT) e substitui", async () => {
  const user = await createUser();
  const storage = new FakeStorage();
  const cvWorker = buildProcessingWorker(
    async () => fakeCanonicalOutput("Substituto"),
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

  const setup = await service.startAuthenticatedAnalysisJob(user.id, {
    jobDescriptionText: JOB_DESCRIPTION,
    masterCvText: buildCvText("Original 2", "logistica"),
  });
  const setupJob = await database.analysisJob.findUniqueOrThrow({
    where: { id: setup.jobId },
  });
  await processOneCvJob(cvWorker, setupJob.cvProcessingJobId as string);
  const activeBefore = await masterPromotion.getActiveDesignation({
    ownerType: "USER",
    userId: user.id,
  });
  assert.ok(activeBefore);

  const explicit = await service.startAuthenticatedAnalysisJob(user.id, {
    jobDescriptionText: JOB_DESCRIPTION,
    masterCvText: buildCvText("Substituto", "produto"),
    saveAsMaster: true,
  });
  const explicitJobRow = await database.analysisJob.findUniqueOrThrow({
    where: { id: explicit.jobId },
  });
  const explicitCvJob = await database.cvProcessingJob.findUniqueOrThrow({
    where: { id: explicitJobRow.cvProcessingJobId as string },
  });
  assert.equal(explicitCvJob.masterIntent, "PROMOTE_EXPLICIT");

  const processedExplicitCvJob = await processOneCvJob(
    cvWorker,
    explicitCvJob.id,
  );
  const activeAfter = await masterPromotion.getActiveDesignation({
    ownerType: "USER",
    userId: user.id,
  });
  assert.notEqual(activeAfter?.id, activeBefore?.id);
  assert.equal(
    activeAfter?.cvStructuredProfileId,
    processedExplicitCvJob.cvStructuredProfileId,
  );
});

test("6) reuso de Resume existente (variante 'arquivo') com saveAsMaster=true promove; sem a flag, não promove", async () => {
  const user = await createUser();
  const storage = new FakeStorage();
  const cvWorker = buildProcessingWorker(
    async () => fakeCanonicalOutput("Resume Antigo"),
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

  const resume = await prisma.resume.create({
    data: {
      userId: user.id,
      title: "CV antigo",
      isMaster: false,
      rawText: buildCvText("Resume Antigo", "juridico"),
    },
  });

  // Sem saveAsMaster: masterIntent PROMOTE_IF_FIRST (usuário ainda sem
  // Master) — mas isso não é o que este teste quer provar; o que importa é
  // que reusar masterResumeId nunca promove por si só quando o usuário já
  // TEM Master e saveAsMaster é false.
  const setup = await service.startAuthenticatedAnalysisJob(user.id, {
    jobDescriptionText: JOB_DESCRIPTION,
    masterCvText: buildCvText("Master Atual", "rh"),
  });
  const setupJob = await database.analysisJob.findUniqueOrThrow({
    where: { id: setup.jobId },
  });
  await processOneCvJob(cvWorker, setupJob.cvProcessingJobId as string);
  const activeBefore = await masterPromotion.getActiveDesignation({
    ownerType: "USER",
    userId: user.id,
  });
  assert.ok(activeBefore);

  const noPromote = await service.startAuthenticatedAnalysisJob(user.id, {
    jobDescriptionText: JOB_DESCRIPTION,
    masterResumeId: resume.id,
    saveAsMaster: false,
  });
  const noPromoteJobRow = await database.analysisJob.findUniqueOrThrow({
    where: { id: noPromote.jobId },
  });
  const noPromoteCvJob = await database.cvProcessingJob.findUniqueOrThrow({
    where: { id: noPromoteJobRow.cvProcessingJobId as string },
  });
  assert.equal(noPromoteCvJob.masterIntent, "NONE");
  // Processa antes de disparar a próxima análise — enqueue() reaproveita um
  // CvProcessingJob PENDING/PROCESSING existente pro mesmo cvSourceId (Fase
  // 2A/B, dedup por cvSourceId); sem esgotar este primeiro, a próxima
  // chamada com o MESMO conteúdo (masterResumeId aponta pro mesmo texto)
  // reaproveitaria este job "NONE" em vez de criar um novo "PROMOTE_EXPLICIT".
  await processOneCvJob(cvWorker, noPromoteCvJob.id);

  const explicit = await service.startAuthenticatedAnalysisJob(user.id, {
    jobDescriptionText: JOB_DESCRIPTION,
    masterResumeId: resume.id,
    saveAsMaster: true,
  });
  const explicitJobRow = await database.analysisJob.findUniqueOrThrow({
    where: { id: explicit.jobId },
  });
  const explicitCvJob = await database.cvProcessingJob.findUniqueOrThrow({
    where: { id: explicitJobRow.cvProcessingJobId as string },
  });
  assert.equal(explicitCvJob.masterIntent, "PROMOTE_EXPLICIT");
});

// ---------------------------------------------------------------------------
// 7. Duas análises simultâneas do mesmo conteúdo — não duplicam extração.
// ---------------------------------------------------------------------------
test("7) duas análises concorrentes do mesmo conteúdo — extração real roda só uma vez", async () => {
  const user = await createUser();
  const storage = new FakeStorage();
  let extractCalls = 0;
  const cvWorker = buildProcessingWorker(async () => {
    extractCalls += 1;
    return fakeCanonicalOutput("Concorrente");
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

  const sameText = buildCvText("Concorrente", "suporte");
  const [first, second] = await Promise.all([
    service.startAuthenticatedAnalysisJob(user.id, {
      jobDescriptionText: JOB_DESCRIPTION,
      masterCvText: sameText,
    }),
    service.startAuthenticatedAnalysisJob(user.id, {
      jobDescriptionText: JOB_DESCRIPTION,
      masterCvText: sameText,
    }),
  ]);

  const firstRow = await database.analysisJob.findUniqueOrThrow({
    where: { id: first.jobId },
  });
  const secondRow = await database.analysisJob.findUniqueOrThrow({
    where: { id: second.jobId },
  });

  // Mesmo CvSource (dedup por hash) em qualquer caso.
  const firstCvJob = await database.cvProcessingJob.findUniqueOrThrow({
    where: { id: firstRow.cvProcessingJobId as string },
  });
  const secondCvJob = await database.cvProcessingJob.findUniqueOrThrow({
    where: { id: secondRow.cvProcessingJobId as string },
  });
  assert.equal(firstCvJob.cvSourceId, secondCvJob.cvSourceId);

  // Processa os jobs pendentes para este cvSourceId (pode ser 1 ou 2 linhas
  // de CvProcessingJob dependendo da corrida — ver nota no relatório final —
  // mas a extração real, protegida pelo unique(cvSourceId, extractorVersion,
  // schemaVersion) + curto-circuito em ensureStructuredProfile, nunca roda
  // mais de uma vez).
  const pendingForSource = await database.cvProcessingJob.findMany({
    where: { cvSourceId: firstCvJob.cvSourceId, status: "PENDING" },
  });
  for (const job of pendingForSource) {
    await processOneCvJob(cvWorker, job.id);
  }
  if (firstCvJob.status === "PENDING")
    await processOneCvJob(cvWorker, firstCvJob.id).catch(() => undefined);

  assert.equal(extractCalls, 1);
});

// ---------------------------------------------------------------------------
// 8. Dois CVs disputando ser o primeiro Master do mesmo usuário (conexões
//    reais de banco) — via CvProcessingWorker, cada um com seu próprio
//    CvProcessingJob PROMOTE_IF_FIRST.
// ---------------------------------------------------------------------------
test("8) dois CvProcessingJob concorrentes disputando o primeiro Master — exatamente um vence", async () => {
  const user = await createUser();
  const storageA = new FakeStorage();
  const storageB = new FakeStorage();
  const entrypointA = new CvProcessingEntrypointService(
    database,
    jobService,
    storageA,
  );
  const entrypointB = new CvProcessingEntrypointService(
    database,
    jobService,
    storageB,
  );

  const enqueuedA = await entrypointA.enqueueFromUserText({
    userId: user.id,
    text: buildCvText("Candidato A", "engenharia"),
    masterIntent: "PROMOTE_IF_FIRST",
    submission: { origin: "PASTED_TEXT" },
  });
  const enqueuedB = await entrypointB.enqueueFromUserText({
    userId: user.id,
    text: buildCvText("Candidato B", "design"),
    masterIntent: "PROMOTE_IF_FIRST",
    submission: { origin: "PASTED_TEXT" },
  });

  const workerA = buildProcessingWorker(
    async () => fakeCanonicalOutput("Candidato A"),
    storageA,
  );
  const workerB = buildProcessingWorker(
    async () => fakeCanonicalOutput("Candidato B"),
    storageB,
  );

  await Promise.all([
    processOneCvJob(workerA, enqueuedA.job.id),
    processOneCvJob(workerB, enqueuedB.job.id),
  ]);

  const activeDesignations = await prisma.cvMasterDesignation.findMany({
    where: { userId: user.id, supersededAt: null },
  });
  assert.equal(activeDesignations.length, 1);

  const bothJobs = await prisma.cvProcessingJob.findMany({
    where: { id: { in: [enqueuedA.job.id, enqueuedB.job.id] } },
  });
  assert.ok(bothJobs.every((j) => j.status === "READY"));
});

// ---------------------------------------------------------------------------
// 9. Retry depois de uma "queda" simulada entre extração READY e execução
//    da análise.
// ---------------------------------------------------------------------------
test("9) retry após queda entre CvProcessingJob READY e execução da análise", async () => {
  const user = await createUser();
  const storage = new FakeStorage();
  let extractCalls = 0;
  const cvWorker = buildProcessingWorker(async () => {
    extractCalls += 1;
    return fakeCanonicalOutput("Retry Cenario 9");
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

  const started = await service.startAuthenticatedAnalysisJob(user.id, {
    jobDescriptionText: JOB_DESCRIPTION,
    masterCvText: buildCvText("Retry Cenario 9", "operacoes"),
  });
  const row = await database.analysisJob.findUniqueOrThrow({
    where: { id: started.jobId },
  });
  await processOneCvJob(cvWorker, row.cvProcessingJobId as string);
  assert.equal(extractCalls, 1);

  // Simula "queda": reivindica o AnalysisJob (pending -> processing) mas
  // nunca chega a processá-lo — só marca startedAt bem no passado, como se
  // o worker tivesse morrido logo depois de reivindicar.
  await database.analysisJob.update({
    where: { id: started.jobId },
    data: {
      status: "processing",
      startedAt: new Date(Date.now() - 60 * 60_000),
    },
  });

  const recovered = await (
    analysisWorker as unknown as {
      recoverStaleProcessing: () => Promise<number>;
    }
  ).recoverStaleProcessing();
  assert.equal(recovered, 1);

  const afterRecovery = await database.analysisJob.findUniqueOrThrow({
    where: { id: started.jobId },
  });
  assert.equal(afterRecovery.status, "pending");

  const final = await processOneAnalysisJob(analysisWorker, started.jobId);
  assert.equal(final.status, "succeeded");
  assert.equal(extractCalls, 1); // nunca reextrai
});

// ---------------------------------------------------------------------------
// 10. Retry depois da análise já ter concluído mas antes de marcar
//     succeeded (crash simulado exatamente nesse ponto).
// ---------------------------------------------------------------------------
test("10) retry após análise concluída mas antes de marcar succeeded — não recomputa a IA (dedup por payload)", async () => {
  const user = await createUser();
  const storage = new FakeStorage();
  const cvWorker = buildProcessingWorker(
    async () => fakeCanonicalOutput("Retry Cenario 10"),
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

  const started = await service.startAuthenticatedAnalysisJob(user.id, {
    jobDescriptionText: JOB_DESCRIPTION,
    masterCvText: buildCvText("Retry Cenario 10", "atendimento"),
  });
  const row = await database.analysisJob.findUniqueOrThrow({
    where: { id: started.jobId },
  });
  await processOneCvJob(cvWorker, row.cvProcessingJobId as string);

  // "Computa" a análise (popula o cache do fake, simulando a chamada de IA
  // já ter terminado) sem persistir o resultado — como se o processo tivesse
  // morrido exatamente entre a resposta da IA e o UPDATE final.
  const cvProcessingJob = await database.cvProcessingJob.findUniqueOrThrow({
    where: { id: row.cvProcessingJobId as string },
  });
  const structuredProfile =
    await database.cvStructuredProfile.findUniqueOrThrow({
      where: { id: cvProcessingJob.cvStructuredProfileId as string },
    });
  const mapped = userProfileSync.toCanonicalProfileData(
    structuredProfile.canonicalJson as never,
  );
  const canonicalText = service.renderCanonicalProfileTextForPipeline({
    ...mapped,
    certifications: mapped.certifications ?? [],
    education: mapped.education ?? [],
    experiences: mapped.experiences ?? [],
    languages: mapped.languages ?? [],
    skills: mapped.skills ?? { technical: [], business: [], soft: [] },
  });
  await service.runCanonicalAuthenticatedAnalysis({
    userId: user.id,
    jobDescriptionText: row.jobDescriptionText,
    canonicalCvText: canonicalText,
  });
  assert.equal(protectedAnalyze.computeCalls, 1);

  // Simula que o AnalysisJob ficou travado em "processing" (claim aconteceu,
  // resultado nunca foi persistido).
  await database.analysisJob.update({
    where: { id: started.jobId },
    data: {
      status: "processing",
      startedAt: new Date(Date.now() - 60 * 60_000),
    },
  });
  await (
    analysisWorker as unknown as {
      recoverStaleProcessing: () => Promise<number>;
    }
  ).recoverStaleProcessing();

  const final = await processOneAnalysisJob(analysisWorker, started.jobId);
  assert.equal(final.status, "succeeded");
  // Mesmo payload (mesmo canonicalCvText + jobDescriptionText) -> cache do
  // gateway de proteção evita recomputar a análise de IA.
  assert.equal(protectedAnalyze.computeCalls, 1);
});

// ---------------------------------------------------------------------------
// 11/13. Falha da extração (CvProcessingJob FAILED, inclusive por objeto
//        ausente no storage) — AnalysisJob reflete corretamente, sem limbo.
// ---------------------------------------------------------------------------
test("11/13) extração falha (objeto ausente no storage) — AnalysisJob correspondente vai a failed, sem limbo", async () => {
  const user = await createUser();
  const storage = new FakeStorage();
  const entrypoint = new CvProcessingEntrypointService(
    database,
    jobService,
    storage,
  );
  const protectedAnalyze = new FakeProtectedAnalyzeService();
  const service = buildCvAdaptationService(
    protectedAnalyze,
    entrypoint,
    masterPromotion,
  );
  const analysisWorker = buildAnalysisWorker(service);
  const cvWorker = buildProcessingWorker(
    async () => fakeCanonicalOutput("Nunca Chega"),
    storage,
  );

  const started = await service.startAuthenticatedAnalysisJob(user.id, {
    jobDescriptionText: JOB_DESCRIPTION,
    masterCvText: buildCvText("Objeto vai sumir", "compras"),
  });
  const row = await database.analysisJob.findUniqueOrThrow({
    where: { id: started.jobId },
  });
  const cvProcessingJobId = row.cvProcessingJobId as string;
  const cvJobBefore = await database.cvProcessingJob.findUniqueOrThrow({
    where: { id: cvProcessingJobId },
  });
  const cvSource = await database.cvSource.findUniqueOrThrow({
    where: { id: cvJobBefore.cvSourceId },
  });

  // Simula perda do objeto no storage (expirado/removido por retenção).
  const storageWithoutObject = new FakeStorage();
  const cvWorkerBroken = buildProcessingWorker(
    async () => fakeCanonicalOutput("Nunca Chega"),
    storageWithoutObject,
  );
  void cvSource;
  void cvWorker;

  // Esgota as tentativas até FAILED (MAX_CV_PROCESSING_ATTEMPTS = 3).
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await database.cvProcessingJob.update({
      where: { id: cvProcessingJobId },
      data: { status: "PENDING", claimedAt: null, workerId: null },
    });
    await processOneCvJob(cvWorkerBroken, cvProcessingJobId);
  }
  const cvJobAfter = await database.cvProcessingJob.findUniqueOrThrow({
    where: { id: cvProcessingJobId },
  });
  assert.equal(cvJobAfter.status, "FAILED");

  const finalAnalysis = await processOneAnalysisJobRespectingDependency(
    analysisWorker,
    started.jobId,
  );
  assert.equal(finalAnalysis.status, "failed");
  assert.match(finalAnalysis.lastError ?? "", /objeto ausente no storage/);
});

// ---------------------------------------------------------------------------
// 12. Falha da análise em si (extração READY, análise falha) — Master
//     promovido permanece; reprocessável sem repetir extração/promoção.
// ---------------------------------------------------------------------------
test("12) análise falha após extração/Master READY — Master permanece, retry não repete extração/promoção", async () => {
  const user = await createUser();
  const storage = new FakeStorage();
  let extractCalls = 0;
  const cvWorker = buildProcessingWorker(async () => {
    extractCalls += 1;
    return fakeCanonicalOutput("Master Preservado");
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

  const started = await service.startAuthenticatedAnalysisJob(user.id, {
    jobDescriptionText: JOB_DESCRIPTION,
    masterCvText: buildCvText("Master Preservado", "qualidade"),
  });
  const row = await database.analysisJob.findUniqueOrThrow({
    where: { id: started.jobId },
  });
  await processOneCvJob(cvWorker, row.cvProcessingJobId as string);

  const designationBefore = await masterPromotion.getActiveDesignation({
    ownerType: "USER",
    userId: user.id,
  });
  assert.ok(designationBefore);

  protectedAnalyze.setFailNextCompute(true);
  const failed = await processOneAnalysisJob(analysisWorker, started.jobId);
  assert.equal(failed.status, "failed");
  assert.match(failed.lastError ?? "", /falha simulada na chamada de IA/);

  // Master permanece intacto após a falha da análise.
  const designationAfter = await masterPromotion.getActiveDesignation({
    ownerType: "USER",
    userId: user.id,
  });
  assert.equal(designationAfter?.id, designationBefore?.id);
  assert.equal(extractCalls, 1);

  // Retry: reseta só o AnalysisJob (ação de suporte/nova tentativa) — nunca
  // repete extração nem promoção.
  await database.analysisJob.update({
    where: { id: started.jobId },
    data: { status: "pending", startedAt: null, lastError: null },
  });
  const retried = await processOneAnalysisJob(analysisWorker, started.jobId);
  assert.equal(retried.status, "succeeded");
  assert.equal(extractCalls, 1);

  const designationFinal = await masterPromotion.getActiveDesignation({
    ownerType: "USER",
    userId: user.id,
  });
  assert.equal(designationFinal?.id, designationBefore?.id);
});

// ---------------------------------------------------------------------------
// 14. Estruturalmente impossível AnalysisJob virar succeeded sem
//     cvStructuredProfileId de um CvStructuredProfile READY.
// ---------------------------------------------------------------------------
test("14) AnalysisJob succeeded sempre carrega cvStructuredProfileId de um CvStructuredProfile READY", async () => {
  const user = await createUser();
  const storage = new FakeStorage();
  const cvWorker = buildProcessingWorker(
    async () => fakeCanonicalOutput("Invariante 14"),
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

  const started = await service.startAuthenticatedAnalysisJob(user.id, {
    jobDescriptionText: JOB_DESCRIPTION,
    masterCvText: buildCvText("Invariante 14", "projetos"),
  });
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

  // O worker nunca marca succeeded sem antes ter confirmado READY — provado
  // pelo código de processReadyJob (lança antes de chegar no update se
  // cvStructuredProfileId ausente ou perfil não READY). Um CHECK de banco
  // equivalente (plano, seção 9/17) fica reservado pra Fase 5.
});

// ---------------------------------------------------------------------------
// 15. Estruturalmente impossível qualquer chamada de IA dentro do ciclo de
//     request HTTP.
// ---------------------------------------------------------------------------
test("15) nenhuma chamada de IA acontece dentro do request — só depois, no worker", async () => {
  const user = await createUser();
  const storage = new FakeStorage();
  const cvWorker = buildProcessingWorker(
    async () => fakeCanonicalOutput("Sem IA no Request"),
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

  const started = await service.startAuthenticatedAnalysisJob(user.id, {
    jobDescriptionText: JOB_DESCRIPTION,
    masterCvText: buildCvText("Sem IA no Request", "dados"),
  });

  // await do controller/service já retornou — nenhuma chamada de IA (nem
  // de extração, nem de análise) pode ter acontecido até este ponto.
  assert.equal(protectedAnalyze.computeCalls, 0);

  const row = await database.analysisJob.findUniqueOrThrow({
    where: { id: started.jobId },
  });
  await processOneCvJob(cvWorker, row.cvProcessingJobId as string);
  assert.equal(protectedAnalyze.computeCalls, 0); // extração != análise

  await processOneAnalysisJob(analysisWorker, started.jobId);
  assert.equal(protectedAnalyze.computeCalls, 1); // só agora, fora do request
});

// ---------------------------------------------------------------------------
// 16. Flag desligada mantém o caminho legado (dispatch nunca chega no
//     pipeline novo).
// ---------------------------------------------------------------------------
test("16) flag desligada nunca chama o pipeline novo (dispatch legado intacto)", async () => {
  const user = await createUser();
  let entrypointCalls = 0;
  const entrypoint: Pick<CvProcessingEntrypointService, "enqueueFromUserText"> =
    {
      enqueueFromUserText: async () => {
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
    // Caminho legado (startAuthenticatedAnalysisJob original) cria o
    // AnalysisJob e dispara processAnalysisJob em BACKGROUND (fire-and-
    // forget, .catch apenas loga) — o próprio comportamento legado que a
    // Fase 2C não pode alterar. Por isso a chamada RESOLVE normalmente
    // mesmo sem masterResumeId/file/masterCvText; a falha
    // ("masterResumeId, PDF file or CV text is required.") acontece depois,
    // assíncrona, e marca o AnalysisJob como failed — nunca chega a rejeitar
    // a Promise que o controller aguarda.
    const result = await service.startAuthenticatedAnalysisJob(user.id, {
      jobDescriptionText: JOB_DESCRIPTION,
    });
    assert.equal(result.status, "pending");

    // Aguarda o processamento fire-and-forget legado terminar (falha, já
    // que não há file/texto/masterResumeId) antes de checar o estado final —
    // faz polling em vez de um sleep fixo (evita flakiness sob carga).
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
    assert.equal(finalRow.status, "failed");
    assert.equal(finalRow.cvProcessingJobId, null); // nunca tocou o pipeline novo
  } finally {
    process.env.CV_STRUCTURED_PROFILE_PIPELINE_ENABLED = previous;
  }
  assert.equal(entrypointCalls, 0);
});

// ---------------------------------------------------------------------------
// 17. Processo "morto" depois da resposta HTTP é retomado por outro
//     worker/ciclo sem duplicar trabalho — simulado com instâncias
//     completamente novas dos workers (equivalente a um novo processo).
// ---------------------------------------------------------------------------
test("17) processo morto após a resposta HTTP — retomado por instâncias novas dos workers, sem duplicar", async () => {
  const user = await createUser();
  const storage = new FakeStorage();
  let extractCalls = 0;
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

  // "Processo 1": só persiste e responde — depois desaparece (nenhuma
  // instância de worker é usada aqui).
  const started = await service.startAuthenticatedAnalysisJob(user.id, {
    jobDescriptionText: JOB_DESCRIPTION,
    masterCvText: buildCvText("Processo Morto", "infraestrutura"),
  });

  // "Processo 2": instâncias completamente novas de tudo, construídas do
  // zero (equivalente a um redeploy/reinício) — só leem o estado
  // persistido no banco.
  const freshCvWorker = new CvProcessingWorker(
    new DatabaseService(new PrismaClient()),
    new IngestionLockRepository(database),
    new CvProcessingJobService(database),
    {
      extract: async () => {
        extractCalls += 1;
        return fakeCanonicalOutput("Processo Morto");
      },
    },
    new CvTalentCaptureService(database),
    new CvMasterPromotionService(
      database,
      new CvUserProfileSyncService(
        new ProfileCanonicalMergeService(),
        new ProfileReadinessService(),
      ),
    ),
    storage,
  );
  const freshAnalysisWorker = new CvAnalysisWorker(
    database,
    new IngestionLockRepository(database),
    new CvUserProfileSyncService(
      new ProfileCanonicalMergeService(),
      new ProfileReadinessService(),
    ),
    service,
  );

  const row = await database.analysisJob.findUniqueOrThrow({
    where: { id: started.jobId },
  });
  await processOneCvJob(freshCvWorker, row.cvProcessingJobId as string);
  const final = await processOneAnalysisJob(freshAnalysisWorker, started.jobId);

  assert.equal(final.status, "succeeded");
  assert.equal(extractCalls, 1);
  assert.equal(protectedAnalyze.computeCalls, 1);
});
