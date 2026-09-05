// Testes reais de banco (Postgres local — earlycv_test, nunca produção)
// para o claim granular por fonte — Fase 2E
// (docs/specs/2026-09-04-cv-canonical-profile-pipeline-plan.md, seção 4).
// Espelha o padrão já usado em cv-master-promotion.service.spec.ts e
// cv-processing-guest.worker.spec.ts: processa CvProcessingJob real via
// CvProcessingWorker (extração fake, sem IA de verdade) pra chegar a um
// estado READY realista antes de exercitar o claim.
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { test } from "node:test";

import { PrismaClient } from "@prisma/client";

import { DatabaseService } from "../database/database.service";
import { IngestionLockRepository } from "../ingestion/ingestion-lock.repository";
import type { MasterCvCanonicalExtractionOutput } from "../master-cv-canonical-extraction/master-cv-canonical-extraction.types";
import { ProfileCanonicalMergeService } from "../profiles/profile-canonical-merge.service";
import { ProfileReadinessService } from "../profiles/profile-readiness.service";
import { ClaimSourceGrantService } from "./claim-source-grant.service";
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
const claimService = new ClaimSourceGrantService(database, masterPromotion);

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

async function processOne(worker: CvProcessingWorker, jobId: string) {
  const claimed = await jobService.claimOne(
    jobId,
    `test-worker-${randomUUID()}`,
  );
  assert.ok(claimed, `job ${jobId} deveria estar PENDING e ser reivindicável`);
  await (
    worker as unknown as {
      processJob: (job: typeof claimed) => Promise<void>;
    }
  ).processJob(claimed);
  return prisma.cvProcessingJob.findUniqueOrThrow({ where: { id: jobId } });
}

function canonicalOutput(marker: string): MasterCvCanonicalExtractionOutput {
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
          institution: `Universidade ${marker}`,
          degree: "Bacharelado",
          fieldOfStudy: "Engenharia",
          startDate: "2016",
          endDate: "2020",
        },
      ],
      skills: [marker],
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

async function createTalentSubject() {
  return prisma.talentSubject.create({ data: {} });
}

async function createUser(withProfile = true) {
  return prisma.user.create({
    data: {
      email: `claim-source-grant+${randomUUID()}@example.com`,
      name: "Claim Source Grant Test",
      ...(withProfile ? { profile: { create: {} } } : {}),
    },
  });
}

async function enqueueGuestJob(
  talentSubjectId: string,
  text: string,
  storage: FakeStorage,
  masterIntent: "PROMOTE_IF_FIRST" | "NONE" = "PROMOTE_IF_FIRST",
  textSha256Override?: string,
) {
  const textSha256 =
    textSha256Override ??
    createHash("sha256").update(`${randomUUID()}-${text}`).digest("hex");
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
  const job = await jobService.enqueue({
    cvSourceId: cvSource.id,
    cvSubmissionId: cvSubmission.id,
    masterIntent,
  });
  return { cvSource, cvSubmission, job };
}

// AnalysisJob real (mesmo shape que startGuestAnalysisJobCanonical grava),
// já com ownership transferida pro usuário — ClaimSourceGrantService nunca
// reverifica posse, então os testes aqui simulam o estado que
// cv-adaptation.service#claimGuestAnalysisJob já teria deixado ANTES de
// chamar claim().
// cvStructuredProfileId obrigatório aqui a partir da Fase 2F: a trigger
// trg_analysis_job_succeeded_requires_ready_profile (migration
// 20260905131500) passou a exigir, para toda linha com cvProcessingJobId
// preenchido, que succeeded venha acompanhado de um cvStructuredProfileId
// apontando pra um CvStructuredProfile READY — exatamente o que
// cv-analysis.worker.ts#processReadyJob sempre grava na vida real. Os
// chamadores passam readyJob.cvStructuredProfileId (do CvProcessingJob já
// processado por processOne()), nunca um valor sintético.
async function createClaimedAnalysisJob(
  userId: string,
  cvProcessingJobId: string,
  cvSubmissionId: string,
  cvStructuredProfileId: string,
) {
  return prisma.analysisJob.create({
    data: {
      ownerKind: "guest",
      status: "succeeded",
      userId,
      cvProcessingJobId,
      cvSubmissionId,
      cvStructuredProfileId,
      jobDescriptionText: "Vaga de teste para claim granular.",
    },
  });
}

