// Teste de integração real (Postgres local — earlycv_test, nunca produção)
// da Fase 3C, Tarefa 2 (docs/specs/2026-09-04-cv-canonical-profile-pipeline-plan.md
// v3 + instrução da sessão 2026-09-05): correção do bug #1 do piloto
// Fase 3B — POST /resumes (ResumesService#create) nunca preenchia
// CvMasterDesignation.resumeId pro Resume recém-criado, mesmo quando esse
// Resume virava o Master (Resume.isMaster=true) de verdade. A correção
// passa createdResume.id como resumeId pro CvProcessingEntrypointService,
// que propaga pro CvProcessingJob e, no CvProcessingWorker, dispara
// CvMasterPromotionService#syncResumeIsMaster com o resumeId certo.
//
// Estes testes provam, via CvProcessingWorker real (não mock), que ao
// final da extração READY: CvMasterDesignation.resumeId aponta exatamente
// pro Resume criado por create(), em 6 cenários exigidos pela tarefa.
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
  return { entrypoint, masterPromotion, resumesService, storage };
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

async function processAllPending(worker: CvProcessingWorker, userId: string) {
  // Roda até não haver mais PENDING — cobre os testes de retry (2
  // tentativas) e concorrência (2 jobs) sem depender de conhecer os ids
  // com antecedência. Escopado por userId (via CvSource.userId): a suíte
  // completa roda todos os arquivos de spec no MESMO processo, sobre o
  // MESMO banco de teste compartilhado — um scan global de PENDING aqui
  // reivindicaria (e provavelmente falharia, por causa de storage fake
  // isolado por teste) jobs de OUTROS arquivos rodando em paralelo,
  // deixando este teste flaky por interferência cruzada nunca causada por
  // ele mesmo.
  for (let i = 0; i < 10; i++) {
    const pending = await prisma.cvProcessingJob.findMany({
      where: { status: "PENDING", cvSource: { userId } },
      select: { id: true },
    });
    if (pending.length === 0) return;
    for (const { id } of pending) {
      const claimed = await jobService.claimOne(
        id,
        `test-worker-${randomUUID()}`,
      );
      if (!claimed) continue;
      await (
        worker as unknown as {
          processJob: (job: typeof claimed) => Promise<void>;
        }
      ).processJob(claimed);
    }
  }
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

async function createUser() {
  return prisma.user.create({
    data: {
      email: `resumes-create-master+${randomUUID()}@example.com`,
      name: "Create Master Designation Test",
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

async function assertDesignationPointsToResume(
  userId: string,
  resumeId: string,
) {
  const active = await prisma.cvMasterDesignation.findFirstOrThrow({
    where: { userId, supersededAt: null },
  });
  assert.equal(
    active.resumeId,
    resumeId,
    "CvMasterDesignation ativa precisa apontar pro Resume recém-criado por create()",
  );
  const masterResume = await prisma.resume.findUniqueOrThrow({
    where: { id: resumeId },
  });
  assert.equal(masterResume.isMaster, true);
  const otherMasters = await prisma.resume.count({
    where: { userId, isMaster: true, NOT: { id: resumeId } },
  });
  assert.equal(otherMasters, 0);
}

// Cenário 1: upload novo, usuário sem Master prévio nenhum.
test("create(): upload novo sem Master prévio grava CvMasterDesignation.resumeId corretamente", async () => {
  await withFlagEnabled(async () => {
    const user = await createUser();
    const { resumesService, masterPromotion, storage } = buildServices();
    const fullName = `Fulano ${randomUUID()}`;

    const created = await resumesService.create(user.id, {
      title: "CV novo",
      rawText: `Currículo de ${fullName}`,
    } as never);

    const worker = buildWorker(storage, masterPromotion, async () => ({
      canonicalProfile: minimalCanonicalProfile(fullName),
      extractionCoverage: {
        identifiedFields: [],
        missingFields: [],
        fieldStatus: {},
      },
      confidence: {},
      evidence: {},
    }));
    await processAllPending(worker, user.id);

    await assertDesignationPointsToResume(user.id, created.id);
  });
});

// Cenário 2: usuário sem Master nenhum ainda (mesma coisa que 1, mas
// exercitado explicitamente contando Resumes antes do upload, exigido pela
// tarefa como cenário próprio).
test("create(): usuário sem nenhum Resume ainda — primeiro upload vira Master com resumeId ligado", async () => {
  await withFlagEnabled(async () => {
    const user = await createUser();
    const { resumesService, masterPromotion, storage } = buildServices();

    const countBefore = await prisma.resume.count({
      where: { userId: user.id },
    });
    assert.equal(countBefore, 0);

    const fullName = `Ciclana ${randomUUID()}`;
    const created = await resumesService.create(user.id, {
      title: "Primeiro CV",
      rawText: `Currículo de ${fullName}`,
    } as never);

    const worker = buildWorker(storage, masterPromotion, async () => ({
      canonicalProfile: minimalCanonicalProfile(fullName),
      extractionCoverage: {
        identifiedFields: [],
        missingFields: [],
        fieldStatus: {},
      },
      confidence: {},
      evidence: {},
    }));
    await processAllPending(worker, user.id);

    await assertDesignationPointsToResume(user.id, created.id);
  });
});

// Cenário 3: usuário com Master anterior — upload novo substitui.
test("create(): usuário com Master anterior — novo upload substitui a designação e o resumeId aponta pro Resume novo", async () => {
  await withFlagEnabled(async () => {
    const user = await createUser();
    const { resumesService, masterPromotion, storage } = buildServices();

    const oldName = `Antigo ${randomUUID()}`;
    const oldCreated = await resumesService.create(user.id, {
      title: "CV antigo",
      rawText: `Currículo de ${oldName}`,
    } as never);
    const worker = buildWorker(storage, masterPromotion, async () => ({
      canonicalProfile: minimalCanonicalProfile(oldName),
      extractionCoverage: {
        identifiedFields: [],
        missingFields: [],
        fieldStatus: {},
      },
      confidence: {},
      evidence: {},
    }));
    await processAllPending(worker, user.id);
    await assertDesignationPointsToResume(user.id, oldCreated.id);

    const newName = `Novo ${randomUUID()}`;
    const newCreated = await resumesService.create(user.id, {
      title: "CV novo",
      isPrimary: true,
      rawText: `Currículo de ${newName}`,
    } as never);
    assert.notEqual(newCreated.id, oldCreated.id);

    const workerB = buildWorker(storage, masterPromotion, async () => ({
      canonicalProfile: minimalCanonicalProfile(newName),
      extractionCoverage: {
        identifiedFields: [],
        missingFields: [],
        fieldStatus: {},
      },
      confidence: {},
      evidence: {},
    }));
    await processAllPending(workerB, user.id);

    await assertDesignationPointsToResume(user.id, newCreated.id);

    const supersededCount = await prisma.cvMasterDesignation.count({
      where: { userId: user.id, supersededAt: { not: null } },
    });
    assert.equal(supersededCount, 1);
  });
});

// Cenário 4: conteúdo já existente (mesmo hash) — CvSource é reaproveitado
// por dedup, mas o resumeId gravado precisa ser o do Resume criado por
// ESTA chamada de create(), não o de uma fonte anterior.
test("create(): conteúdo com o mesmo hash de um CvSource existente ainda grava o resumeId certo (dedup não perde a ligação)", async () => {
  await withFlagEnabled(async () => {
    const user = await createUser();
    const { resumesService, masterPromotion, storage } = buildServices();
    const sharedText = `Currículo duplicado ${randomUUID()}`;
    const fullName = `Repetida ${randomUUID()}`;

    // Primeiro upload cria o CvSource real para este texto.
    const first = await resumesService.create(user.id, {
      title: "CV primeira vez",
      rawText: sharedText,
    } as never);
    const worker = buildWorker(storage, masterPromotion, async () => ({
      canonicalProfile: minimalCanonicalProfile(fullName),
      extractionCoverage: {
        identifiedFields: [],
        missingFields: [],
        fieldStatus: {},
      },
      confidence: {},
      evidence: {},
    }));
    await processAllPending(worker, user.id);
    await assertDesignationPointsToResume(user.id, first.id);

    // Segundo upload, mesmo texto (mesmo textSha256) — dedup reaproveita o
    // CvSource, mas cria um Resume NOVO (create() sempre cria um Resume por
    // chamada) que precisa virar o Master com o resumeId certo.
    const second = await resumesService.create(user.id, {
      title: "CV reenviado (mesmo conteúdo)",
      isPrimary: true,
      rawText: sharedText,
    } as never);
    assert.notEqual(second.id, first.id);

    const workerB = buildWorker(storage, masterPromotion, async () => ({
      canonicalProfile: minimalCanonicalProfile(fullName),
      extractionCoverage: {
        identifiedFields: [],
        missingFields: [],
        fieldStatus: {},
      },
      confidence: {},
      evidence: {},
    }));
    await processAllPending(workerB, user.id);

    await assertDesignationPointsToResume(user.id, second.id);
  });
});

// Cenário 5: retry — a extração falha na primeira tentativa e é reprocessada
// (mesmo job, novo ciclo do worker); não deve duplicar nem perder a ligação.
test("create(): retry após falha na extração não duplica job nem perde o resumeId", async () => {
  await withFlagEnabled(async () => {
    const user = await createUser();
    const { resumesService, masterPromotion, storage } = buildServices();
    const fullName = `Retry ${randomUUID()}`;

    const created = await resumesService.create(user.id, {
      title: "CV com retry",
      rawText: `Currículo de ${fullName}`,
    } as never);

    let attempts = 0;
    const worker = buildWorker(storage, masterPromotion, async () => {
      attempts += 1;
      if (attempts === 1) {
        throw new Error("falha simulada de extração (1a tentativa)");
      }
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
    });

    // 1a tentativa: falha, job deveria voltar pra PENDING (ver
    // CvProcessingWorker#processJob) ou ficar FAILED-retryable — reenfileira
    // manualmente forçando o job de volta a PENDING, mesmo padrão do
    // cenário "7" do piloto (pilot-simulation.e2e-spec.ts).
    const jobsBefore = await prisma.cvProcessingJob.findMany({
      where: { cvSource: { ownerType: "USER", userId: user.id } },
    });
    assert.equal(
      jobsBefore.length,
      1,
      "deveria existir exatamente um job antes do retry",
    );
    const jobId = jobsBefore[0]!.id;

    const claimed1 = await jobService.claimOne(jobId, "worker-attempt-1");
    assert.ok(claimed1);
    await (
      worker as unknown as {
        processJob: (job: typeof claimed1) => Promise<void>;
      }
    ).processJob(claimed1);

    await prisma.cvProcessingJob.update({
      where: { id: jobId },
      data: { status: "PENDING", attempts: { increment: 0 } },
    });

    const claimed2 = await jobService.claimOne(jobId, "worker-attempt-2");
    assert.ok(claimed2);
    await (
      worker as unknown as {
        processJob: (job: typeof claimed2) => Promise<void>;
      }
    ).processJob(claimed2);

    assert.equal(attempts, 2);

    const jobsAfter = await prisma.cvProcessingJob.count({
      where: { cvSource: { ownerType: "USER", userId: user.id } },
    });
    assert.equal(jobsAfter, 1, "retry não deveria duplicar o job");

    await assertDesignationPointsToResume(user.id, created.id);
  });
});

// Cenário 6: concorrência — duas requisições simultâneas de create() para o
// MESMO usuário (conexões reais de banco, sem mock de transação). A segunda
// requisição usa isPrimary: false explícito (não compete pela eleição de
// Master) — isolando a concorrência de dedup de CvSource/CvProcessingJob e
// ligação de resumeId sob requisições reais simultâneas. A lacuna que
// existia aqui — create() fazia "contar Resumes, decidir, apagar o Master
// antigo, inserir o novo" sem lock quando o usuário ainda não tinha nenhum
// Resume (o loop de supersedeIfResumeMatches, que hoje adquire o advisory
// lock, só roda se já existir um Master antigo a suspender) — foi fechada:
// create() agora adquire o mesmo advisory lock (cv-master-designation:
// userId:<id>) logo no início da transação, antes de contar/decidir,
// serializando com qualquer outra chamada concorrente de create()/setPrimary/
// CvMasterPromotionService para o mesmo usuário.
test("create(): duas requisições simultâneas de upload para o mesmo usuário — resumeId consistente sob concorrência real de banco", async () => {
  await withFlagEnabled(async () => {
    const user = await createUser();
    const {
      resumesService: serviceA,
      masterPromotion,
      storage,
    } = buildServices();
    const { resumesService: serviceB } = buildServices();

    const nameA = `Concorrente A ${randomUUID()}`;
    const nameB = `Concorrente B ${randomUUID()}`;

    const [createdA, createdB] = await Promise.all([
      serviceA.create(user.id, {
        title: "CV concorrente A (vira Master)",
        rawText: `Currículo de ${nameA}`,
      } as never),
      serviceB.create(user.id, {
        title: "CV concorrente B (não compete por Master)",
        isPrimary: false,
        rawText: `Currículo de ${nameB}`,
      } as never),
    ]);

    const worker = buildWorker(storage, masterPromotion, async () => ({
      canonicalProfile: minimalCanonicalProfile(nameA),
      extractionCoverage: {
        identifiedFields: [],
        missingFields: [],
        fieldStatus: {},
      },
      confidence: {},
      evidence: {},
    }));
    await processAllPending(worker, user.id);

    await assertDesignationPointsToResume(user.id, createdA.id);

    const resumeB = await prisma.resume.findUniqueOrThrow({
      where: { id: createdB.id },
    });
    assert.equal(
      resumeB.isMaster,
      false,
      "Resume B nunca deveria ter virado Master (isPrimary: false explícito)",
    );
  });
});

// Achado real de auditoria manual (2026-09-09): create() criava o CvSource
// (via enqueueFromUserText) mas nunca escrevia cvSourceId/cvSubmissionId de
// volta no Resume recém-criado — qualquer busca posterior por "qual Resume
// já representa esta fonte" (ex.: CvAdaptationService#
// ensureResumeForMasterPromotion, usado toda vez que uma reanálise usa
// masterResumeId) nunca encontrava este Resume, mesmo com o CvSource certo
// já existindo (dedup por hash funcionando) — criava um Resume duplicado
// "bare" (título genérico) pro mesmo conteúdo. Este teste prova a correção
// isolada: o Resume nasce com cvSourceId/cvSubmissionId preenchidos.
test("create(): Resume nasce com cvSourceId/cvSubmissionId linkados à fonte que o próprio enqueueFromUserText criou", async () => {
  await withFlagEnabled(async () => {
    const user = await createUser();
    const { resumesService } = buildServices();

    const created = await resumesService.create(user.id, {
      title: `CV linkado ${randomUUID()}`,
      rawText: `Currículo de teste de link ${randomUUID()}`,
    } as never);

    const resumeAfter = await prisma.resume.findUniqueOrThrow({
      where: { id: created.id },
    });
    assert.ok(
      resumeAfter.cvSourceId,
      "Resume precisa ter cvSourceId preenchido logo após create()",
    );
    assert.ok(
      resumeAfter.cvSubmissionId,
      "Resume precisa ter cvSubmissionId preenchido logo após create()",
    );

    const cvSource = await prisma.cvSource.findUniqueOrThrow({
      where: { id: resumeAfter.cvSourceId as string },
    });
    assert.equal(cvSource.userId, user.id);
  });
});
