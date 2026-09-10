// Teste de integração real (Postgres local — earlycv_test, nunca produção)
// da Fase 3 (pré-rollout), correção de POST /resumes/:id/set-primary
// (docs/specs/2026-09-04-cv-canonical-profile-pipeline-plan.md, Tarefa 1).
//
// Substitui os testes da Fase 2G que documentavam (como se fosse
// aceitável) uma divergência real: com a flag ligada, Resume.isMaster
// virava true de forma síncrona e incondicional ANTES da extração/
// promoção canônica terminar — havia um momento observável em que o
// Resume novo já era isMaster=true mas CvMasterDesignation/UserProfile
// ainda apontavam pro Master antigo (ou nem existiam). Esta suíte prova
// que isso não acontece mais: o Master ANTIGO permanece 100% oficial
// (Resume.isMaster E CvMasterDesignation) enquanto a extração não chega a
// READY; a troca inteira (designação + Resume.isMaster + UserProfile +
// MonitorProjectionJob) só acontece numa única transação curta, atômica,
// depois que a extração está pronta.
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
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
import { ResumesService } from "./resumes.service";

const prisma = new PrismaClient();
const database = new DatabaseService(prisma);
const jobService = new CvProcessingJobService(database);

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

function buildServices() {
  const storage = new FakeStorage();
  const entrypoint = new CvProcessingEntrypointService(
    database,
    jobService,
    storage,
  );
  const userProfileSync = new CvUserProfileSyncService(
    new ProfileCanonicalMergeService(),
    new ProfileReadinessService(),
  );
  const masterPromotion = new CvMasterPromotionService(
    database,
    userProfileSync,
  );
  const resumesService = new ResumesService(
    database,
    storage as never,
    undefined,
    entrypoint,
    masterPromotion,
  );
  return {
    entrypoint,
    masterPromotion,
    resumesService,
    storage,
    userProfileSync,
  };
}

function buildWorker(
  storage: Pick<FakeStorage, "getObject">,
  masterPromotion: CvMasterPromotionService,
  extract: () => Promise<MasterCvCanonicalExtractionOutput>,
) {
  const talentCapture = new CvTalentCaptureService(database);
  const lockRepository = new IngestionLockRepository(database);
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
}

function minimalCanonicalProfile(fullName: string) {
  return {
    fullName,
    headline: null,
    email: null,
    phone: null,
    linkedinUrl: null,
    location: { city: null, state: null, country: null },
    professionalSummary: null,
    experiences: [],
    education: [],
    skills: [],
    languages: [],
    certifications: [],
  };
}

function fakeCanonicalOutput(
  fullName: string,
): MasterCvCanonicalExtractionOutput {
  return {
    canonicalProfile: minimalCanonicalProfile(fullName),
    extractionCoverage: {
      identifiedFields: [],
      missingFields: [],
      fieldStatus: {},
    },
    confidence: {},
    evidence: {},
  };
}

async function createUser() {
  return prisma.user.create({
    data: {
      email: `resumes-set-primary+${randomUUID()}@example.com`,
      name: "Set Primary Canonical Test",
      profile: { create: {} },
    },
  });
}

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

test("set-primary (flag ligada): Resume já com CvStructuredProfile READY promove na hora, sem novo CvProcessingJob", async () => {
  await withFlagEnabled(async () => {
    const user = await createUser();
    const { resumesService } = buildServices();

    const textSha256 = createHash("sha256").update(randomUUID()).digest("hex");
    const cvSource = await prisma.cvSource.create({
      data: {
        ownerType: "USER",
        userId: user.id,
        textStorageKey: `inline:${randomUUID()}`,
        textSha256,
      },
    });
    const structuredProfile = await prisma.cvStructuredProfile.create({
      data: {
        cvSourceId: cvSource.id,
        extractorVersion: "v1",
        schemaVersion: "v1",
        status: "READY",
        canonicalJson: minimalCanonicalProfile(randomUUID()),
        finishedAt: new Date(),
      },
    });

    const resume = await prisma.resume.create({
      data: {
        userId: user.id,
        title: "CV já processado",
        kind: "master",
        status: "uploaded",
        isMaster: false,
        cvSourceId: cvSource.id,
        rawText: "irrelevante — já tem extração READY",
      },
    });

    const result = await resumesService.setPrimary(user.id, resume.id);

    assert.equal(result.isMaster, true);
    assert.equal(
      (result as { cvProcessingJobId: string | null }).cvProcessingJobId,
      null,
      "não deveria criar um CvProcessingJob novo — extração já READY",
    );
    assert.equal(
      (result as { cvMasterPromotionStatus: string }).cvMasterPromotionStatus,
      "promoted",
    );

    const jobsForSource = await prisma.cvProcessingJob.count({
      where: { cvSourceId: cvSource.id },
    });
    assert.equal(
      jobsForSource,
      0,
      "nenhum CvProcessingJob deveria ter sido criado neste caminho",
    );

    const active = await prisma.cvMasterDesignation.findFirstOrThrow({
      where: { userId: user.id, supersededAt: null },
    });
    assert.equal(active.cvStructuredProfileId, structuredProfile.id);
    assert.equal(active.promotedReason, "EXPLICIT_FLAG");
    assert.equal(active.resumeId, resume.id);
  });
});