test("claim sem Master existente do usuário: fonte do guest vira Master (designação + Resume + UserProfile sync + MonitorProjectionJob) numa unidade só", async () => {
  const subject = await createTalentSubject();
  const storage = new FakeStorage();
  const { cvSource, cvSubmission, job } = await enqueueGuestJob(
    subject.id,
    "CV único do sujeito.",
    storage,
  );
  const worker = buildWorker(async () => canonicalOutput("unico"), storage);
  const readyJob = await processOne(worker, job.id);
  assert.equal(readyJob.status, "READY");
  assert.ok(readyJob.masterDesignationId);

  const user = await createUser();
  const analysisJob = await createClaimedAnalysisJob(
    user.id,
    readyJob.id,
    cvSubmission.id,
    readyJob.cvStructuredProfileId as string,
  );

  const result = await claimService.claim({
    userId: user.id,
    analysisJobId: analysisJob.id,
    cvProcessingJobId: readyJob.id,
  });

  assert.equal(result.grantCreated, true);
  assert.equal(result.subject?.reason, "CLAIM_FULL");
  assert.equal(result.master?.promoted, true);
  assert.ok(result.master?.resumeId);
  assert.ok(result.master?.monitorProjectionJobId);

  const designation = await prisma.cvMasterDesignation.findFirstOrThrow({
    where: { userId: user.id, supersededAt: null },
  });
  assert.equal(
    designation.cvStructuredProfileId,
    readyJob.cvStructuredProfileId,
  );
  assert.equal(designation.promotedReason, "CLAIM_PROMOTION");
  assert.equal(designation.resumeId, result.master?.resumeId);

  const resumeId = result.master?.resumeId;
  assert.ok(resumeId);
  const resume = await prisma.resume.findUniqueOrThrow({
    where: { id: resumeId },
  });
  assert.equal(resume.userId, user.id);
  assert.equal(resume.cvSourceId, cvSource.id);
  assert.equal(resume.isMaster, false);

  const monitorProjectionJobId = result.master?.monitorProjectionJobId;
  assert.ok(monitorProjectionJobId);
  const monitorJob = await prisma.monitorProjectionJob.findUniqueOrThrow({
    where: { id: monitorProjectionJobId },
  });
  assert.equal(monitorJob.userId, user.id);
  assert.equal(monitorJob.reason, "MASTER_CREATED");

  const userProfile = await prisma.userProfile.findUniqueOrThrow({
    where: { userId: user.id },
  });
  assert.deepEqual(userProfile.skillsJson, {
    technical: ["unico"],
    business: [],
    soft: [],
  });

  // Merge completo: TalentProfile do guest reapontado pro usuário (mesma
  // linha, zero cópia).
  const talentProfile = await prisma.talentProfile.findUniqueOrThrow({
    where: { userId: user.id },
  });
  assert.equal(talentProfile.talentSubjectId, null);

  const mergedSubject = await prisma.talentSubject.findUniqueOrThrow({
    where: { id: subject.id },
  });
  assert.equal(mergedSubject.mergedIntoUserId, user.id);
});

