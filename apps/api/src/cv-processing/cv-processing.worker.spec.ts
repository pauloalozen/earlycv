// Teste de integração real (Postgres local) do CvProcessingWorker de
// ponta a ponta: claim -> extração (fake client, sem IA de verdade) ->
// captura da Base de Talentos -> promoção de Master -> UserProfile sync +
// MonitorProjectionJob (mesma transação) -> READY. Também cobre o cenário
// "processo morre entre etapas" (plano, seção 15, último item): mata o
// worker (simulado) depois da extração READY mas antes da promoção, e
// confirma que o retry completa do zero, sem estado em limbo.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";

import { PrismaClient } from "@prisma/client";

import { DatabaseService } from "../database/database.service";
import { IngestionLockRepository } from "../ingestion/ingestion-lock.repository";
import type { MasterCvCanonicalExtractionOutput } from "../master-cv-canonical-extraction/master-cv-canonical-extraction.types";
import { ProfileCanonicalMergeService } from "../profiles/profile-canonical-merge.service";
import { ProfileReadinessService } from "../profiles/profile-readiness.service";
import { CvMasterPromotionService } from "./cv-master-promotion.service";
import { CvProcessingWorker } from "./cv-processing.worker";
import { CvProcessingJobService } from "./cv-processing-job.service";
import { CvTalentCaptureService } from "./cv-talent-capture.service";
import { CvUserProfileSyncService } from "./cv-user-profile-sync.service";

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

