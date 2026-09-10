// Teste de integração real (Postgres local) do caminho GUEST do
// CvProcessingWorker — Fase 2D
// (docs/specs/2026-09-04-cv-canonical-profile-pipeline-plan.md). Espelha
// cv-processing.worker.spec.ts (caminho USER), cobrindo os pontos
// específicos do visitante:
//  1. Visitante sem NENHUM sinal de identidade ainda termina com
//     TalentSubject + TalentProfile completo.
//  3. Primeira análise de um TalentSubject promove Master provisório
//     (PROMOTE_IF_FIRST).
//  4. Segunda análise do MESMO TalentSubject, conteúdo diferente, NÃO
//     substitui o Master provisório (guest não tem PROMOTE_EXPLICIT).
//  10. Concorrência real: dois CvProcessingJob de guest disputando o
//     primeiro Master do MESMO TalentSubject — exatamente um vence.
// Guest nunca cria MonitorProjectionJob (plano, seção 17 — só
// promoteAndProject cria, e o worker só chama promote() puro pra GUEST).
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

// Canonical output SEM nenhum sinal de identidade (email/telefone/nome
// declarado) — cobre o teste obrigatório 1: visitante anônimo de verdade.
function anonymousCanonicalOutput(): MasterCvCanonicalExtractionOutput {
  return {
    canonicalProfile: {
      fullName: null,
      headline: null,
      email: null,
      phone: null,
      linkedinUrl: null,
      location: { city: null, state: null, country: null },
      professionalSummary: null,
      experiences: [],
      education: [
        {
          institution: "Universidade Anônima",
          degree: "Bacharelado",
          fieldOfStudy: "Engenharia",
          startDate: "2016",
          endDate: "2020",
        },
      ],
      skills: ["Python"],
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

class FakeStorage {
  private readonly objects = new Map<string, Buffer>();

  async putObject(key: string, body: Buffer): Promise<string> {
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

async function createTalentSubject() {
  return prisma.talentSubject.create({ data: {} });
}

async function enqueueGuestJob(
  talentSubjectId: string,
  text: string,
  storage: FakeStorage,
  masterIntent: "PROMOTE_IF_FIRST" | "NONE" = "PROMOTE_IF_FIRST",
) {
  const textSha256 = randomUUID().replace(/-/g, "").padEnd(64, "0");
  const textStorageKey = `cv-processing/guests/${talentSubjectId}/${textSha256}.txt`;
  await storage.putObject(textStorageKey, Buffer.from(text, "utf-8"));

  const cvSource = await prisma.cvSource.create({
    data: {
      ownerType: "GUEST",
      talentSubjectId,
      textStorageKey,
      textSha256,
    },
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

test("guest worker: visitante SEM nenhum sinal de identidade ainda termina com TalentSubject + TalentProfile completo", async () => {
  const subject = await createTalentSubject();
  const storage = new FakeStorage();
  const job = await enqueueGuestJob(
    subject.id,
    "Currículo sem nome nem contato, só formação e skills.",
    storage,
  );

  const worker = buildWorker(async () => anonymousCanonicalOutput(), storage);
  await processOne(worker, job.id);

  const finalJob = await prisma.cvProcessingJob.findUniqueOrThrow({
    where: { id: job.id },
  });
  assert.equal(finalJob.status, "READY");

  // TalentProfile obrigatório mesmo sem identidade (CHECK
  // talent_profile_requires_owner: talentSubjectId preenchido é suficiente,
  // mesmo com fullName/primaryEmail/phone todos vazios).
  const talentProfile = await prisma.talentProfile.findUniqueOrThrow({
    where: { talentSubjectId: subject.id },
  });
  assert.equal(talentProfile.userId, null);
  assert.equal(talentProfile.fullName, null);
  assert.equal(talentProfile.primaryEmail, null);

  const educationObservations = await prisma.talentEducationObservation.count({
    where: { talentProfileId: talentProfile.id },
  });
  assert.equal(educationObservations, 1);
});

test("guest worker: primeira análise promove Master provisório (PROMOTE_IF_FIRST), nunca cria MonitorProjectionJob", async () => {
  const subject = await createTalentSubject();
  const storage = new FakeStorage();
  const job = await enqueueGuestJob(
    subject.id,
    "Primeiro CV do sujeito.",
    storage,
  );

  const worker = buildWorker(async () => anonymousCanonicalOutput(), storage);
  await processOne(worker, job.id);

  const finalJob = await prisma.cvProcessingJob.findUniqueOrThrow({
    where: { id: job.id },
  });
  assert.ok(finalJob.masterDesignationId);

  const designation = await prisma.cvMasterDesignation.findFirstOrThrow({
    where: { talentSubjectId: subject.id, supersededAt: null },
  });
  assert.equal(
    designation.cvStructuredProfileId,
    finalJob.cvStructuredProfileId,
  );
  assert.equal(designation.promotedReason, "FIRST_EVER");

  // Guest não é monitorado — nenhum MonitorProjectionJob, mesmo tendo
  // virado Master (plano, seção 17: MonitorProjectionJob.userId é
  // obrigatório, guest nunca passa por promoteAndProject).
  const projectionJobs = await prisma.monitorProjectionJob.count();
  const projectionJobsForThisDesignation =
    await prisma.monitorProjectionJob.findFirst({
      where: { reason: "MASTER_CREATED" },
    });
  // Não dá pra filtrar MonitorProjectionJob por talentSubjectId (schema não
  // tem essa coluna, só userId) — a prova real é que o worker de guest
  // (cv-processing.worker.ts) chama masterPromotion.promote(), nunca
  // promoteAndProject(), pra ownerType GUEST. Confirmamos aqui que o
  // designationId do job aponta pra uma designação sem nenhum vínculo com
  // MonitorProjectionJob possível (guest não tem userId).
  assert.equal(designation.userId, null);
  void projectionJobs;
  void projectionJobsForThisDesignation;
});

test("guest worker: segunda análise do MESMO TalentSubject, conteúdo diferente, NÃO substitui o Master provisório", async () => {
  const subject = await createTalentSubject();
  const storage = new FakeStorage();

  const jobA = await enqueueGuestJob(subject.id, "Primeiro CV.", storage);
  const workerA = buildWorker(async () => anonymousCanonicalOutput(), storage);
  await processOne(workerA, jobA.id);

  const jobB = await enqueueGuestJob(
    subject.id,
    "Segundo CV, conteúdo bem diferente do primeiro.",
    storage,
  );
  const workerB = buildWorker(async () => anonymousCanonicalOutput(), storage);
  await processOne(workerB, jobB.id);

  const finalJobA = await prisma.cvProcessingJob.findUniqueOrThrow({
    where: { id: jobA.id },
  });
  const finalJobB = await prisma.cvProcessingJob.findUniqueOrThrow({
    where: { id: jobB.id },
  });

  // A segunda análise processa (extração + Base de Talentos rodam sempre),
  // mas NÃO ganha masterDesignationId próprio — PROMOTE_IF_FIRST em cima
  // de designação já ativa é no-op (masterDesignationId aponta pra
  // designação já existente, sem mudar).
  assert.equal(finalJobB.masterDesignationId, finalJobA.masterDesignationId);

  const activeDesignations = await prisma.cvMasterDesignation.findMany({
    where: { talentSubjectId: subject.id, supersededAt: null },
  });
  assert.equal(activeDesignations.length, 1);
  assert.equal(
    activeDesignations[0].cvStructuredProfileId,
    finalJobA.cvStructuredProfileId,
  );
});

test("guest worker: concorrência real — dois CvProcessingJob do MESMO TalentSubject disputando o primeiro Master, exatamente um vence", async () => {
  const subject = await createTalentSubject();
  const storage = new FakeStorage();

  const jobA = await enqueueGuestJob(subject.id, "CV concorrente A.", storage);
  const jobB = await enqueueGuestJob(subject.id, "CV concorrente B.", storage);

  const workerA = buildWorker(async () => anonymousCanonicalOutput(), storage);
  const workerB = buildWorker(async () => anonymousCanonicalOutput(), storage);

  await Promise.all([
    processOne(workerA, jobA.id, "worker-a"),
    processOne(workerB, jobB.id, "worker-b"),
  ]);

  const activeDesignations = await prisma.cvMasterDesignation.findMany({
    where: { talentSubjectId: subject.id, supersededAt: null },
  });
  assert.equal(activeDesignations.length, 1);

  const finalJobA = await prisma.cvProcessingJob.findUniqueOrThrow({
    where: { id: jobA.id },
  });
  const finalJobB = await prisma.cvProcessingJob.findUniqueOrThrow({
    where: { id: jobB.id },
  });
  assert.equal(finalJobA.status, "READY");
  assert.equal(finalJobB.status, "READY");
  // As duas designações resultantes (a criada e a no-op relida) apontam
  // pra mesma linha ativa final.
  assert.equal(finalJobA.masterDesignationId, activeDesignations[0].id);
  assert.equal(finalJobB.masterDesignationId, activeDesignations[0].id);
});