test("claim COM Master já existente do usuário: Master do usuário é preservado, designação do guest fica intacta (não ativada), grant é criado mesmo assim", async () => {
  const subject = await createTalentSubject();
  const storage = new FakeStorage();
  const { cvSubmission, job } = await enqueueGuestJob(
    subject.id,
    "CV do guest que não deve virar Master.",
    storage,
  );
  const worker = buildWorker(
    async () => canonicalOutput("guest-preservado"),
    storage,
  );
  const readyJob = await processOne(worker, job.id);

  const user = await createUser();
  // Usuário já tem Master ativo próprio, de uma fonte totalmente diferente.
  const ownSource = await prisma.cvSource.create({
    data: {
      ownerType: "USER",
      userId: user.id,
      textStorageKey: "inline:own",
      textSha256: createHash("sha256").update(randomUUID()).digest("hex"),
    },
  });
  const ownProfile = await prisma.cvStructuredProfile.create({
    data: {
      cvSourceId: ownSource.id,
      extractorVersion: "v1",
      schemaVersion: "v1",
      status: "READY",
      canonicalJson: {},
      finishedAt: new Date(),
    },
  });
  await masterPromotion.promoteAndProject({
    ownerType: "USER",
    userId: user.id,
    cvStructuredProfileId: ownProfile.id,
    masterIntent: "PROMOTE_IF_FIRST",
    promotedReason: "FIRST_EVER",
  });
  const userActiveBefore = await prisma.cvMasterDesignation.findFirstOrThrow({
    where: { userId: user.id, supersededAt: null },
  });

  const analysisJob = await createClaimedAnalysisJob(
    user.id,
    readyJob.id,
    cvSubmission.id,
    readyJob.cvStructuredProfileId as string,
  );

  const result = await claimService.claim({
    userId: user.id,
    analysisJobId: analysisJob.id,
    cvProcessingJobId: readyJob.id,
  });

  assert.equal(result.grantCreated, true);
  assert.equal(result.master?.promoted, false);
  assert.equal(result.master?.monitorProjectionJobId, null);

  const userActiveAfter = await prisma.cvMasterDesignation.findFirstOrThrow({
    where: { userId: user.id, supersededAt: null },
  });
  assert.equal(userActiveAfter.id, userActiveBefore.id);
  assert.equal(userActiveAfter.cvStructuredProfileId, ownProfile.id);

  const guestDesignation = await prisma.cvMasterDesignation.findFirstOrThrow({
    where: { talentSubjectId: subject.id },
  });
  assert.equal(guestDesignation.supersededAt, null);
  assert.equal(
    guestDesignation.cvStructuredProfileId,
    readyJob.cvStructuredProfileId,
  );

  const grant = await prisma.claimSourceGrant.findUniqueOrThrow({
    where: {
      cvSourceId_userId: { cvSourceId: readyJob.cvSourceId, userId: user.id },
    },
  });
  assert.equal(grant.provenByAnalysisJobId, analysisJob.id);
});

test("claim chamado duas vezes: segunda chamada é no-op, não duplica ClaimSourceGrant/Resume/observações/MonitorProjectionJob", async () => {
  const subject = await createTalentSubject();
  const storage = new FakeStorage();
  const { cvSubmission, job } = await enqueueGuestJob(
    subject.id,
    "CV para idempotência.",
    storage,
  );
  const worker = buildWorker(
    async () => canonicalOutput("idempotente"),
    storage,
  );
  const readyJob = await processOne(worker, job.id);

  const user = await createUser();
  const analysisJob = await createClaimedAnalysisJob(
    user.id,
    readyJob.id,
    cvSubmission.id,
    readyJob.cvStructuredProfileId as string,
  );

  const first = await claimService.claim({
    userId: user.id,
    analysisJobId: analysisJob.id,
    cvProcessingJobId: readyJob.id,
  });
  const second = await claimService.claim({
    userId: user.id,
    analysisJobId: analysisJob.id,
    cvProcessingJobId: readyJob.id,
  });

  assert.equal(first.grantCreated, true);
  assert.equal(second.grantCreated, false);
  assert.equal(second.master?.resumeId, first.master?.resumeId);

  const grantCount = await prisma.claimSourceGrant.count({
    where: { cvSourceId: readyJob.cvSourceId, userId: user.id },
  });
  assert.equal(grantCount, 1);

  const resumeCount = await prisma.resume.count({ where: { userId: user.id } });
  assert.equal(resumeCount, 1);

  const mergeEventCount = await prisma.talentSubjectMergeEvent.count({
    where: { triggeringAnalysisJobId: analysisJob.id },
  });
  assert.equal(mergeEventCount, 1);

  const monitorJobCount = await prisma.monitorProjectionJob.count({
    where: { userId: user.id },
  });
  assert.equal(monitorJobCount, 1);

  const educationCount = await prisma.talentEducationObservation.count({
    where: {
      talentProfileId: (
        await prisma.talentProfile.findUniqueOrThrow({
          where: { userId: user.id },
        })
      ).id,
    },
  });
  assert.equal(educationCount, 1);
});