test("set-primary (flag ligada): chamar duas vezes para o mesmo Resume já processado é idempotente (no-op na segunda)", async () => {
  await withFlagEnabled(async () => {
    const user = await createUser();
    const { resumesService } = buildServices();

    const textSha256 = createHash("sha256").update(randomUUID()).digest("hex");
    const cvSource = await prisma.cvSource.create({
      data: {
        ownerType: "USER",
        userId: user.id,
        textStorageKey: `inline:${randomUUID()}`,
        textSha256,
      },
    });
    const structuredProfile = await prisma.cvStructuredProfile.create({
      data: {
        cvSourceId: cvSource.id,
        extractorVersion: "v1",
        schemaVersion: "v1",
        status: "READY",
        canonicalJson: minimalCanonicalProfile(randomUUID()),
        finishedAt: new Date(),
      },
    });
    const resume = await prisma.resume.create({
      data: {
        userId: user.id,
        title: "CV idempotente",
        kind: "master",
        status: "uploaded",
        isMaster: false,
        cvSourceId: cvSource.id,
        rawText: "conteudo",
      },
    });

    const first = await resumesService.setPrimary(user.id, resume.id);
    const second = await resumesService.setPrimary(user.id, resume.id);

    assert.equal(first.isMaster, true);
    assert.equal(second.isMaster, true);
    assert.equal(
      (second as { cvMasterPromotionStatus: string }).cvMasterPromotionStatus,
      "promoted",
    );

    const designations = await prisma.cvMasterDesignation.findMany({
      where: { userId: user.id },
    });
    assert.equal(
      designations.length,
      1,
      "segunda chamada não deveria criar uma segunda designação (já é a ativa)",
    );
    assert.equal(designations[0]?.cvStructuredProfileId, structuredProfile.id);
  });
});

test("set-primary (flag ligada): promoção concorrente entre dois Resumes já READY do mesmo usuário — exatamente uma designação ativa ao final", async () => {
  await withFlagEnabled(async () => {
    const user = await createUser();
    const { resumesService: serviceA } = buildServices();
    const { resumesService: serviceB } = buildServices();

    async function makeReadyResume(label: string) {
      const textSha256 = createHash("sha256")
        .update(`${label}-${randomUUID()}`)
        .digest("hex");
      const cvSource = await prisma.cvSource.create({
        data: {
          ownerType: "USER",
          userId: user.id,
          textStorageKey: `inline:${randomUUID()}`,
          textSha256,
        },
      });
      const structuredProfile = await prisma.cvStructuredProfile.create({
        data: {
          cvSourceId: cvSource.id,
          extractorVersion: "v1",
          schemaVersion: "v1",
          status: "READY",
          canonicalJson: minimalCanonicalProfile(randomUUID()),
          finishedAt: new Date(),
        },
      });
      const resume = await prisma.resume.create({
        data: {
          userId: user.id,
          title: `CV concorrente ${label}`,
          kind: "master",
          status: "uploaded",
          isMaster: false,
          cvSourceId: cvSource.id,
          rawText: "conteudo",
        },
      });
      return { resume, structuredProfile };
    }

    const { resume: resumeA } = await makeReadyResume("A");
    const { resume: resumeB } = await makeReadyResume("B");

    const [resultA, resultB] = await Promise.all([
      serviceA.setPrimary(user.id, resumeA.id),
      serviceB.setPrimary(user.id, resumeB.id),
    ]);

    assert.equal(resultA.isMaster, true);
    assert.equal(resultB.isMaster, true);

    const activeDesignations = await prisma.cvMasterDesignation.findMany({
      where: { userId: user.id, supersededAt: null },
    });
    assert.equal(
      activeDesignations.length,
      1,
      "no máximo uma CvMasterDesignation ativa por usuário",
    );

    const isMasterResumes = await prisma.resume.count({
      where: { userId: user.id, isMaster: true },
    });
    assert.equal(
      isMasterResumes,
      1,
      "no máximo um Resume.isMaster=true por usuário",
    );

    // A designação ativa e o único Resume.isMaster=true nunca podem
    // discordar sobre qual é o Master (regra central desta correção).
    const activeDesignation = activeDesignations[0];
    assert.ok(activeDesignation);
    const masterResume = await prisma.resume.findFirstOrThrow({
      where: { userId: user.id, isMaster: true },
    });
    assert.equal(activeDesignation.resumeId, masterResume.id);
  });
});

