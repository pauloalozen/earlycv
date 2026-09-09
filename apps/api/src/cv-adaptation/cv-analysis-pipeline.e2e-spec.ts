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
//
// Fase 2C.1 (testes "2C.1) ...", ao final do arquivo): fecha a lacuna que a
// 2C deixou — inputMode "profile" (análise sem conteúdo novo) agora também
// passa pelo pipeline canônico, localizando/materializando o Master formal
// (CvMasterDesignation ativa, ou Resume.isMaster legado) em vez de
// reconstruir o CV a partir de UserProfile.
process.env.CV_STRUCTURED_PROFILE_PIPELINE_ENABLED = "true";

import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { test } from "node:test";

import { BadRequestException } from "@nestjs/common";
import type { CvProcessingJob } from "@prisma/client";
import { PrismaClient } from "@prisma/client";
import { CvMasterPromotionService } from "../cv-processing/cv-master-promotion.service";
import { CvProcessingWorker } from "../cv-processing/cv-processing.worker";
import {
  CV_PROCESSING_JOB_CREATED,
  cvProcessingDispatchSignal,
} from "../cv-processing/cv-processing-dispatch.signal";
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
  // Achado da auditoria do pipeline canônico (2026-09-08): a análise
  // achatava o CvStructuredProfile.canonicalJson em texto antes de mandar
  // pra IA. Captura o canonicalCvProfile efetivamente recebido aqui pra
  // provar, nos testes abaixo, que quem chama este fake está mandando o
  // perfil estruturado real — nunca só o texto achatado.
  lastCanonicalCvProfile: unknown;

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
    canonicalCvProfile?: unknown;
  }) {
    this.lastCanonicalCvProfile = input.canonicalCvProfile;
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

  // Captura o que ensureLegacyStructuredOutput (geração pós-desbloqueio)
  // efetivamente manda pro gateway de proteção — prova, com Postgres real,
  // que resolveGenerationCvSource decide certo entre canonicalCvProfile e
  // masterCvText conforme a linhagem real (AnalysisJob.cvProcessingJobId),
  // nunca só por cvStructuredProfileId ser null.
  generationCalls = 0;
  lastGenerationCanonicalCvProfile: unknown;
  lastGenerationMasterCvText: string | undefined;

  async executeProtectedBuildPaidCvOutputFromGuest(input: {
    canonicalCvProfile?: unknown;
    masterCvText?: string;
  }) {
    this.generationCalls += 1;
    this.lastGenerationCanonicalCvProfile = input.canonicalCvProfile;
    this.lastGenerationMasterCvText = input.masterCvText;
    return {
      ok: true as const,
      cached: false,
      canonicalHash: "gen-hash",
      result: {
        summary: "resumo gerado (fake)",
        sections: [],
        highlightedSkills: [],
        removedSections: [],
      },
    };
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

// Isolamento real pro scan em lote (item 1 da correção pós-3ª-rodada):
// processPendingBatch() é um scan global (mesmo método do cron real), e
// PENDING/FAILED de OUTROS arquivos de teste (mesmo earlycv_test
// compartilhado) competem pelo BATCH_SIZE pequeno do worker. A correção
// anterior (marcar temporariamente PROCESSING e restaurar depois) foi
// rejeitada: sobrescrever o status de uma fixture alheia pode colidir com
// uma mudança concorrente legítima daquela outra spec/worker.
//
// Este subclass, exclusivo do harness de teste (nunca instanciado em
// produção — CvProcessingJobService nunca ganha filtro de runId), troca
// SÓ o método findPending() por uma versão que enxerga apenas os IDs que
// o próprio teste registrou — nenhuma outra fixture é lida, alterada ou
// processada, então não há nada pra restaurar. claimOne/
// recoverStaleProcessing continuam os métodos reais herdados (claim é
// sempre por ID específico, nunca um scan).
class ScopedCvProcessingJobService extends CvProcessingJobService {
  private readonly ownJobIds = new Set<string>();

  constructor(private readonly scopedDatabase: DatabaseService) {
    super(scopedDatabase);
  }

  trackOwnJob(jobId: string): void {
    this.ownJobIds.add(jobId);
  }

  async findPending(limit: number): Promise<CvProcessingJob[]> {
    if (this.ownJobIds.size === 0) return [];
    return this.scopedDatabase.cvProcessingJob.findMany({
      where: { status: "PENDING", id: { in: [...this.ownJobIds] } },
      orderBy: { createdAt: "asc" },
      take: limit,
    });
  }
}

function buildScopedProcessingWorker(
  extract: () => Promise<MasterCvCanonicalExtractionOutput>,
  storage: FakeStorage,
): { worker: CvProcessingWorker; scopedJobService: ScopedCvProcessingJobService } {
  const scopedJobService = new ScopedCvProcessingJobService(database);
  const worker = new CvProcessingWorker(
    database,
    lockRepository,
    scopedJobService,
    { extract },
    talentCapture,
    masterPromotion,
    storage,
  );
  return { worker, scopedJobService };
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

// Achado da auditoria do pipeline canônico (2026-09-08): mesmo com
// CV_STRUCTURED_PROFILE_PIPELINE_ENABLED e CvStructuredProfile READY, a
// análise sempre recebia texto achatado (renderCanonicalProfileTextForPipeline)
// no lugar do perfil estruturado. Prova de wiring real (fim a fim, banco
// Postgres real, worker real): o objeto que chega no gateway de proteção
// (o que de fato vira o prompt da IA em produção) é o
// CvStructuredProfile.canonicalJson gravado pela extração — nunca undefined,
// nunca um texto.
test("1b) análise canônica envia canonicalCvProfile estruturado (CvStructuredProfile.canonicalJson), nunca undefined", async () => {
  const user = await createUser();
  const storage = new FakeStorage();
  const cvWorker = buildProcessingWorker(
    async () => fakeCanonicalOutput("Fulano Canonical Profile"),
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

  const setup = await service.startAuthenticatedAnalysisJob(user.id, {
    jobDescriptionText: JOB_DESCRIPTION,
    masterCvText: buildCvText("Fulano Canonical Profile", "dados"),
  });
  const setupJob = await database.analysisJob.findUniqueOrThrow({
    where: { id: setup.jobId },
  });
  await processOneCvJob(cvWorker, setupJob.cvProcessingJobId as string);

  const finalJob = await processOneAnalysisJob(analysisWorker, setup.jobId);
  assert.equal(finalJob.status, "succeeded");

  const structuredProfile =
    await database.cvStructuredProfile.findUniqueOrThrow({
      where: { id: finalJob.cvStructuredProfileId as string },
    });

  assert.ok(
    protectedAnalyze.lastCanonicalCvProfile,
    "canonicalCvProfile não deveria ser undefined — pipeline canônico ligado e CvStructuredProfile READY",
  );
  assert.deepEqual(
    protectedAnalyze.lastCanonicalCvProfile,
    structuredProfile.canonicalJson,
    "o perfil enviado ao gateway de proteção (que vira o prompt da IA) deve ser EXATAMENTE o canonicalJson gravado pela extração, não uma derivação/achatamento dele",
  );

  // Achado da auditoria de GERAÇÃO do CV adaptado (2026-09-08): o vínculo
  // com o CvStructuredProfile se perdia na materialização do CvAdaptation
  // (saveGuestPreview/claimGuestAnalysisJob nunca carregavam
  // AnalysisJob.cvStructuredProfileId pro CvAdaptation criado) — a geração
  // (ensureLegacyStructuredOutput, chamada no download/claim) então nunca
  // tinha como achar o perfil estruturado, mesmo a análise já tendo usado
  // um. Prova de ponta a ponta: materializar via claimGuestAnalysisJob (o
  // único caminho real de AnalysisJob -> CvAdaptation) preserva o mesmo
  // cvStructuredProfileId.
  const claimResult = await service.claimGuestAnalysisJob(user.id, setup.jobId);
  assert.equal(claimResult.status, "succeeded");
  if (claimResult.status !== "succeeded") return; // narrowing pro TS

  const materializedAdaptation = await database.cvAdaptation.findUniqueOrThrow(
    { where: { id: claimResult.cvAdaptationId } },
  );
  assert.equal(
    materializedAdaptation.cvStructuredProfileId,
    finalJob.cvStructuredProfileId,
    "CvAdaptation.cvStructuredProfileId deve preservar EXATAMENTE o mesmo id usado pela análise — é o que a geração (pós-desbloqueio) usa pra achar o perfil certo, nunca reler texto achatado",
  );
});

// ---------------------------------------------------------------------------
// Seção 1 do relatório de fechamento (2026-09-08): a decisão de fonte da
// GERAÇÃO nunca pode ser "cvStructuredProfileId null = legado" — precisa
// olhar a LINHAGEM real (AnalysisJob.cvProcessingJobId, via
// AnalysisJob.convertedCvAdaptationId -> CvAdaptation.originAnalysisJob).
// Os 5 cenários abaixo provam isso com Postgres real.
// ---------------------------------------------------------------------------

// Monta uma análise canônica completa (READY) já materializada como
// CvAdaptation — ponto de partida comum pros 5 cenários de linhagem.
async function setupReadyCanonicalAdaptation(nameSuffix: string) {
  const user = await createUser();
  const storage = new FakeStorage();
  const cvWorker = buildProcessingWorker(
    async () => fakeCanonicalOutput(`Linhagem ${nameSuffix}`),
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

  const setup = await service.startAuthenticatedAnalysisJob(user.id, {
    jobDescriptionText: JOB_DESCRIPTION,
    masterCvText: buildCvText(`Linhagem ${nameSuffix}`, "dados"),
  });
  const setupJob = await database.analysisJob.findUniqueOrThrow({
    where: { id: setup.jobId },
  });
  await processOneCvJob(cvWorker, setupJob.cvProcessingJobId as string);
  const finalJob = await processOneAnalysisJob(analysisWorker, setup.jobId);
  assert.equal(finalJob.status, "succeeded");

  const claimResult = await service.claimGuestAnalysisJob(user.id, setup.jobId);
  assert.equal(claimResult.status, "succeeded");
  if (claimResult.status !== "succeeded") throw new Error("unreachable");

  return { user, service, protectedAnalyze, finalJob, claimResult };
}

async function loadAdaptationForGeneration(cvAdaptationId: string) {
  return database.cvAdaptation.findUniqueOrThrow({
    where: { id: cvAdaptationId },
    include: { masterResume: { select: { rawText: true } } },
  });
}

test("linhagem 1) pipeline novo com FK completa — geração usa canonicalCvProfile, nunca masterCvText", async () => {
  const { protectedAnalyze, service, claimResult, finalJob } =
    await setupReadyCanonicalAdaptation("FK completa");
  const adaptation = await loadAdaptationForGeneration(
    claimResult.cvAdaptationId,
  );

  // biome-ignore lint/suspicious/noExplicitAny: acesso a método privado pra testar resolveGenerationCvSource
  const output = await (service as any).ensureLegacyStructuredOutput(
    adaptation,
  );

  assert.ok(output);
  assert.equal(protectedAnalyze.generationCalls, 1);
  assert.equal(protectedAnalyze.lastGenerationMasterCvText, undefined);
  const structuredProfile = await database.cvStructuredProfile.findUniqueOrThrow(
    { where: { id: finalJob.cvStructuredProfileId as string } },
  );
  assert.deepEqual(
    protectedAnalyze.lastGenerationCanonicalCvProfile,
    structuredProfile.canonicalJson,
  );
});

test("linhagem 2) pipeline novo com cvStructuredProfileId removido artificialmente — falha explícita, nunca cai pro texto", async () => {
  const { service, claimResult } = await setupReadyCanonicalAdaptation(
    "FK removida",
  );

  // Simula a FK se perdendo (o próprio bug que corrigimos hoje, ou qualquer
  // outra causa) — o AnalysisJob de origem AINDA tem cvProcessingJobId, só a
  // CvAdaptation perdeu a referência.
  await database.cvAdaptation.update({
    where: { id: claimResult.cvAdaptationId },
    data: { cvStructuredProfileId: null },
  });
  const adaptation = await loadAdaptationForGeneration(
    claimResult.cvAdaptationId,
  );

  await assert.rejects(
    // biome-ignore lint/suspicious/noExplicitAny: acesso a método privado
    () => (service as any).ensureLegacyStructuredOutput(adaptation),
    /lineage inconsistency|missing or not READY/,
  );
});

test("linhagem 3) pipeline novo com CvStructuredProfile FAILED — falha explícita, nunca cai pro texto", async () => {
  const { service, claimResult, finalJob } =
    await setupReadyCanonicalAdaptation("perfil FAILED");

  // READY -> FAILED é bloqueado pelo próprio banco desde a migration
  // 20260908210000 (READY é terminal) — não dá mais pra simular este
  // estado via UPDATE num profile que já foi READY. Constrói um profile
  // FAILED do zero (nunca chegou a READY) e aponta o objeto em memória
  // pra ele — o alvo do teste é o comportamento de
  // ensureLegacyStructuredOutput, não a escrita da FK em si.
  const originalProfile = await database.cvStructuredProfile.findUniqueOrThrow(
    { where: { id: finalJob.cvStructuredProfileId as string } },
  );
  const failedProfile = await prisma.cvStructuredProfile.create({
    data: {
      cvSourceId: originalProfile.cvSourceId,
      extractorVersion: "v2-failed",
      schemaVersion: "v1",
      status: "FAILED",
    },
  });
  const adaptation = await loadAdaptationForGeneration(
    claimResult.cvAdaptationId,
  );
  (adaptation as { cvStructuredProfileId: string | null }).cvStructuredProfileId =
    failedProfile.id;

  await assert.rejects(
    // biome-ignore lint/suspicious/noExplicitAny: acesso a método privado
    () => (service as any).ensureLegacyStructuredOutput(adaptation),
    /missing or not READY/,
  );
});

test("linhagem 4) análise legada (sem AnalysisJob de origem) — geração usa masterCvText, comportamento intacto", async () => {
  const user = await createUser();
  const storage = new FakeStorage();
  const protectedAnalyze = new FakeProtectedAnalyzeService();
  const entrypoint = new CvProcessingEntrypointService(
    database,
    jobService,
    storage,
  );
  // Constrói com storage REAL (FakeStorage) em vez do default no-op de
  // buildCvAdaptationService — este cenário precisa ler texto de verdade de
  // volta do snapshot pra provar que a fonte é mesmo o texto, não vazio.
  const service = new CvAdaptationServiceCtor(
    database,
    undefined,
    undefined,
    undefined,
    undefined,
    protectedAnalyze,
    storage,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    entrypoint,
    masterPromotion,
  );

  // CvAdaptation sem NENHUM AnalysisJob apontando pra ela via
  // convertedCvAdaptationId — simula o caminho legado create()/
  // analyzeAndAdapt (nunca cria AnalysisJob) ou qualquer adaptação anterior
  // a esta feature. AnalysisCvSnapshot (sem cvStructuredProfileId) é a fonte
  // real, exatamente como resolveGenerationMasterCvText sempre leu.
  const resume = await prisma.resume.create({
    data: {
      userId: user.id,
      title: "Master legado",
      isMaster: true,
      rawText: buildCvText("Legado puro", "vendas"),
    },
  });
  const snapshotText = buildCvText("Legado puro", "vendas");
  const textStorageKey = `analysis-cv-snapshots/text/${randomUUID()}.md`;
  await storage.putObject(textStorageKey, Buffer.from(snapshotText, "utf8"));
  const snapshot = await prisma.analysisCvSnapshot.create({
    data: {
      userId: user.id,
      sourceType: "master_resume",
      textStorageKey,
      textSha256: createHash("sha256").update(snapshotText).digest("hex"),
      textSizeBytes: Buffer.byteLength(snapshotText),
      professionalProfileFingerprint: "fp-legado",
      professionalProfileJson: {},
      cvStructuredProfileId: null,
    },
  });
  const legacyAdaptation = await prisma.cvAdaptation.create({
    data: {
      userId: user.id,
      masterResumeId: resume.id,
      jobDescriptionText: JOB_DESCRIPTION,
      analysisCvSnapshotId: snapshot.id,
      status: "pending",
      paymentStatus: "none",
    },
  });

  const adaptation = await loadAdaptationForGeneration(legacyAdaptation.id);
  // biome-ignore lint/suspicious/noExplicitAny: acesso a método privado
  const output = await (service as any).ensureLegacyStructuredOutput(
    adaptation,
  );

  assert.ok(output);
  assert.equal(protectedAnalyze.generationCalls, 1);
  assert.equal(protectedAnalyze.lastGenerationCanonicalCvProfile, undefined);
  assert.match(
    protectedAnalyze.lastGenerationMasterCvText ?? "",
    /Legado puro/,
  );
});

test("linhagem 5) flag desligada entre análise e geração — a fonte é a linhagem gravada, nunca a flag atual", async () => {
  const { protectedAnalyze, service, claimResult, finalJob } =
    await setupReadyCanonicalAdaptation("flag muda depois");
  const adaptation = await loadAdaptationForGeneration(
    claimResult.cvAdaptationId,
  );

  const previousFlag = process.env.CV_STRUCTURED_PROFILE_PIPELINE_ENABLED;
  process.env.CV_STRUCTURED_PROFILE_PIPELINE_ENABLED = "false";
  try {
    // biome-ignore lint/suspicious/noExplicitAny: acesso a método privado
    const output = await (service as any).ensureLegacyStructuredOutput(
      adaptation,
    );
    assert.ok(output);
    assert.equal(protectedAnalyze.generationCalls, 1);
    assert.equal(protectedAnalyze.lastGenerationMasterCvText, undefined);
    const structuredProfile =
      await database.cvStructuredProfile.findUniqueOrThrow({
        where: { id: finalJob.cvStructuredProfileId as string },
      });
    assert.deepEqual(
      protectedAnalyze.lastGenerationCanonicalCvProfile,
      structuredProfile.canonicalJson,
      "flag desligada DEPOIS da análise não pode fazer a geração reler texto — a decisão é pela linhagem gravada, não pela flag atual",
    );
  } finally {
    process.env.CV_STRUCTURED_PROFILE_PIPELINE_ENABLED = previousFlag;
  }
});

// ---------------------------------------------------------------------------
// Disparo imediato (correção de UX de 2026-09-08 — job persistido não pode
// depender só do cron de 15s pra começar). CvProcessingWorker#
// triggerProcessing(jobId) e CvAnalysisWorker#
// triggerProcessingForCvProcessingJob(cvProcessingJobId) fazem claim
// atômico POR ID — nunca um scan de lote — chamando exatamente o mesmo
// processJob()/processReadyJob() que o cron usa. As instâncias de worker
// deste arquivo NUNCA se inscrevem sozinhas no sinal (NODE_ENV=test, ver
// constructor de CvProcessingWorker/CvAnalysisWorker) — cada teste abaixo
// controla a inscrição explicitamente.
// ---------------------------------------------------------------------------

async function waitUntil(
  check: () => Promise<boolean>,
  timeoutMs = 5000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`waitUntil: condição não satisfeita em ${timeoutMs}ms`);
}

test("trigger 1) job começa imediatamente sem esperar o cron, e a latência persistido->processing fica próxima de zero", async () => {
  const user = await createUser();
  const storage = new FakeStorage();
  const cvWorker = buildProcessingWorker(
    async () => fakeCanonicalOutput("Trigger Imediato"),
    storage,
  );
  const entrypoint = new CvProcessingEntrypointService(
    database,
    jobService,
    storage,
  );

  let triggers = 0;
  const listener = (jobId: string) => {
    triggers += 1;
    cvWorker.triggerProcessing(jobId);
  };
  cvProcessingDispatchSignal.on(CV_PROCESSING_JOB_CREATED, listener);
  try {
    const requestStart = Date.now();
    const { job } = await entrypoint.enqueueFromUserText({
      userId: user.id,
      text: buildCvText("Trigger Imediato", "produto"),
      masterIntent: "NONE",
      submission: { origin: "PASTED_TEXT" },
    });
    const persistedAt = Date.now();

    assert.equal(triggers, 1, "enqueue deveria emitir exatamente um trigger");

    // Nunca chama processOneCvJob/processPendingBatch manualmente aqui — só
    // espera o trigger fire-and-forget terminar, provando que o
    // processamento já começou sem esperar os 15s do cron.
    await waitUntil(async () => {
      const row = await database.cvProcessingJob.findUniqueOrThrow({
        where: { id: job.id },
      });
      return row.status === "READY";
    });
    const readyAt = Date.now();

    const finalRow = await database.cvProcessingJob.findUniqueOrThrow({
      where: { id: job.id },
    });
    assert.ok(finalRow.claimedAt);
    const persistedToProcessingMs =
      finalRow.claimedAt!.getTime() - finalRow.createdAt.getTime();
    const processingToReadyMs =
      finalRow.finishedAt!.getTime() - finalRow.claimedAt!.getTime();

    // Medidas separadas, per requisito da auditoria — nunca perto dos 15000ms
    // do cron; a tolerância folgada evita flakiness de CI, o que importa é
    // "ordens de grandeza abaixo do tick", não um número exato de ms.
    assert.ok(
      persistedToProcessingMs < 2000,
      `persistido->processing levou ${persistedToProcessingMs}ms — deveria ser quase imediato via trigger, nunca perto dos 15000ms do cron`,
    );
    console.log(
      `[trigger 1] request->persistido=${persistedAt - requestStart}ms persistido->processing=${persistedToProcessingMs}ms processing->READY=${processingToReadyMs}ms total_percebido=${readyAt - requestStart}ms`,
    );
  } finally {
    cvProcessingDispatchSignal.off(CV_PROCESSING_JOB_CREATED, listener);
  }
});

test("trigger 2) resposta do enqueue não espera o processamento — emit é síncrono e barato, trigger roda depois", async () => {
  const user = await createUser();
  const storage = new FakeStorage();
  const SLOW_MS = 300;
  const cvWorker = buildProcessingWorker(async () => {
    await new Promise((resolve) => setTimeout(resolve, SLOW_MS));
    return fakeCanonicalOutput("Trigger Nao Bloqueia");
  }, storage);
  const entrypoint = new CvProcessingEntrypointService(
    database,
    jobService,
    storage,
  );

  const listener = (jobId: string) => cvWorker.triggerProcessing(jobId);
  cvProcessingDispatchSignal.on(CV_PROCESSING_JOB_CREATED, listener);
  try {
    const start = Date.now();
    const { job } = await entrypoint.enqueueFromUserText({
      userId: user.id,
      text: buildCvText("Trigger Nao Bloqueia", "engenharia"),
      masterIntent: "NONE",
      submission: { origin: "PASTED_TEXT" },
    });
    const enqueueMs = Date.now() - start;

    assert.ok(
      enqueueMs < SLOW_MS,
      `enqueueFromUserText levou ${enqueueMs}ms — não pode chegar perto dos ${SLOW_MS}ms da extração (trigger é fire-and-forget, nunca aguardado — resposta HTTP não espera IA)`,
    );

    const rowRightAfter = await database.cvProcessingJob.findUniqueOrThrow({
      where: { id: job.id },
    });
    assert.equal(
      rowRightAfter.status,
      "PENDING",
      "logo após o enqueue retornar, o job ainda não terminou de processar — prova que o trigger roda depois, não durante",
    );

    await waitUntil(async () => {
      const row = await database.cvProcessingJob.findUniqueOrThrow({
        where: { id: job.id },
      });
      return row.status === "READY";
    });
  } finally {
    cvProcessingDispatchSignal.off(CV_PROCESSING_JOB_CREATED, listener);
  }
});

test("trigger 3) processo morre entre commit e trigger — sem NENHUM listener, cron (processPendingBatch) ainda recupera", async () => {
  const user = await createUser();
  const storage = new FakeStorage();
  // Worker com jobService ESCOPADO (item 1 da correção pós-3ª-rodada):
  // findPending() só enxerga os IDs que este teste registrar — nenhuma
  // fixture de outra spec é lida, alterada ou processada, então não há
  // nada a restaurar nem risco de colidir com uma mudança concorrente
  // legítima de outro worker/spec.
  const { worker: cvWorker, scopedJobService } = buildScopedProcessingWorker(
    async () => fakeCanonicalOutput("Cron Recupera"),
    storage,
  );
  const entrypoint = new CvProcessingEntrypointService(
    database,
    jobService,
    storage,
  );

  // Nenhum listener inscrito — simula o trigger nunca tendo acontecido
  // (processo morreu entre o commit e o emit, ou o emit não teve ouvinte
  // por qualquer motivo). O job precisa continuar PENDING e claimable.
  const { job } = await entrypoint.enqueueFromUserText({
    userId: user.id,
    text: buildCvText("Cron Recupera", "vendas"),
    masterIntent: "NONE",
    submission: { origin: "PASTED_TEXT" },
  });
  scopedJobService.trackOwnJob(job.id);

  const rowBeforeCron = await database.cvProcessingJob.findUniqueOrThrow({
    where: { id: job.id },
  });
  assert.equal(rowBeforeCron.status, "PENDING");

  // Simula o tick do cron — exatamente o mesmo processPendingBatch que
  // @Cron(BASE_TICK_CRON) chamaria, só que enxergando apenas o job deste
  // teste.
  const processed = await cvWorker.processPendingBatch();
  assert.ok(processed >= 1);

  const rowAfterCron = await database.cvProcessingJob.findUniqueOrThrow({
    where: { id: job.id },
  });
  assert.equal(rowAfterCron.status, "READY");
});

test("trigger 4) erro no trigger mantém o job pending e recuperável pelo cron", async () => {
  const user = await createUser();
  const storage = new FakeStorage();
  const { worker: cvWorker, scopedJobService } = buildScopedProcessingWorker(
    async () => fakeCanonicalOutput("Trigger Falha Recupera"),
    storage,
  );
  const entrypoint = new CvProcessingEntrypointService(
    database,
    jobService,
    storage,
  );

  // Simula o trigger falhando por completo (ex.: erro inesperado antes
  // mesmo de conseguir chamar claimOne) — triggerProcessing() de produção
  // nunca deixa o erro escapar pro emissor (catch interno); aqui simulamos
  // o pior caso (exceção síncrona no próprio listener) pra provar que mesmo
  // assim nada corrompe o job nem marca failed indevidamente.
  const brokenWorker = {
    triggerProcessing: () => {
      throw new Error("falha simulada no trigger");
    },
  };
  const listener = (jobId: string) => {
    try {
      brokenWorker.triggerProcessing(jobId);
    } catch {
      // engolido de propósito — mesma garantia do catch interno real.
    }
  };
  cvProcessingDispatchSignal.on(CV_PROCESSING_JOB_CREATED, listener);
  let job: { id: string };
  try {
    ({ job } = await entrypoint.enqueueFromUserText({
      userId: user.id,
      text: buildCvText("Trigger Falha Recupera", "financas"),
      masterIntent: "NONE",
      submission: { origin: "PASTED_TEXT" },
    }));
  } finally {
    cvProcessingDispatchSignal.off(CV_PROCESSING_JOB_CREATED, listener);
  }
  scopedJobService.trackOwnJob(job.id);

  const rowAfterFailedTrigger =
    await database.cvProcessingJob.findUniqueOrThrow({
      where: { id: job.id },
    });
  assert.equal(
    rowAfterFailedTrigger.status,
    "PENDING",
    "trigger falho não pode deixar o job em nenhum estado além de pending/claimable — nunca marca failed só por não ter rodado",
  );

  // Cron real recupera normalmente — jobService escopado só enxerga este job.
  await cvWorker.processPendingBatch();
  const rowAfterCron = await database.cvProcessingJob.findUniqueOrThrow({
    where: { id: job.id },
  });
  assert.equal(rowAfterCron.status, "READY");
});

test("trigger 5) trigger e cron concorrentes processam o job exatamente uma vez", async () => {
  const user = await createUser();
  const storage = new FakeStorage();
  let extractCalls = 0;
  const { worker: cvWorker, scopedJobService } = buildScopedProcessingWorker(async () => {
    extractCalls += 1;
    // Segura um pouco pra garantir sobreposição real entre trigger e cron.
    await new Promise((resolve) => setTimeout(resolve, 50));
    return fakeCanonicalOutput("Trigger e Cron Concorrentes");
  }, storage);
  const entrypoint = new CvProcessingEntrypointService(
    database,
    jobService,
    storage,
  );

  const listener = (jobId: string) => cvWorker.triggerProcessing(jobId);
  cvProcessingDispatchSignal.on(CV_PROCESSING_JOB_CREATED, listener);
  try {
    const { job } = await entrypoint.enqueueFromUserText({
      userId: user.id,
      text: buildCvText("Trigger e Cron Concorrentes", "dados"),
      masterIntent: "NONE",
      submission: { origin: "PASTED_TEXT" },
    });
    scopedJobService.trackOwnJob(job.id);

    // "Cron" concorrente disparado logo em seguida, sobrepondo o trigger
    // que o listener acima já iniciou — a claim atômica (UPDATE ... WHERE
    // status='pending') garante que só um dos dois processa de fato.
    // jobService escopado: nenhuma fixture alheia é lida/tocada.
    await cvWorker.processPendingBatch();

    await waitUntil(async () => {
      const row = await database.cvProcessingJob.findUniqueOrThrow({
        where: { id: job.id },
      });
      return row.status === "READY";
    });

    assert.equal(
      extractCalls,
      1,
      "trigger e cron concorrentes nunca podem rodar a extração duas vezes pro mesmo job",
    );
  } finally {
    cvProcessingDispatchSignal.off(CV_PROCESSING_JOB_CREATED, listener);
  }
});

// Item 1 da correção pós-3ª-rodada: duas "suítes" simuladas (cada uma com
// seu próprio worker escopado e seu próprio job PENDING), executando de
// fato simultaneamente (Promise.all — sem await sequencial entre elas),
// provam que uma nunca lê, altera ou processa o job da outra. Repetido em
// ordem invertida (item 5) e com uma falha injetada no meio de uma delas
// (item 3) pra provar que nada fica em estado alterado quando isso
// acontece.
async function runIsolatedSuite(input: {
  suiteName: string;
  extractMarker: string;
  injectFailureAfterQuarantineCheck?: boolean;
}): Promise<{ jobId: string; otherSuiteJobIds: string[] }> {
  const user = await createUser();
  const storage = new FakeStorage();
  const { worker, scopedJobService } = buildScopedProcessingWorker(
    async () => fakeCanonicalOutput(input.extractMarker),
    storage,
  );
  const entrypoint = new CvProcessingEntrypointService(
    database,
    jobService,
    storage,
  );

  const { job } = await entrypoint.enqueueFromUserText({
    userId: user.id,
    text: buildCvText(input.extractMarker, input.suiteName),
    masterIntent: "NONE",
    submission: { origin: "PASTED_TEXT" },
  });
  scopedJobService.trackOwnJob(job.id);

  if (input.injectFailureAfterQuarantineCheck) {
    throw new Error(`falha intencional na suíte ${input.suiteName}`);
  }

  // processPendingBatch() usa o MESMO lock global que o cron real (só uma
  // instância processa por vez, por design — evita trabalho duplicado).
  // Sob concorrência de verdade (duas suítes chamando ao mesmo tempo via
  // Promise.all), perder a corrida do lock é esperado e correto — o
  // scan simplesmente não roda desta vez, sem erro, sem tocar em nada
  // (nunca mexe no job alheio, só devolve 0). Repete até o PRÓPRIO job
  // ficar READY, exatamente como o cron real tentaria de novo no próximo
  // tick de 15s.
  await waitUntil(async () => {
    await worker.processPendingBatch();
    const row = await database.cvProcessingJob.findUniqueOrThrow({
      where: { id: job.id },
    });
    return row.status === "READY";
  });
  return { jobId: job.id, otherSuiteJobIds: [] };
}

test("ISOLAMENTO 1: duas suítes com jobs PENDING distintos executando SIMULTANEAMENTE — nenhuma lê, altera ou processa o job da outra", async () => {
  const [resultA, resultB] = await Promise.all([
    runIsolatedSuite({ suiteName: "suite-A", extractMarker: "Isolamento A" }),
    runIsolatedSuite({ suiteName: "suite-B", extractMarker: "Isolamento B" }),
  ]);

  const rowA = await database.cvProcessingJob.findUniqueOrThrow({ where: { id: resultA.jobId } });
  const rowB = await database.cvProcessingJob.findUniqueOrThrow({ where: { id: resultB.jobId } });
  assert.equal(rowA.status, "READY", "suíte A precisa ter processado o PRÓPRIO job");
  assert.equal(rowB.status, "READY", "suíte B precisa ter processado o PRÓPRIO job");
  assert.equal(rowA.attempts, 1, "suíte A não pode ter sido reprocessada pela suíte B (attempts=1)");
  assert.equal(rowB.attempts, 1, "suíte B não pode ter sido reprocessada pela suíte A (attempts=1)");

  const structuredProfileA = await database.cvStructuredProfile.findUniqueOrThrow({
    where: { id: rowA.cvStructuredProfileId as string },
  });
  const structuredProfileB = await database.cvStructuredProfile.findUniqueOrThrow({
    where: { id: rowB.cvStructuredProfileId as string },
  });
  assert.equal(
    (structuredProfileA.canonicalJson as { fullName: string }).fullName,
    "Isolamento A",
    "o conteúdo extraído do job A precisa ser o do extrator de A, nunca contaminado pelo de B",
  );
  assert.equal(
    (structuredProfileB.canonicalJson as { fullName: string }).fullName,
    "Isolamento B",
  );
});

test("ISOLAMENTO 2: ordem invertida (suíte B antes de A) produz o mesmo resultado", async () => {
  const resultB = await runIsolatedSuite({ suiteName: "suite-B-invertida", extractMarker: "Isolamento B invertida" });
  const resultA = await runIsolatedSuite({ suiteName: "suite-A-invertida", extractMarker: "Isolamento A invertida" });

  const rowA = await database.cvProcessingJob.findUniqueOrThrow({ where: { id: resultA.jobId } });
  const rowB = await database.cvProcessingJob.findUniqueOrThrow({ where: { id: resultB.jobId } });
  assert.equal(rowA.status, "READY");
  assert.equal(rowB.status, "READY");
  assert.equal(rowA.attempts, 1);
  assert.equal(rowB.attempts, 1);
});

test("ISOLAMENTO 3: falha no meio de uma suíte não deixa o job da OUTRA suíte em estado alterado", async () => {
  const okResult = await runIsolatedSuite({
    suiteName: "suite-ok",
    extractMarker: "Isolamento OK antes da falha",
  });
  const rowBefore = await database.cvProcessingJob.findUniqueOrThrow({
    where: { id: okResult.jobId },
  });
  assert.equal(rowBefore.status, "READY");

  await assert.rejects(() =>
    runIsolatedSuite({
      suiteName: "suite-falha",
      extractMarker: "Isolamento suite que falha",
      injectFailureAfterQuarantineCheck: true,
    }),
  );

  // O job da suíte que já tinha terminado com sucesso precisa continuar
  // exatamente como estava — a suíte escopada da OUTRA nem sequer sabia
  // que ele existia, então uma falha ali não pode alcançá-lo.
  const rowAfter = await database.cvProcessingJob.findUniqueOrThrow({
    where: { id: okResult.jobId },
  });
  assert.equal(rowAfter.status, "READY");
  assert.equal(rowAfter.attempts, rowBefore.attempts);
});

test("trigger 6) dois triggers simultâneos pro MESMO job processam exatamente uma vez", async () => {
  const user = await createUser();
  const storage = new FakeStorage();
  let extractCalls = 0;
  const cvWorker = buildProcessingWorker(async () => {
    extractCalls += 1;
    await new Promise((resolve) => setTimeout(resolve, 50));
    return fakeCanonicalOutput("Dois Triggers Simultaneos");
  }, storage);
  const entrypoint = new CvProcessingEntrypointService(
    database,
    jobService,
    storage,
  );

  // Sem inscrever no sinal — dispara os dois triggers manualmente pro
  // MESMO jobId, deliberadamente sobrepostos (Promise.all), simulando dois
  // gatilhos concorrentes reais (ex.: dois requests que resolveram o mesmo
  // job por dedup de conteúdo).
  const { job } = await entrypoint.enqueueFromUserText({
    userId: user.id,
    text: buildCvText("Dois Triggers Simultaneos", "operacoes"),
    masterIntent: "NONE",
    submission: { origin: "PASTED_TEXT" },
  });

  // triggerProcessing é void/fire-and-forget — as duas chamadas disparam
  // sincronamente, uma logo após a outra, garantindo sobreposição real das
  // duas tentativas de claimOne; a espera do resultado é por polling do
  // estado final (não há Promise pra aguardar diretamente).
  cvWorker.triggerProcessing(job.id);
  cvWorker.triggerProcessing(job.id);

  await waitUntil(async () => {
    const row = await database.cvProcessingJob.findUniqueOrThrow({
      where: { id: job.id },
    });
    return row.status === "READY";
  });

  assert.equal(
    extractCalls,
    1,
    "dois triggers simultâneos pro mesmo jobId nunca podem rodar a extração duas vezes",
  );
});

test("trigger 7) request falha antes do commit — nenhum processamento começa, nenhum job/trigger é criado", async () => {
  const user = await createUser();
  class ThrowingStorage extends FakeStorage {
    async putObject(): Promise<string> {
      throw new Error("storage indisponível (simulado) — falha antes do commit");
    }
  }
  const storage = new ThrowingStorage();
  let extractCalls = 0;
  const cvWorker = buildProcessingWorker(async () => {
    extractCalls += 1;
    return fakeCanonicalOutput("Nunca Deveria Rodar");
  }, storage);
  const entrypoint = new CvProcessingEntrypointService(
    database,
    jobService,
    storage,
  );

  let triggers = 0;
  const listener = () => {
    triggers += 1;
  };
  cvProcessingDispatchSignal.on(CV_PROCESSING_JOB_CREATED, listener);
  try {
    await assert.rejects(() =>
      entrypoint.enqueueFromUserText({
        userId: user.id,
        text: buildCvText("Nunca Deveria Rodar", "juridico"),
        masterIntent: "NONE",
        submission: { origin: "PASTED_TEXT" },
      }),
    );

    assert.equal(
      triggers,
      0,
      "enqueue que falha antes do commit (storage indisponível) nunca pode emitir o sinal de trigger",
    );

    const jobsForUser = await database.cvProcessingJob.count({
      where: { cvSource: { ownerType: "USER", userId: user.id } },
    });
    assert.equal(
      jobsForUser,
      0,
      "nenhum CvProcessingJob deveria existir — o commit nunca aconteceu",
    );
    assert.equal(
      extractCalls,
      0,
      "nenhuma chamada de IA pode acontecer quando o request falha antes de persistir o job",
    );
  } finally {
    cvProcessingDispatchSignal.off(CV_PROCESSING_JOB_CREATED, listener);
  }
});

test("trigger 8) retry via trigger não duplica extração", async () => {
  const user = await createUser();
  const storage = new FakeStorage();
  let extractCalls = 0;
  let failFirstAttempt = true;
  const cvWorker = buildProcessingWorker(async () => {
    extractCalls += 1;
    if (failFirstAttempt) {
      failFirstAttempt = false;
      throw new Error("falha simulada na 1a tentativa");
    }
    return fakeCanonicalOutput("Retry Via Trigger");
  }, storage);
  const entrypoint = new CvProcessingEntrypointService(
    database,
    jobService,
    storage,
  );

  const { job } = await entrypoint.enqueueFromUserText({
    userId: user.id,
    text: buildCvText("Retry Via Trigger", "atendimento"),
    masterIntent: "NONE",
    submission: { origin: "PASTED_TEXT" },
  });

  // 1a tentativa via trigger — falha, job volta pra PENDING (attempts < MAX).
  await new Promise<void>((resolve) => {
    cvWorker.triggerProcessing(job.id);
    setTimeout(resolve, 300);
  });
  const afterFirst = await database.cvProcessingJob.findUniqueOrThrow({
    where: { id: job.id },
  });
  assert.equal(afterFirst.status, "PENDING");
  assert.equal(extractCalls, 1);

  // 2a tentativa via trigger (retry) — sucede, sem duplicar a extração da
  // tentativa anterior (que já contou 1).
  await new Promise<void>((resolve) => {
    cvWorker.triggerProcessing(job.id);
    setTimeout(resolve, 300);
  });
  const afterSecond = await database.cvProcessingJob.findUniqueOrThrow({
    where: { id: job.id },
  });
  assert.equal(afterSecond.status, "READY");
  assert.equal(
    extractCalls,
    2,
    "retry deveria chamar extração de novo (1a falhou), mas nunca mais que isso — nenhuma duplicação por trigger repetido",
  );
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
// Fase 3C, Tarefa 3 (docs/specs/2026-09-04-cv-canonical-profile-pipeline-plan.md
// v3) — bug #2 do piloto Fase 3B: promoção explícita via análise
// (saveAsMaster: true) atualizava CvMasterDesignation corretamente, mas
// nunca criava/reusava um Resume real para representar o novo Master —
// job.resumeId nascia null, então CvMasterPromotionService#syncResumeIsMaster
// nunca disparava, e o Resume.isMaster do upload anterior nunca era
// demovido. Corrigido em CvAdaptationService#ensureResumeForMasterPromotion
// (chamado sempre que masterIntent !== NONE) + CvProcessingWorker
// (syncResumeIsMaster: !!job.resumeId, já existente da Fase 3 pré-rollout).
// Este teste prova, com Postgres real, que ao final: exatamente um
// Resume.isMaster=true, ele é o novo (não o antigo), e
// CvMasterDesignation.resumeId aponta pra ele — nunca diverge.
// ---------------------------------------------------------------------------
test("Fase 3C) saveAsMaster=true via análise demove o Resume.isMaster antigo e liga o novo (bug #2 do piloto 3B corrigido)", async () => {
  const user = await createUser();
  const storage = new FakeStorage();
  const cvWorker = buildProcessingWorker(
    async () => fakeCanonicalOutput("Master Original 3C"),
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

  // 1) Primeiro Master, via texto colado — nasce sem Resume prévio, o
  // pipeline cria um via ensureResumeForMasterPromotion.
  const setup = await service.startAuthenticatedAnalysisJob(user.id, {
    jobDescriptionText: JOB_DESCRIPTION,
    masterCvText: buildCvText("Master Original 3C", "engenharia"),
  });
  const setupJob = await database.analysisJob.findUniqueOrThrow({
    where: { id: setup.jobId },
  });
  await processOneCvJob(cvWorker, setupJob.cvProcessingJobId as string);

  const designationAfterFirst =
    await prisma.cvMasterDesignation.findFirstOrThrow({
      where: { userId: user.id, supersededAt: null },
    });
  assert.ok(
    designationAfterFirst.resumeId,
    "primeira promoção via análise precisa gravar resumeId",
  );
  const firstMasterResumeId = designationAfterFirst.resumeId!;
  const firstMasterResume = await prisma.resume.findUniqueOrThrow({
    where: { id: firstMasterResumeId },
  });
  assert.equal(firstMasterResume.isMaster, true);

  // 2) Promoção explícita via análise (saveAsMaster: true), CV diferente,
  // sem masterResumeId — reproduz exatamente o bug #2 do piloto 3B.
  const explicitWorker = buildProcessingWorker(
    async () => fakeCanonicalOutput("Master Substituto 3C"),
    storage,
  );
  const explicit = await service.startAuthenticatedAnalysisJob(user.id, {
    jobDescriptionText: JOB_DESCRIPTION,
    masterCvText: buildCvText("Master Substituto 3C", "dados"),
    saveAsMaster: true,
  });
  const explicitJobRow = await database.analysisJob.findUniqueOrThrow({
    where: { id: explicit.jobId },
  });
  const explicitCvJob = await database.cvProcessingJob.findUniqueOrThrow({
    where: { id: explicitJobRow.cvProcessingJobId as string },
  });
  assert.equal(explicitCvJob.masterIntent, "PROMOTE_EXPLICIT");
  assert.ok(
    explicitCvJob.resumeId,
    "CvProcessingJob desta promoção precisa carregar resumeId (correção do bug #2)",
  );
  assert.notEqual(explicitCvJob.resumeId, firstMasterResumeId);

  await processOneCvJob(explicitWorker, explicitCvJob.id);

  // --- Invariante formal (schema.prisma#CvMasterDesignation): exatamente
  // um Resume.isMaster=true, e é o mesmo da designação ativa.
  const activeDesignation = await prisma.cvMasterDesignation.findFirstOrThrow({
    where: { userId: user.id, supersededAt: null },
  });
  assert.equal(activeDesignation.resumeId, explicitCvJob.resumeId);

  const oldResumeAfter = await prisma.resume.findUniqueOrThrow({
    where: { id: firstMasterResumeId },
  });
  assert.equal(
    oldResumeAfter.isMaster,
    false,
    "bug #2: o Resume do Master anterior precisa ser demovido",
  );

  const newMasterResume = await prisma.resume.findUniqueOrThrow({
    where: { id: activeDesignation.resumeId! },
  });
  assert.equal(newMasterResume.isMaster, true);

  const isMasterCount = await prisma.resume.count({
    where: { userId: user.id, isMaster: true },
  });
  assert.equal(
    isMasterCount,
    1,
    "no máximo um Resume.isMaster=true por usuário, mesmo após promoção via análise",
  );

  // --- Reproduz literalmente as duas queries de investigação do índice
  // parcial exigidas pela Tarefa 3, confirmando 0 divergência ao final.
  const divergent = await prisma.$queryRaw<
    Array<{ userId: string; count: bigint }>
  >`
    SELECT "userId", count(*) as count FROM "Resume" WHERE "isMaster" = true GROUP BY "userId" HAVING count(*) > 1
  `;
  assert.equal(divergent.length, 0);
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

  // Fase 3C item 5 — a defesa estrutural nova (migration 20260905160000_
  // cv_master_designation_integrity_defense) exige resumeId em toda
  // designação ativa de USER; todo chamador de produção real (
  // CvAdaptationService, ResumesService, ClaimSourceGrantService) já
  // garante isso desde a Fase 3C. Este teste chama o entrypoint
  // diretamente (nível mais baixo que CvAdaptationService), então precisa
  // fornecer o Resume real, igual a um chamador de produção faria.
  const resumeA = await prisma.resume.create({
    data: {
      userId: user.id,
      title: "Candidato A",
      isMaster: false,
      rawText: buildCvText("Candidato A", "engenharia"),
    },
  });
  const resumeB = await prisma.resume.create({
    data: {
      userId: user.id,
      title: "Candidato B",
      isMaster: false,
      rawText: buildCvText("Candidato B", "design"),
    },
  });

  const enqueuedA = await entrypointA.enqueueFromUserText({
    userId: user.id,
    text: buildCvText("Candidato A", "engenharia"),
    masterIntent: "PROMOTE_IF_FIRST",
    submission: { origin: "PASTED_TEXT" },
    resumeId: resumeA.id,
  });
  const enqueuedB = await entrypointB.enqueueFromUserText({
    userId: user.id,
    text: buildCvText("Candidato B", "design"),
    masterIntent: "PROMOTE_IF_FIRST",
    submission: { origin: "PASTED_TEXT" },
    resumeId: resumeB.id,
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

// ===========================================================================
// Fase 2C.1 — inputMode "profile" desviado pro pipeline canônico (fecha a
// lacuna deixada pela 2C). Casos obrigatórios do relatório da 2C.1.
// ===========================================================================

test("2C.1-1) inputMode profile reusa Master novo (CvStructuredProfile READY) sem nova extração", async () => {
  const user = await createUser();
  const storage = new FakeStorage();
  let extractCalls = 0;
  const cvWorker = buildProcessingWorker(async () => {
    extractCalls += 1;
    return fakeCanonicalOutput("Perfil Novo");
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

  const setup = await service.startAuthenticatedAnalysisJob(user.id, {
    jobDescriptionText: JOB_DESCRIPTION,
    masterCvText: buildCvText("Perfil Novo", "produto"),
  });
  const setupJob = await database.analysisJob.findUniqueOrThrow({
    where: { id: setup.jobId },
  });
  await processOneCvJob(cvWorker, setupJob.cvProcessingJobId as string);
  assert.equal(extractCalls, 1);

  const profileAnalysis = await service.startAuthenticatedAnalysisJob(user.id, {
    jobDescriptionText: JOB_DESCRIPTION,
    inputMode: "profile",
  });
  const profileJobRow = await database.analysisJob.findUniqueOrThrow({
    where: { id: profileAnalysis.jobId },
  });
  // Mesmo CvProcessingJob READY reaproveitado — nenhum novo criado.
  assert.equal(profileJobRow.cvProcessingJobId, setupJob.cvProcessingJobId);
  assert.equal(extractCalls, 1);

  const analysisWorker = buildAnalysisWorker(service);
  const finalRow = await processOneAnalysisJob(
    analysisWorker,
    profileAnalysis.jobId,
  );
  assert.equal(finalRow.status, "succeeded");
  assert.ok(finalRow.cvStructuredProfileId);
  const structuredProfile =
    await database.cvStructuredProfile.findUniqueOrThrow({
      where: { id: finalRow.cvStructuredProfileId as string },
    });
  assert.equal(structuredProfile.status, "READY");
});

test("2C.1-2) inputMode profile com Master novo ainda PROCESSING — análise fica pendente, dependente do mesmo job, sem duplicar", async () => {
  const user = await createUser();
  const storage = new FakeStorage();
  const text = buildCvText("Ainda Processando", "operacoes");
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

  // Simula resumes.service.ts#create com a flag ligada: Resume.isMaster já
  // true, CvProcessingJob enfileirado (PROMOTE_IF_FIRST), mas nenhum worker
  // rodou ainda — nenhuma CvMasterDesignation existe.
  const resume = await prisma.resume.create({
    data: {
      userId: user.id,
      title: "Master em voo",
      isMaster: true,
      rawText: text,
    },
  });
  const enqueued = await entrypoint.enqueueFromUserText({
    userId: user.id,
    text,
    masterIntent: "PROMOTE_IF_FIRST",
    submission: { origin: "PASTED_TEXT" },
  });
  assert.equal(enqueued.job.status, "PENDING");

  const active = await masterPromotion.getActiveDesignation({
    ownerType: "USER",
    userId: user.id,
  });
  assert.equal(active, null);

  const profileAnalysis = await service.startAuthenticatedAnalysisJob(user.id, {
    jobDescriptionText: JOB_DESCRIPTION,
    inputMode: "profile",
  });
  const profileJobRow = await database.analysisJob.findUniqueOrThrow({
    where: { id: profileAnalysis.jobId },
  });
  // Dependente do MESMO CvProcessingJob em voo — nenhum novo criado (dedup
  // por cvSourceId em CvProcessingJobService#enqueue).
  assert.equal(profileJobRow.cvProcessingJobId, enqueued.job.id);
  assert.equal(profileJobRow.status, "pending");

  const pendingJobsForSource = await database.cvProcessingJob.count({
    where: { cvSourceId: enqueued.job.cvSourceId },
  });
  assert.equal(pendingJobsForSource, 1);
  assert.ok(resume.id); // referenciado só pra documentar o cenário
});

test("2C.1-3) Master legado com MasterCvCanonicalExtraction succeeded — materializa sem nova chamada de IA", async () => {
  const user = await createUser();
  const storage = new FakeStorage();
  let extractCalls = 0;
  const cvWorker = buildProcessingWorker(async () => {
    extractCalls += 1;
    return fakeCanonicalOutput("NUNCA deveria ser chamado");
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

  const text = buildCvText("Master Legado Extraido", "financeiro");
  const resume = await prisma.resume.create({
    data: {
      userId: user.id,
      title: "Master legado",
      isMaster: true,
      rawText: text,
    },
  });
  const inputHash = createHash("sha256").update(text).digest("hex");
  await prisma.masterCvCanonicalExtraction.create({
    data: {
      userId: user.id,
      resumeId: resume.id,
      inputHash,
      status: "succeeded",
      canonicalJson: fakeCanonicalOutput("Master Legado Extraido")
        .canonicalProfile as never,
      coverageJson: fakeCanonicalOutput("Master Legado Extraido")
        .extractionCoverage as never,
      confidenceJson: {} as never,
      evidenceJson: {} as never,
      finishedAt: new Date(),
    },
  });

  const profileAnalysis = await service.startAuthenticatedAnalysisJob(user.id, {
    jobDescriptionText: JOB_DESCRIPTION,
    inputMode: "profile",
  });
  const profileJobRow = await database.analysisJob.findUniqueOrThrow({
    where: { id: profileAnalysis.jobId },
  });
  assert.ok(profileJobRow.cvProcessingJobId);
  const cvProcessingJob = await database.cvProcessingJob.findUniqueOrThrow({
    where: { id: profileJobRow.cvProcessingJobId as string },
  });
  assert.equal(cvProcessingJob.status, "PENDING"); // ainda não processado

  await processOneCvJob(cvWorker, cvProcessingJob.id);
  assert.equal(extractCalls, 0); // reusou a extração legada, sem IA

  const finalCvJob = await database.cvProcessingJob.findUniqueOrThrow({
    where: { id: cvProcessingJob.id },
  });
  assert.equal(finalCvJob.status, "READY");
  assert.ok(finalCvJob.masterDesignationId); // promoveu a Master formal

  const structuredProfile =
    await database.cvStructuredProfile.findUniqueOrThrow({
      where: { id: finalCvJob.cvStructuredProfileId as string },
    });
  assert.equal(structuredProfile.status, "READY");
  assert.deepEqual(
    (structuredProfile.canonicalJson as { fullName?: string })?.fullName,
    "Master Legado Extraido",
  );

  const analysisWorker = buildAnalysisWorker(service);
  const finalAnalysis = await processOneAnalysisJob(
    analysisWorker,
    profileAnalysis.jobId,
  );
  assert.equal(finalAnalysis.status, "succeeded");
  assert.equal(finalAnalysis.cvStructuredProfileId, structuredProfile.id);
});

test("2C.1-4) Master legado só com Resume.rawText (sem nenhuma extração) — cria CvProcessingJob real, com IA no worker", async () => {
  const user = await createUser();
  const storage = new FakeStorage();
  let extractCalls = 0;
  const cvWorker = buildProcessingWorker(async () => {
    extractCalls += 1;
    return fakeCanonicalOutput("Master Legado Sem Extracao");
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

  const text = buildCvText("Master Legado Sem Extracao", "vendas");
  await prisma.resume.create({
    data: {
      userId: user.id,
      title: "Master legado sem extração",
      isMaster: true,
      rawText: text,
    },
  });

  const profileAnalysis = await service.startAuthenticatedAnalysisJob(user.id, {
    jobDescriptionText: JOB_DESCRIPTION,
    inputMode: "profile",
  });
  const profileJobRow = await database.analysisJob.findUniqueOrThrow({
    where: { id: profileAnalysis.jobId },
  });
  const cvProcessingJob = await database.cvProcessingJob.findUniqueOrThrow({
    where: { id: profileJobRow.cvProcessingJobId as string },
  });
  assert.equal(cvProcessingJob.status, "PENDING");

  await processOneCvJob(cvWorker, cvProcessingJob.id);
  assert.equal(extractCalls, 1); // nenhuma extração legada pra reusar — IA real

  const finalCvJob = await database.cvProcessingJob.findUniqueOrThrow({
    where: { id: cvProcessingJob.id },
  });
  assert.equal(finalCvJob.status, "READY");
  assert.ok(finalCvJob.masterDesignationId);
});

test("2C.1-5) UserProfile com dados, mas nenhum Master válido — erro de domínio explícito, nunca reconstrução ad hoc", async () => {
  const user = await createUser();
  await prisma.userProfile.update({
    where: { userId: user.id },
    data: {
      fullName: "Alguém Com Perfil Preenchido",
      headline: "Cargo qualquer",
      professionalSummary: "Resumo qualquer preenchido diretamente no perfil.",
    },
  });

  const protectedAnalyze = new FakeProtectedAnalyzeService();
  const entrypoint: Pick<CvProcessingEntrypointService, "enqueueFromUserText"> =
    {
      enqueueFromUserText: async () => {
        throw new Error("não deveria materializar nada sem Master válido");
      },
    };
  const service = buildCvAdaptationService(
    protectedAnalyze,
    entrypoint,
    masterPromotion,
  );

  await assert.rejects(
    () =>
      service.startAuthenticatedAnalysisJob(user.id, {
        jobDescriptionText: JOB_DESCRIPTION,
        inputMode: "profile",
      }),
    (error: unknown) => {
      assert.ok(error instanceof BadRequestException);
      assert.match(
        (error as Error).message,
        /Nenhum CV Master válido encontrado/,
      );
      return true;
    },
  );

  const analysisJobsForUser = await database.analysisJob.count({
    where: { userId: user.id },
  });
  assert.equal(analysisJobsForUser, 0); // nunca cria job nenhum sobre dado inválido
});

test("2C.1-6) Master apagado depois de já ter sido usado — UserProfile fica com dado antigo, mas não é tratado como válido", async () => {
  const user = await createUser();
  const text = buildCvText("Master Que Sera Apagado", "logistica");
  const resume = await prisma.resume.create({
    data: {
      userId: user.id,
      title: "Master que será apagado",
      isMaster: true,
      rawText: text,
    },
  });

  // Simula "já foi usado": UserProfile projetado a partir dele em algum
  // momento (fluxo legado de sync), sem nenhuma CvMasterDesignation formal
  // (este Resume nunca passou pelo pipeline novo).
  await prisma.userProfile.update({
    where: { userId: user.id },
    data: {
      fullName: "Master Que Sera Apagado",
      headline: "Analista de Logística",
      professionalSummary: "Projeção antiga do Master, agora removido.",
    },
  });

  await prisma.resume.delete({ where: { id: resume.id } });

  const activeAfterDelete = await masterPromotion.getActiveDesignation({
    ownerType: "USER",
    userId: user.id,
  });
  assert.equal(activeAfterDelete, null); // nunca existiu designação formal

  const protectedAnalyze = new FakeProtectedAnalyzeService();
  const entrypoint: Pick<CvProcessingEntrypointService, "enqueueFromUserText"> =
    {
      enqueueFromUserText: async () => {
        throw new Error("não deveria materializar nada — Master foi apagado");
      },
    };
  const service = buildCvAdaptationService(
    protectedAnalyze,
    entrypoint,
    masterPromotion,
  );

  await assert.rejects(
    () =>
      service.startAuthenticatedAnalysisJob(user.id, {
        jobDescriptionText: JOB_DESCRIPTION,
        inputMode: "profile",
      }),
    (error: unknown) => {
      assert.ok(error instanceof BadRequestException);
      assert.match(
        (error as Error).message,
        /Nenhum CV Master válido encontrado/,
      );
      return true;
    },
  );
});

test("2C.1-7) duas análises inputMode profile concorrentes sobre o mesmo Master legado — materializa/extrai só uma vez", async () => {
  const user = await createUser();
  const storage = new FakeStorage();
  let extractCalls = 0;
  const cvWorker = buildProcessingWorker(async () => {
    extractCalls += 1;
    return fakeCanonicalOutput("Concorrente Legado");
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

  const text = buildCvText("Concorrente Legado", "atendimento");
  await prisma.resume.create({
    data: {
      userId: user.id,
      title: "Master legado concorrente",
      isMaster: true,
      rawText: text,
    },
  });

  const [first, second] = await Promise.all([
    service.startAuthenticatedAnalysisJob(user.id, {
      jobDescriptionText: JOB_DESCRIPTION,
      inputMode: "profile",
    }),
    service.startAuthenticatedAnalysisJob(user.id, {
      jobDescriptionText: JOB_DESCRIPTION,
      inputMode: "profile",
    }),
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
  assert.equal(firstCvJob.cvSourceId, secondCvJob.cvSourceId);

  const pendingForSource = await database.cvProcessingJob.findMany({
    where: { cvSourceId: firstCvJob.cvSourceId, status: "PENDING" },
  });
  for (const job of pendingForSource) {
    await processOneCvJob(cvWorker, job.id);
  }

  assert.equal(extractCalls, 1); // nenhuma extração duplicada
  const designations = await prisma.cvMasterDesignation.findMany({
    where: { userId: user.id, supersededAt: null },
  });
  assert.equal(designations.length, 1);
});

test("2C.1-8) retry de AnalysisJob (inputMode profile) não reprocessa CvProcessingJob nem repete extração", async () => {
  const user = await createUser();
  const storage = new FakeStorage();
  let extractCalls = 0;
  const cvWorker = buildProcessingWorker(async () => {
    extractCalls += 1;
    return fakeCanonicalOutput("Retry Profile");
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

  const text = buildCvText("Retry Profile", "engenharia");
  await prisma.resume.create({
    data: {
      userId: user.id,
      title: "Master retry",
      isMaster: true,
      rawText: text,
    },
  });

  const first = await service.startAuthenticatedAnalysisJob(user.id, {
    jobDescriptionText: JOB_DESCRIPTION,
    inputMode: "profile",
  });
  const firstRow = await database.analysisJob.findUniqueOrThrow({
    where: { id: first.jobId },
  });
  await processOneCvJob(cvWorker, firstRow.cvProcessingJobId as string);
  assert.equal(extractCalls, 1);

  // Falha simulada na análise em si (extração/Master já READY) — mesmo
  // padrão do teste 12 genérico, reaplicado aqui pro caminho profile.
  protectedAnalyze.setFailNextCompute(true);
  const failed = await processOneAnalysisJob(analysisWorker, first.jobId);
  assert.equal(failed.status, "failed");

  // Retry: reseta só o AnalysisJob, nunca cria outro CvProcessingJob nem
  // chama a extração de novo.
  await database.analysisJob.update({
    where: { id: first.jobId },
    data: {
      status: "pending",
      startedAt: null,
      finishedAt: null,
      lastError: null,
    },
  });
  const retried = await processOneAnalysisJob(analysisWorker, first.jobId);
  assert.equal(retried.status, "succeeded");
  assert.equal(extractCalls, 1); // nenhuma nova extração no retry

  const cvJobsForUser = await database.cvProcessingJob.count({
    where: {
      cvSource: { userId: user.id },
    },
  });
  assert.equal(cvJobsForUser, 1); // nenhum CvProcessingJob duplicado pelo retry
});

test("2C.1-9) AnalysisJob (inputMode profile) succeeded sempre referencia um CvStructuredProfile READY", async () => {
  const user = await createUser();
  const storage = new FakeStorage();
  const cvWorker = buildProcessingWorker(
    async () => fakeCanonicalOutput("Invariante Profile"),
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

  const text = buildCvText("Invariante Profile", "dados");
  await prisma.resume.create({
    data: {
      userId: user.id,
      title: "Master invariante",
      isMaster: true,
      rawText: text,
    },
  });

  const started = await service.startAuthenticatedAnalysisJob(user.id, {
    jobDescriptionText: JOB_DESCRIPTION,
    inputMode: "profile",
  });
  const row = await database.analysisJob.findUniqueOrThrow({
    where: { id: started.jobId },
  });
  await processOneCvJob(cvWorker, row.cvProcessingJobId as string);

  const finalRow = await processOneAnalysisJob(analysisWorker, started.jobId);
  assert.equal(finalRow.status, "succeeded");
  assert.ok(finalRow.cvStructuredProfileId);
  const structuredProfile =
    await database.cvStructuredProfile.findUniqueOrThrow({
      where: { id: finalRow.cvStructuredProfileId as string },
    });
  assert.equal(structuredProfile.status, "READY");
});