test("colisão de hash: usuário já tem CvSource próprio com o mesmo conteúdo — CvSourceEquivalence registrada, nenhuma extração nova, proveniência das observações continua correta", async () => {
  const subject = await createTalentSubject();
  const storage = new FakeStorage();
  const sharedHash = createHash("sha256")
    .update("conteudo-compartilhado")
    .digest("hex");

  const user = await createUser();
  const ownSource = await prisma.cvSource.create({
    data: {
      ownerType: "USER",
      userId: user.id,
      textStorageKey: "inline:own-colliding",
      textSha256: sharedHash,
    },
  });

  const {
    cvSubmission,
    job,
    cvSource: guestSource,
  } = await enqueueGuestJob(
    subject.id,
    "conteudo-compartilhado",
    storage,
    "PROMOTE_IF_FIRST",
    sharedHash,
  );
  const worker = buildWorker(async () => canonicalOutput("colisao"), storage);
  const readyJob = await processOne(worker, job.id);

  const analysisJob = await createClaimedAnalysisJob(
    user.id,
    readyJob.id,
    cvSubmission.id,
    readyJob.cvStructuredProfileId as string,
  );

  const result = await claimService.claim({
    userId: user.id,
    analysisJobId: analysisJob.id,
    cvProcessingJobId: readyJob.id,
  });

  assert.deepEqual(result.equivalence, {
    primaryCvSourceId: ownSource.id,
    equivalentCvSourceId: guestSource.id,
  });

  // Nenhuma extração nova: só existe UM CvStructuredProfile pra qualquer
  // uma das duas fontes envolvidas (o do guest, o único que já existia,
  // reaproveitado — o CvSource próprio do usuário nunca ganha uma
  // extração própria por causa da colisão).
  const structuredProfileCount = await prisma.cvStructuredProfile.count({
    where: { cvSourceId: { in: [guestSource.id, ownSource.id] } },
  });
  assert.equal(structuredProfileCount, 1);

  // CvSource do guest nunca é reapontado/apagado — continua GUEST, dono
  // original inalterado.
  const guestSourceAfter = await prisma.cvSource.findUniqueOrThrow({
    where: { id: guestSource.id },
  });
  assert.equal(guestSourceAfter.ownerType, "GUEST");
  assert.equal(guestSourceAfter.talentSubjectId, subject.id);

  // Resume criado aponta pra fonte à qual o usuário JÁ tinha acesso
  // próprio (a colisão), nunca pra fonte do guest diretamente.
  const collisionResumeId = result.master?.resumeId;
  assert.ok(collisionResumeId);
  const resume = await prisma.resume.findUniqueOrThrow({
    where: { id: collisionResumeId },
  });
  assert.equal(resume.cvSourceId, ownSource.id);

  // Proveniência das observações continua apontando pro CvStructuredProfile
  // real (o do guest, de onde o dado de fato veio) — nunca falsificada.
  const talentProfile = await prisma.talentProfile.findUniqueOrThrow({
    where: { userId: user.id },
  });
  const observation = await prisma.talentEducationObservation.findFirstOrThrow({
    where: { talentProfileId: talentProfile.id },
  });
  assert.equal(
    observation.cvStructuredProfileId,
    readyJob.cvStructuredProfileId,
  );
});