test("set-primary (flag desligada): comportamento legado idêntico, nunca toca o pipeline canônico", async () => {
  const user = await createUser();
  const { resumesService } = buildServices();

  const resumeA = await prisma.resume.create({
    data: {
      userId: user.id,
      title: "CV A",
      kind: "master",
      status: "uploaded",
      isMaster: true,
      rawText: "conteudo",
    },
  });
  const resumeB = await prisma.resume.create({
    data: {
      userId: user.id,
      title: "CV B",
      kind: "master",
      status: "uploaded",
      isMaster: false,
      rawText: "conteudo B",
    },
  });

  const result = await resumesService.setPrimary(user.id, resumeB.id);

  assert.equal(result.isMaster, true);
  assert.equal(
    Object.hasOwn(result, "cvProcessingJobId"),
    false,
    "flag desligada nunca deveria anexar campos do pipeline novo",
  );

  const cvSourceCount = await prisma.cvSource.count({
    where: { userId: user.id },
  });
  assert.equal(cvSourceCount, 0, "flag desligada nunca cria CvSource");

  const designationCount = await prisma.cvMasterDesignation.count({
    where: { userId: user.id },
  });
  assert.equal(designationCount, 0);

  const refreshedA = await prisma.resume.findUniqueOrThrow({
    where: { id: resumeA.id },
  });
  assert.equal(refreshedA.isMaster, false);
});

test("set-primary (flag ligada): falha ao ENFILEIRAR a integração canônica nunca troca Resume.isMaster (nada commitado, Master antigo intacto)", async () => {
  await withFlagEnabled(async () => {
    const user = await createUser();
    const { masterPromotion } = buildServices();

    // Correção da Fase 3: diferente da Fase 2G (onde isMaster já tinha
    // sido commitado ANTES da integração rodar, então uma falha aqui era
    // tolerada), agora nada foi commitado ainda quando o entrypoint é
    // chamado — uma falha aqui precisa propagar (nunca fingir sucesso),
    // porque fingir sucesso faria o chamador achar que trocou quando o
    // Master antigo continua sendo o real.
    const brokenEntrypoint = {
      enqueueFromUserText: async () => {
        throw new Error("storage indisponível (simulado)");
      },
    };

    const resumesService = new ResumesService(
      database,
      new FakeStorage() as never,
      undefined,
      brokenEntrypoint as never,
      masterPromotion,
    );

    const resumeA = await prisma.resume.create({
      data: {
        userId: user.id,
        title: "CV A",
        kind: "master",
        status: "uploaded",
        isMaster: true,
        rawText: "conteudo",
      },
    });
    const resumeB = await prisma.resume.create({
      data: {
        userId: user.id,
        title: "CV B",
        kind: "master",
        status: "uploaded",
        isMaster: false,
        rawText: "conteudo B",
      },
    });

    await assert.rejects(() => resumesService.setPrimary(user.id, resumeB.id));

    const refreshedA = await prisma.resume.findUniqueOrThrow({
      where: { id: resumeA.id },
    });
    const refreshedB = await prisma.resume.findUniqueOrThrow({
      where: { id: resumeB.id },
    });
    assert.equal(
      refreshedA.isMaster,
      true,
      "Master antigo precisa continuar intacto quando a integração falha",
    );
    assert.equal(refreshedB.isMaster, false);

    const isMasterCount = await prisma.resume.count({
      where: { userId: user.id, isMaster: true },
    });
    assert.equal(isMasterCount, 1);
  });
});