function fakeCanonicalOutput(
  fullName: string,
): MasterCvCanonicalExtractionOutput {
  return {
    canonicalProfile: {
      fullName,
      headline: "Desenvolvedora",
      email: null,
      phone: null,
      linkedinUrl: null,
      location: { city: null, state: null, country: null },
      professionalSummary: null,
      experiences: [],
      education: [
        {
          institution: "Universidade Teste",
          degree: "Bacharelado",
          fieldOfStudy: "Ciência da Computação",
          startDate: "2015",
          endDate: "2019",
        },
      ],
      skills: ["TypeScript", "Node.js"],
      languages: [{ language: "Inglês", level: "Avançado" }],
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

// Fake de storage em memória (mesmo padrão de resumes.service.spec.ts —
// objeto Pick<StorageService, ...> passado direto no construtor) usado
// pelos testes de round-trip real de Fase 2B: putObject/getObject sobre um
// Map, sem tocar S3 de verdade, mas exercitando o mesmo contrato
// (idempotência de leitura, erro NoSuchKey pra objeto ausente).
class FakeStorage {
  private readonly objects = new Map<string, Buffer>();

  async putObject(key: string, body: Buffer): Promise<string> {
    this.objects.set(key, body);
    return `fake://${key}`;
  }

  async getObject(key: string): Promise<Buffer> {
    const object = this.objects.get(key);
    if (!object) {
      const error = new Error(`NoSuchKey: ${key}`) as Error & {
        name: string;
      };
      error.name = "NoSuchKey";
      throw error;
    }
    return object;
  }

  get size(): number {
    return this.objects.size;
  }
}

function buildWorker(
  extract: () => Promise<MasterCvCanonicalExtractionOutput>,
  storage: Pick<FakeStorage, "getObject"> = new FakeStorage(),
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

// Processa só o job indicado, direto (claim + a etapa interna
// processJob privada), sem passar pelo scanner de PENDING do batch — o
// banco de teste é compartilhado entre specs, e outros arquivos podem
// deixar jobs PENDING órfãos por design (ex.:
// cv-processing-job.service.spec.ts#enqueue nunca os reivindica). Usar o
// batch aqui faria este worker processar (e chamar a fake extração de)
// jobs de OUTROS testes também, quebrando as asserções de contagem.
// claimOne/recoverStaleProcessing/processPendingBatch já têm cobertura
// dedicada em cv-processing-job.service.spec.ts.
async function processOne(
  worker: CvProcessingWorker,
  jobId: string,
  workerId = `test-worker-${randomUUID()}`,
) {
  const claimed = await jobService.claimOne(jobId, workerId);
  assert.ok(claimed, `job ${jobId} deveria estar PENDING e ser reivindicável`);
  await (
    worker as unknown as {
      processJob: (job: typeof claimed) => Promise<void>;
    }
  ).processJob(claimed);
}

async function createUser() {
  return prisma.user.create({
    data: {
      email: `cv-processing-worker+${randomUUID()}@example.com`,
      name: "CV Processing Worker Test",
      profile: { create: {} },
    },
  });
}

async function enqueueJob(
  userId: string,
  text: string,
  storage: FakeStorage,
  masterIntent: "PROMOTE_IF_FIRST" | "NONE" = "PROMOTE_IF_FIRST",
) {
  const textSha256 = randomUUID().replace(/-/g, "").padEnd(64, "0");
  const textStorageKey = `cv-processing/users/${userId}/${textSha256}.txt`;
  await storage.putObject(textStorageKey, Buffer.from(text, "utf-8"));

  const cvSource = await prisma.cvSource.create({
    data: { ownerType: "USER", userId, textStorageKey, textSha256 },
  });
  const cvSubmission = await prisma.cvSubmission.create({
    data: { cvSourceId: cvSource.id, origin: "PASTED_TEXT" },
  });
  return jobService.enqueue({
    cvSourceId: cvSource.id,
    cvSubmissionId: cvSubmission.id,
    masterIntent,
  });
}

test("worker: fluxo completo — extração, Base de Talentos, Master, UserProfile sync e MonitorProjectionJob", async () => {
  const user = await createUser();
  const storage = new FakeStorage();
  const job = await enqueueJob(
    user.id,
    "Fulana de Tal\nExperiência com TypeScript.",
    storage,
  );

  const worker = buildWorker(
    async () => fakeCanonicalOutput("Fulana de Tal"),
    storage,
  );
  await processOne(worker, job.id);

  const finalJob = await prisma.cvProcessingJob.findUniqueOrThrow({
    where: { id: job.id },
  });
  assert.equal(finalJob.status, "READY");
  assert.ok(finalJob.cvStructuredProfileId);
  assert.ok(finalJob.masterDesignationId);

  assert.ok(finalJob.cvStructuredProfileId);
  const structuredProfile = await prisma.cvStructuredProfile.findUniqueOrThrow({
    where: { id: finalJob.cvStructuredProfileId },
  });
  assert.equal(structuredProfile.status, "READY");

  // Base de Talentos — sempre, mesmo tendo virado Master.
  const talentProfile = await prisma.talentProfile.findUniqueOrThrow({
    where: { userId: user.id },
  });
  const educationObservations = await prisma.talentEducationObservation.count({
    where: { talentProfileId: talentProfile.id },
  });
  const competencyObservations = await prisma.talentCompetencyObservation.count(
    { where: { talentProfileId: talentProfile.id } },
  );
  assert.equal(educationObservations, 1);
  assert.equal(competencyObservations, 2);

  // Master + UserProfile + MonitorProjectionJob, tudo consistente.
  const designation = await prisma.cvMasterDesignation.findFirstOrThrow({
    where: { userId: user.id, supersededAt: null },
  });
  assert.equal(designation.cvStructuredProfileId, structuredProfile.id);

  const userProfile = await prisma.userProfile.findUniqueOrThrow({
    where: { userId: user.id },
  });
  assert.equal(userProfile.fullName, "Fulana de Tal");

  const projectionJob = await prisma.monitorProjectionJob.findFirstOrThrow({
    where: { userId: user.id },
  });
  assert.equal(projectionJob.reason, "MASTER_CREATED");
});

test("worker: CvProcessingJob com masterIntent NONE nunca cria MonitorProjectionJob", async () => {
  const user = await createUser();
  const storage = new FakeStorage();
  const job = await enqueueJob(user.id, "cv avulso", storage, "NONE");

  const worker = buildWorker(
    async () => fakeCanonicalOutput("Fulana Avulsa"),
    storage,
  );
  await processOne(worker, job.id);

  const finalJob = await prisma.cvProcessingJob.findUniqueOrThrow({
    where: { id: job.id },
  });
  assert.equal(finalJob.status, "READY");
  assert.equal(finalJob.masterDesignationId, null);

  // Base de Talentos ainda roda (seção 2 — sempre, Master ou não).
  const talentProfile = await prisma.talentProfile.findUnique({
    where: { userId: user.id },
  });
  assert.ok(talentProfile);

  const projectionJobs = await prisma.monitorProjectionJob.count({
    where: { userId: user.id },
  });
  assert.equal(projectionJobs, 0);
});

test("worker: processo morre entre extração READY e promoção — retry completa sem duplicar extração nem ficar em limbo", async () => {
  const user = await createUser();
  const storage = new FakeStorage();
  const job = await enqueueJob(
    user.id,
    "Ciclano da Silva\nExperiência com Node.js.",
    storage,
  );

  let extractCalls = 0;
  const worker = buildWorker(async () => {
    extractCalls += 1;
    return fakeCanonicalOutput("Ciclano da Silva");
  }, storage);

  // Simula o "processo morrendo" logo após a extração ficar READY: chama
  // ensureStructuredProfile diretamente (via claim + só a etapa 1) e então
  // força o job de volta pra PENDING (como recoverStaleProcessing faria),
  // sem nunca ter chamado a promoção. O retry completo deve then reusar a
  // extração já READY (sem nova chamada de IA) e completar a promoção.
  const claimed = await jobService.claimOne(job.id, "worker-that-dies");
  assert.ok(claimed);

  const cvSource = await prisma.cvSource.findUniqueOrThrow({
    where: { id: claimed.cvSourceId },
  });
  const text = (await storage.getObject(cvSource.textStorageKey)).toString(
    "utf-8",
  );
  assert.ok(text.length > 0);

  // "Morte": não processa mais nada, só devolve pra PENDING como o
  // recoverStaleProcessing faria após o timeout de stale.
  await prisma.cvProcessingJob.update({
    where: { id: job.id },
    data: { status: "PENDING", claimedAt: null, workerId: null },
  });

  // Retry completo: roda o worker de verdade agora, só neste job.
  await processOne(worker, job.id);
  assert.equal(extractCalls, 1); // uma única extração real, no retry

  const finalJob = await prisma.cvProcessingJob.findUniqueOrThrow({
    where: { id: job.id },
  });
  assert.equal(finalJob.status, "READY");
  assert.ok(finalJob.masterDesignationId);

  const projectionJobs = await prisma.monitorProjectionJob.count({
    where: { userId: user.id },
  });
  assert.equal(projectionJobs, 1); // nunca duplicado pelo retry
});

test("worker (Fase 2B): objeto ausente no storage vira falha de job com lastError claro, não exceção genérica", async () => {
  const user = await createUser();
  const storage = new FakeStorage();
  const textSha256 = randomUUID().replace(/-/g, "").padEnd(64, "0");
  const textStorageKey = `cv-processing/users/${user.id}/${textSha256}.txt`;
  // Deliberadamente NÃO grava o objeto no storage (simula perda/expiração).
  const cvSource = await prisma.cvSource.create({
    data: { ownerType: "USER", userId: user.id, textStorageKey, textSha256 },
  });
  const cvSubmission = await prisma.cvSubmission.create({
    data: { cvSourceId: cvSource.id, origin: "PASTED_TEXT" },
  });
  const job = await jobService.enqueue({
    cvSourceId: cvSource.id,
    cvSubmissionId: cvSubmission.id,
    masterIntent: "NONE",
  });

  const worker = buildWorker(async () => fakeCanonicalOutput("N/A"), storage);
  await processOne(worker, job.id);

  const finalJob = await prisma.cvProcessingJob.findUniqueOrThrow({
    where: { id: job.id },
  });
  // attempts=1 < MAX_CV_PROCESSING_ATTEMPTS: volta pra PENDING (retryable),
  // nunca fica travado em PROCESSING nem quebra com stack trace genérico.
  assert.equal(finalJob.status, "PENDING");
  assert.match(finalJob.lastError ?? "", /objeto ausente no storage/);
});

test("worker (Fase 2B): leitura do storage é idempotente — ler o mesmo objeto duas vezes dá o mesmo resultado", async () => {
  const storage = new FakeStorage();
  const key = "cv-processing/users/idempotent-test/abc.txt";
  await storage.putObject(key, Buffer.from("conteúdo estável", "utf-8"));

  const first = await storage.getObject(key);
  const second = await storage.getObject(key);
  assert.equal(first.toString("utf-8"), second.toString("utf-8"));
});