test("claim completo (todas as fontes do TalentSubject cobertas por grants) funde TalentProfile/TalentSubject — convergência a partir de claims parciais", async () => {
  const subject = await createTalentSubject();
  const storage = new FakeStorage();

  const first = await enqueueGuestJob(
    subject.id,
    "Primeiro CV do sujeito.",
    storage,
  );
  const worker1 = buildWorker(async () => canonicalOutput("fonte-1"), storage);
  const readyFirst = await processOne(worker1, first.job.id);
  assert.ok(readyFirst.masterDesignationId); // primeiro CV: Master provisório

  const second = await enqueueGuestJob(
    subject.id,
    "Segundo CV do MESMO sujeito, conteúdo diferente.",
    storage,
    "PROMOTE_IF_FIRST", // guest sempre tenta, mas já existe designação -> no-op
  );
  const worker2 = buildWorker(async () => canonicalOutput("fonte-2"), storage);
  const readySecond = await processOne(worker2, second.job.id);

  const user = await createUser();

  // Claim PARCIAL: só a segunda fonte (não-master) primeiro.
  const analysisJobSecond = await createClaimedAnalysisJob(
    user.id,
    readySecond.id,
    second.cvSubmission.id,
    readySecond.cvStructuredProfileId as string,
  );
  const partial = await claimService.claim({
    userId: user.id,
    analysisJobId: analysisJobSecond.id,
    cvProcessingJobId: readySecond.id,
  });
  assert.equal(partial.subject?.reason, "CLAIM_PARTIAL_COPY");
  assert.equal(partial.master, null); // fonte reivindicada não é o Master do guest

  // TalentProfile do guest continua intacto (não fundido, não movido).
  const guestProfileAfterPartial = await prisma.talentProfile.findUniqueOrThrow(
    {
      where: { talentSubjectId: subject.id },
    },
  );
  assert.equal(guestProfileAfterPartial.mergedIntoTalentProfileId, null);

  // Usuário já tem um TalentProfile próprio com a observação copiada da
  // fonte parcial (insert, sem apagar/mover a do guest).
  const userProfileAfterPartial = await prisma.talentProfile.findUniqueOrThrow({
    where: { userId: user.id },
  });
  const guestEducationCount = await prisma.talentEducationObservation.count({
    where: { talentProfileId: guestProfileAfterPartial.id },
  });
  assert.equal(guestEducationCount, 2); // as duas fontes, intactas no guest
  const userEducationAfterPartial =
    await prisma.talentEducationObservation.count({
      where: { talentProfileId: userProfileAfterPartial.id },
    });
  assert.equal(userEducationAfterPartial, 1); // só a fonte parcial reivindicada

  // Claim da fonte RESTANTE (a que é o Master do guest) — agora as duas
  // estão cobertas por grant, converge pra CLAIM_FULL.
  const analysisJobFirst = await createClaimedAnalysisJob(
    user.id,
    readyFirst.id,
    first.cvSubmission.id,
    readyFirst.cvStructuredProfileId as string,
  );
  const full = await claimService.claim({
    userId: user.id,
    analysisJobId: analysisJobFirst.id,
    cvProcessingJobId: readyFirst.id,
  });
  assert.equal(full.subject?.reason, "CLAIM_FULL");
  assert.equal(full.master?.promoted, true);

  const guestProfileAfterFull = await prisma.talentProfile.findUniqueOrThrow({
    where: { id: guestProfileAfterPartial.id },
  });
  assert.equal(
    guestProfileAfterFull.mergedIntoTalentProfileId,
    userProfileAfterPartial.id,
  );

  // Observações da fonte 1 (que faltavam) agora também existem no perfil
  // do usuário, sem duplicar a que já tinha sido copiada no claim parcial.
  const userEducationAfterFull = await prisma.talentEducationObservation.count({
    where: { talentProfileId: userProfileAfterPartial.id },
  });
  assert.equal(userEducationAfterFull, 2);
});

test("claim falha no meio: nada fica persistido — nem o grant, nem a resolução de sujeito, nem o Resume", async () => {
  const subject = await createTalentSubject();
  const storage = new FakeStorage();
  const { cvSubmission, job } = await enqueueGuestJob(
    subject.id,
    "CV que vai sofrer falha simulada no meio do claim.",
    storage,
  );
  const worker = buildWorker(
    async () => canonicalOutput("falha-meio"),
    storage,
  );
  const readyJob = await processOne(worker, job.id);
  assert.ok(readyJob.masterDesignationId);

  // Corrompe deliberadamente o CvProcessingJob (sem FK — campo solto no
  // schema) pra forçar uma exceção DEPOIS que o grant e a resolução de
  // sujeito já rodaram dentro da MESMA transação: resolveMasterAndResume
  // usa processingJob.cvStructuredProfileId pra buscar o
  // CvStructuredProfile, que aqui não existe.
  await prisma.cvProcessingJob.update({
    where: { id: readyJob.id },
    data: { cvStructuredProfileId: "cuid-inexistente-de-teste" },
  });

  const user = await createUser();
  const analysisJob = await createClaimedAnalysisJob(
    user.id,
    readyJob.id,
    cvSubmission.id,
    readyJob.cvStructuredProfileId as string,
  );

  await assert.rejects(() =>
    claimService.claim({
      userId: user.id,
      analysisJobId: analysisJob.id,
      cvProcessingJobId: readyJob.id,
    }),
  );

  const grantCount = await prisma.claimSourceGrant.count({
    where: { cvSourceId: readyJob.cvSourceId, userId: user.id },
  });
  assert.equal(grantCount, 0);

  const mergeEventCount = await prisma.talentSubjectMergeEvent.count({
    where: { triggeringAnalysisJobId: analysisJob.id },
  });
  assert.equal(mergeEventCount, 0);

  const resumeCount = await prisma.resume.count({ where: { userId: user.id } });
  assert.equal(resumeCount, 0);

  const guestProfile = await prisma.talentProfile.findUniqueOrThrow({
    where: { talentSubjectId: subject.id },
  });
  assert.equal(guestProfile.userId, null);
  assert.equal(guestProfile.mergedIntoTalentProfileId, null);

  const userMasterCount = await prisma.cvMasterDesignation.count({
    where: { userId: user.id },
  });
  assert.equal(userMasterCount, 0);
});