// ---------------------------------------------------------------------------
// Os 5 momentos exigidos (Tarefa 1): estado de Resume.isMaster,
// CvMasterDesignation, UserProfile, UserRadarProfile e MonitorProjectionJob
// (1) antes da troca, (2) durante PENDING/PROCESSING, (3) após falha da
// extração, (4) após retry bem-sucedido, (5) após promoção bem-sucedida.
// Usa o CvProcessingWorker real (não mock) para provar que o flip de
// Resume.isMaster só acontece ATÔMICO com a CvMasterDesignation, dentro do
// worker — nunca antes, mesmo no caminho assíncrono.
// ---------------------------------------------------------------------------
test("set-primary (flag ligada, Resume legado sem extração pronta): os 5 momentos — Master antigo nunca 'meio trocado'", async () => {
  await withFlagEnabled(async () => {
    const user = await createUser();
    const { resumesService, masterPromotion, storage } = buildServices();

    // --- Setup: resumeA já é o Master formal (designação ativa + UserProfile
    // sincronizado), simulando uma promoção canônica anterior de verdade.
    const textShaA = createHash("sha256").update(randomUUID()).digest("hex");
    const cvSourceA = await prisma.cvSource.create({
      data: {
        ownerType: "USER",
        userId: user.id,
        textStorageKey: `inline:${randomUUID()}`,
        textSha256: textShaA,
      },
    });
    const structuredProfileA = await prisma.cvStructuredProfile.create({
      data: {
        cvSourceId: cvSourceA.id,
        extractorVersion: "v1",
        schemaVersion: "v1",
        status: "READY",
        canonicalJson: minimalCanonicalProfile("Fulana Master Atual"),
        finishedAt: new Date(),
      },
    });
    const resumeA = await prisma.resume.create({
      data: {
        userId: user.id,
        title: "CV A (Master atual)",
        kind: "master",
        status: "uploaded",
        isMaster: true,
        cvSourceId: cvSourceA.id,
        rawText: "conteudo A",
      },
    });
    await masterPromotion.promoteAndProject({
      ownerType: "USER",
      userId: user.id,
      cvStructuredProfileId: structuredProfileA.id,
      resumeId: resumeA.id,
      masterIntent: "PROMOTE_IF_FIRST",
      promotedReason: "FIRST_EVER",
      canonicalProfile: structuredProfileA.canonicalJson as never,
      cvSourceId: cvSourceA.id,
      syncResumeIsMaster: true,
    });

    const resumeB = await prisma.resume.create({
      data: {
        userId: user.id,
        title: "CV B (novo, sem extração ainda)",
        kind: "master",
        status: "uploaded",
        isMaster: false,
        rawText: "Beltrana Nova\nExperiência com Go.",
      },
    });

    async function snapshot() {
      const [resumes, designation, userProfile, radarProfile, projectionJobs] =
        await Promise.all([
          prisma.resume.findMany({ where: { userId: user.id } }),
          prisma.cvMasterDesignation.findFirst({
            where: { userId: user.id, supersededAt: null },
          }),
          prisma.userProfile.findUnique({ where: { userId: user.id } }),
          prisma.userRadarProfile.findUnique({ where: { userId: user.id } }),
          prisma.monitorProjectionJob.count({ where: { userId: user.id } }),
        ]);
      return {
        resumes,
        designation,
        userProfile,
        radarProfile,
        projectionJobs,
      };
    }

    function assertOldMasterStillOfficial(
      state: Awaited<ReturnType<typeof snapshot>>,
      label: string,
    ) {
      const a = state.resumes.find((r) => r.id === resumeA.id);
      const b = state.resumes.find((r) => r.id === resumeB.id);
      assert.equal(
        a?.isMaster,
        true,
        `${label}: resumeA deveria seguir master`,
      );
      assert.equal(
        b?.isMaster,
        false,
        `${label}: resumeB não deveria virar master`,
      );
      assert.equal(
        state.designation?.cvStructuredProfileId,
        structuredProfileA.id,
        `${label}: designação ativa deveria continuar apontando pro perfil A`,
      );
      assert.equal(
        state.userProfile?.fullName,
        "Fulana Master Atual",
        `${label}: UserProfile não deveria ter mudado`,
      );
    }

    // (1) Antes da troca — baseline.
    const before = await snapshot();
    assertOldMasterStillOfficial(before, "momento 1 (baseline)");
    assert.equal(before.projectionJobs, 1); // só o da promoção inicial de A

    // Dispara a troca — sem extração pronta para B, deve enfileirar e
    // NUNCA tocar Resume.isMaster agora.
    const result = await resumesService.setPrimary(user.id, resumeB.id);
    assert.equal(
      (result as { cvMasterPromotionStatus: string }).cvMasterPromotionStatus,
      "pending",
    );
    const jobId = (result as { cvProcessingJobId: string }).cvProcessingJobId;
    assert.ok(jobId, "esperava um cvProcessingJobId para polling");

    // (2) Durante PENDING — Master antigo ainda 100% oficial.
    const duringPending = await snapshot();
    assertOldMasterStillOfficial(duringPending, "momento 2 (PENDING)");

    const pendingJob = await prisma.cvProcessingJob.findUniqueOrThrow({
      where: { id: jobId },
    });
    assert.equal(pendingJob.status, "PENDING");
    assert.equal(pendingJob.masterIntent, "PROMOTE_EXPLICIT");
    assert.equal(pendingJob.resumeId, resumeB.id);

    // (3) Após falha da extração — Master antigo continua intacto, nada
    // meio-trocado, job recuperável (volta pra PENDING, attempts < max).
    const brokenWorker = buildWorker(storage, masterPromotion, async () => {
      throw new Error("extração falhou (simulado)");
    });
    await processOne(brokenWorker, jobId);

    const afterFailure = await snapshot();
    assertOldMasterStillOfficial(afterFailure, "momento 3 (após falha)");
    assert.equal(
      afterFailure.projectionJobs,
      1,
      "falha nunca cria MonitorProjectionJob",
    );

    const failedJob = await prisma.cvProcessingJob.findUniqueOrThrow({
      where: { id: jobId },
    });
    assert.equal(failedJob.status, "PENDING"); // recuperável, attempts=1 < 3
    assert.match(failedJob.lastError ?? "", /extração falhou/);

    // (4) Após retry bem-sucedido — promove corretamente, sem duplicar.
    const workingWorker = buildWorker(storage, masterPromotion, async () =>
      fakeCanonicalOutput("Beltrana Nova"),
    );
    await processOne(workingWorker, jobId);

    const readyJob = await prisma.cvProcessingJob.findUniqueOrThrow({
      where: { id: jobId },
    });
    assert.equal(readyJob.status, "READY");
    assert.ok(readyJob.masterDesignationId);

    // (5) Após promoção bem-sucedida — tudo consistente, atômico,
    // MonitorProjectionJob criado exatamente uma vez.
    const after = await snapshot();
    const a = after.resumes.find((r) => r.id === resumeA.id);
    const b = after.resumes.find((r) => r.id === resumeB.id);
    assert.equal(a?.isMaster, false, "resumeA deveria ter sido demovido");
    assert.equal(b?.isMaster, true, "resumeB deveria ser o Master agora");
    assert.equal(
      after.designation?.resumeId,
      resumeB.id,
      "designação ativa deveria apontar pro Resume novo",
    );
    assert.notEqual(
      after.designation?.cvStructuredProfileId,
      structuredProfileA.id,
      "designação ativa deveria ser a extração nova, não mais a de A",
    );
    assert.equal(after.userProfile?.fullName, "Beltrana Nova");
    assert.equal(
      after.projectionJobs,
      2,
      "exatamente um novo MonitorProjectionJob para a troca (1 da criação inicial + 1 desta)",
    );

    const supersededA = await prisma.cvMasterDesignation.findFirst({
      where: { cvStructuredProfileId: structuredProfileA.id },
    });
    assert.ok(
      supersededA?.supersededAt,
      "designação antiga fica superseded, nunca apagada",
    );

    // Nunca existe divergência entre Resume.isMaster e CvMasterDesignation
    // ao final — checagem explícita da invariante central desta correção.
    const isMasterCount = await prisma.resume.count({
      where: { userId: user.id, isMaster: true },
    });
    assert.equal(isMasterCount, 1);
    const masterDesignationCount = await prisma.cvMasterDesignation.count({
      where: { userId: user.id, supersededAt: null },
    });
    assert.equal(masterDesignationCount, 1);
  });
});
