// Teste de integração real (Postgres local — earlycv_test, nunca produção)
// da Fase 2G: POST /resumes/:id/set-primary integrado ao pipeline canônico
// (docs/specs/2026-09-04-cv-canonical-profile-pipeline-plan.md, "Integrar
// POST /resumes/:id/set-primary"). Cobre os cenários exigidos pelo plano:
// Resume já processado (promove na hora, sem nova extração), Resume legado
// sem extração nova (materializa just-in-time), promoção concorrente
// (duas chamadas reais de banco), falha da extração (isMaster nunca
// quebra), repetição idempotente, flag desligada (legado intacto).
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { test } from "node:test";

import { PrismaClient } from "@prisma/client";
import { CvMasterPromotionService } from "../cv-processing/cv-master-promotion.service";
import { CvProcessingEntrypointService } from "../cv-processing/cv-processing-entrypoint.service";
import { CvProcessingJobService } from "../cv-processing/cv-processing-job.service";
import { CvUserProfileSyncService } from "../cv-processing/cv-user-profile-sync.service";
import { DatabaseService } from "../database/database.service";
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
    if (!object)
      throw Object.assign(new Error("NoSuchKey"), { name: "NoSuchKey" });
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

test("set-primary (flag ligada): Resume legado sem CvSource materializa just-in-time e enfileira um CvProcessingJob", async () => {
  await withFlagEnabled(async () => {
    const user = await createUser();
    const { resumesService } = buildServices();

    const resumeA = await prisma.resume.create({
      data: {
        userId: user.id,
        title: "CV A",
        kind: "master",
        status: "uploaded",
        isMaster: true,
        rawText: `conteudo legado ${randomUUID()}`,
      },
    });
    const resumeB = await prisma.resume.create({
      data: {
        userId: user.id,
        title: "CV B",
        kind: "master",
        status: "uploaded",
        isMaster: false,
        rawText: `conteudo legado B ${randomUUID()}`,
      },
    });

    const result = await resumesService.setPrimary(user.id, resumeB.id);

    assert.equal(result.isMaster, true);
    assert.ok(
      (result as { cvProcessingJobId: string | null }).cvProcessingJobId,
      "esperava um cvProcessingJobId retornado para polling",
    );

    const refreshedA = await prisma.resume.findUniqueOrThrow({
      where: { id: resumeA.id },
    });
    const refreshedB = await prisma.resume.findUniqueOrThrow({
      where: { id: resumeB.id },
    });
    assert.equal(refreshedA.isMaster, false);
    assert.equal(refreshedB.isMaster, true);
    assert.ok(
      refreshedB.cvSourceId,
      "Resume alvo deveria estar ligado a um CvSource (guarantee #1)",
    );

    const job = await prisma.cvProcessingJob.findUniqueOrThrow({
      where: {
        id: (result as { cvProcessingJobId: string }).cvProcessingJobId,
      },
    });
    assert.equal(job.masterIntent, "PROMOTE_EXPLICIT");
    assert.equal(job.cvSourceId, refreshedB.cvSourceId);

    // Nenhuma CvMasterDesignation ativa ainda — o job está PENDING, ainda
    // não processado pelo worker. Legado (Resume.isMaster) já reflete a
    // troca; canônico converge quando o worker rodar (seção 11 do plano).
    const active = await prisma.cvMasterDesignation.findFirst({
      where: { userId: user.id, supersededAt: null },
    });
    assert.equal(active, null);
  });
});

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
      (result as { cvMasterPromoted: boolean }).cvMasterPromoted,
      true,
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
});

test("set-primary (flag ligada): falha na integração canônica nunca quebra o isMaster já commitado (estado recuperável)", async () => {
  await withFlagEnabled(async () => {
    const user = await createUser();
    const { masterPromotion } = buildServices();

    // Entrypoint quebrado deliberadamente (simula falha de storage/DB na
    // materialização just-in-time) — o setPrimary precisa devolver sucesso
    // (Resume.isMaster já commitado antes desta etapa) mesmo assim.
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

    const result = await resumesService.setPrimary(user.id, resumeB.id);

    assert.equal(
      result.isMaster,
      true,
      "isMaster deve refletir a troca mesmo com falha na integração canônica",
    );

    const refreshedA = await prisma.resume.findUniqueOrThrow({
      where: { id: resumeA.id },
    });
    assert.equal(refreshedA.isMaster, false);

    const isMasterCount = await prisma.resume.count({
      where: { userId: user.id, isMaster: true },
    });
    assert.equal(
      isMasterCount,
      1,
      "exatamente um Resume.isMaster=true, mesmo após a falha",
    );
  });
});
