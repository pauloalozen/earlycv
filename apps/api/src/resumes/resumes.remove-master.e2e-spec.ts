// Teste de integração real (Postgres local — earlycv_test, nunca produção)
// da Fase 3C, Tarefa 4 (docs/specs/2026-09-04-cv-canonical-profile-pipeline-plan.md
// v3 + instrução da sessão 2026-09-05): correção do bug #3 do piloto Fase
// 3B — excluir o Resume Master ativo (ResumesService#remove) deixava
// CvMasterDesignation órfã (ativa, apontando pra um Resume que não existe
// mais) em vez de supersedida.
//
// Cobre, com Postgres real: (1) supersessão da designação ativa; (2)
// UserProfile preserva preferências mas limpa dado derivado de CV; (3)
// UserRadarProfile reconciliado (best-effort síncrono) e
// MonitorProjectionJob(MASTER_REMOVED) persistido; (4) CvSource/
// CvStructuredProfile/análises sobrevivem; (5) nenhuma promoção automática;
// (6) zero designação ativa órfã ao final (query).
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { test } from "node:test";

import { PrismaClient } from "@prisma/client";
import { CvMasterPromotionService } from "../cv-processing/cv-master-promotion.service";
import { CvUserProfileSyncService } from "../cv-processing/cv-user-profile-sync.service";
import { DatabaseService } from "../database/database.service";
import { ProfileCanonicalMergeService } from "../profiles/profile-canonical-merge.service";
import { ProfileReadinessService } from "../profiles/profile-readiness.service";
import { UserRadarProfileService } from "../radar/user-radar-profile.service";
import { ResumesService } from "./resumes.service";

const prisma = new PrismaClient();
const database = new DatabaseService(prisma);

class FakeStorage {
  async putObject(): Promise<string> {
    return "fake://noop";
  }
  async getObject(): Promise<Buffer> {
    throw new Error("not used in this suite");
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

function buildServices() {
  const userProfileSync = new CvUserProfileSyncService(
    new ProfileCanonicalMergeService(),
    new ProfileReadinessService(),
  );
  const masterPromotion = new CvMasterPromotionService(
    database,
    userProfileSync,
  );
  const userRadarProfile = new UserRadarProfileService(database);
  const resumesService = new ResumesService(
    database,
    new FakeStorage() as never,
    undefined,
    undefined,
    masterPromotion,
    userRadarProfile,
  );
  return { masterPromotion, resumesService, userProfileSync, userRadarProfile };
}

async function createUser() {
  return prisma.user.create({
    data: {
      email: `resumes-remove-master+${randomUUID()}@example.com`,
      name: "Remove Master Test",
      profile: {
        create: {
          // Preferências manuais do usuário — nunca derivadas de CV, jamais
          // podem ser apagadas por uma exclusão de Master.
          remotePreference: "remote",
          relocationPreference: true,
          targetSalaryMin: 5000,
          targetSalaryMax: 9000,
          preferredLanguage: "pt-BR",
          radarAreas: ["SOFTWARE_ENGINEERING"],
          radarSeniority: "MID",
          profileFieldMetaJson: { fullName: { source: "manual" } },
          // Dado derivado de CV — precisa ser limpo pela exclusão.
          fullName: "Nome Antigo Derivado do CV",
          contactEmail: "antigo@example.com",
          professionalSummary: "Resumo antigo derivado do CV",
          skillsJson: { technical: ["Node.js"], business: [], soft: [] },
          experiencesJson: [{ title: "Dev" }],
          profileReadinessStatus: "ready",
        },
      },
    },
    include: { profile: true },
  });
}

// Monta um Master ativo completo e formal: CvSource + CvStructuredProfile
// READY + Resume(isMaster:true) + CvMasterDesignation ativa apontando pra
// ele — via CvMasterPromotionService#promoteAndProject real (não mock),
// mesmo caminho usado pelo pipeline de verdade.
async function setupActiveMaster(
  userId: string,
  masterPromotion: CvMasterPromotionService,
  fullName: string,
) {
  const textSha256 = createHash("sha256").update(randomUUID()).digest("hex");
  const cvSource = await prisma.cvSource.create({
    data: {
      ownerType: "USER",
      userId,
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
      canonicalJson: minimalCanonicalProfile(fullName),
      finishedAt: new Date(),
    },
  });
  const resume = await prisma.resume.create({
    data: {
      userId,
      title: `Master ${fullName}`,
      kind: "master",
      status: "uploaded",
      isMaster: true,
      cvSourceId: cvSource.id,
      rawText: `Currículo de ${fullName}`,
    },
  });
  const promotion = await masterPromotion.promoteAndProject({
    ownerType: "USER",
    userId,
    cvStructuredProfileId: structuredProfile.id,
    resumeId: resume.id,
    masterIntent: "PROMOTE_IF_FIRST",
    promotedReason: "FIRST_EVER",
    canonicalProfile: structuredProfile.canonicalJson as never,
    cvSourceId: cvSource.id,
    syncResumeIsMaster: true,
  });
  return {
    cvSource,
    structuredProfile,
    resume,
    designation: promotion.activeDesignation,
  };
}

test("remove(): exclusão do Master ativo supersede a designação, nunca deixa órfã", async () => {
  const user = await createUser();
  const { masterPromotion, resumesService } = buildServices();
  const { resume, designation } = await setupActiveMaster(
    user.id,
    masterPromotion,
    "Master a Excluir",
  );

  const result = await resumesService.remove(user.id, resume.id);
  assert.deepEqual(result, { ok: true });

  const supersededDesignation =
    await prisma.cvMasterDesignation.findUniqueOrThrow({
      where: { id: designation.id },
    });
  assert.ok(
    supersededDesignation.supersededAt,
    "designação precisa estar supersedida, nunca ativa apontando pra um Resume apagado",
  );

  const orphanActiveDesignations = await prisma.cvMasterDesignation.count({
    where: { userId: user.id, supersededAt: null },
  });
  assert.equal(
    orphanActiveDesignations,
    0,
    "nenhuma designação ativa órfã deveria sobrar após excluir o Master",
  );
});

test("remove(): UserProfile preserva preferências manuais, mas limpa dado derivado de CV", async () => {
  const user = await createUser();
  const { masterPromotion, resumesService } = buildServices();
  const { resume } = await setupActiveMaster(
    user.id,
    masterPromotion,
    "Master com Perfil",
  );

  // setupActiveMaster já rodou uma promoção real (CvUserProfileSyncService),
  // que reescreve profileFieldMetaJson com a proveniência real da extração
  // (source: base_cv_ai_extraction) — captura o estado logo ANTES do
  // remove() pra provar que remove() em si não TOCA profileFieldMetaJson
  // (metadado de proveniência de campo não é "dado derivado de CV" no
  // sentido que esta correção limpa — é histórico de onde cada campo veio).
  const profileBeforeRemove = await prisma.userProfile.findUniqueOrThrow({
    where: { userId: user.id },
  });

  await resumesService.remove(user.id, resume.id);

  const profile = await prisma.userProfile.findUniqueOrThrow({
    where: { userId: user.id },
  });

  // Preferências manuais preservadas.
  assert.equal(profile.remotePreference, "remote");
  assert.equal(profile.relocationPreference, true);
  assert.equal(profile.targetSalaryMin, 5000);
  assert.equal(profile.targetSalaryMax, 9000);
  assert.equal(profile.preferredLanguage, "pt-BR");
  assert.deepEqual(profile.radarAreas, ["SOFTWARE_ENGINEERING"]);
  assert.equal(profile.radarSeniority, "MID");
  assert.deepEqual(
    profile.profileFieldMetaJson,
    profileBeforeRemove.profileFieldMetaJson,
  );

  // Dado derivado de CV limpo.
  assert.equal(profile.fullName, null);
  assert.equal(profile.contactEmail, null);
  assert.equal(profile.professionalSummary, null);
  assert.deepEqual(profile.experiencesJson, []);
  assert.equal(profile.profileReadinessStatus, "empty");
});

test("remove(): reconcilia UserRadarProfile (best-effort síncrono) e persiste MonitorProjectionJob(MASTER_REMOVED)", async () => {
  const user = await createUser();
  const { masterPromotion, resumesService } = buildServices();
  const { resume } = await setupActiveMaster(
    user.id,
    masterPromotion,
    "Master com Radar",
  );

  // Radar existente ANTES da exclusão, com skill derivada do CV antigo —
  // precisa desaparecer depois do refresh() pós-exclusão (UserProfile já
  // sem skillsJson).
  await prisma.userRadarProfile.create({
    data: {
      userId: user.id,
      areas: ["SOFTWARE_ENGINEERING"],
      seniority: "MID",
      skills: ["Node.js"],
    },
  });

  await resumesService.remove(user.id, resume.id);

  const radarProfile = await prisma.userRadarProfile.findUniqueOrThrow({
    where: { userId: user.id },
  });
  assert.deepEqual(
    radarProfile.skills,
    [],
    "skills derivadas do CV apagado não deveriam sobreviver à reconciliação do radar",
  );
  // radarAreas é preferência manual (preservada em UserProfile), então a
  // reconciliação ainda reflete essa preferência — não é "tudo zerado",
  // é "tudo que era DERIVADO DO CV zerado".
  assert.deepEqual(radarProfile.areas, ["SOFTWARE_ENGINEERING"]);

  const monitorJob = await prisma.monitorProjectionJob.findFirst({
    where: { userId: user.id, reason: "MASTER_REMOVED" },
    orderBy: { createdAt: "desc" },
  });
  assert.ok(
    monitorJob,
    "MonitorProjectionJob(MASTER_REMOVED) precisa ser persistido de forma durável",
  );
});

test("remove(): CvSource/CvStructuredProfile sobrevivem à exclusão do Master (histórico nunca apagado)", async () => {
  const user = await createUser();
  const { masterPromotion, resumesService } = buildServices();
  const { resume, cvSource, structuredProfile } = await setupActiveMaster(
    user.id,
    masterPromotion,
    "Master com Historico",
  );

  await resumesService.remove(user.id, resume.id);

  const survivingSource = await prisma.cvSource.findUnique({
    where: { id: cvSource.id },
  });
  assert.ok(
    survivingSource,
    "CvSource precisa sobreviver à exclusão do Resume",
  );

  const survivingProfile = await prisma.cvStructuredProfile.findUnique({
    where: { id: structuredProfile.id },
  });
  assert.ok(
    survivingProfile,
    "CvStructuredProfile precisa sobreviver à exclusão do Resume",
  );

  const deletedResume = await prisma.resume.findUnique({
    where: { id: resume.id },
  });
  assert.equal(deletedResume, null, "o Resume em si precisa ter sido apagado");
});

test("remove(): nenhuma promoção automática de outro Resume após excluir o Master", async () => {
  const user = await createUser();
  const { masterPromotion, resumesService } = buildServices();
  const { resume } = await setupActiveMaster(
    user.id,
    masterPromotion,
    "Master a Excluir (com outro Resume no ar)",
  );

  // Outro Resume comum do mesmo usuário, nunca deveria virar Master
  // automaticamente só porque o Master ativo foi apagado.
  const otherResume = await prisma.resume.create({
    data: {
      userId: user.id,
      title: "CV adaptado qualquer",
      isMaster: false,
      rawText: "conteudo irrelevante",
    },
  });

  await resumesService.remove(user.id, resume.id);

  const refreshedOther = await prisma.resume.findUniqueOrThrow({
    where: { id: otherResume.id },
  });
  assert.equal(refreshedOther.isMaster, false);

  const activeDesignations = await prisma.cvMasterDesignation.count({
    where: { userId: user.id, supersededAt: null },
  });
  assert.equal(
    activeDesignations,
    0,
    "nenhuma nova designação deveria ter sido criada automaticamente",
  );

  const isMasterCount = await prisma.resume.count({
    where: { userId: user.id, isMaster: true },
  });
  assert.equal(isMasterCount, 0);
});

test("remove(): excluir um Resume comum (não-Master) nunca mexe em CvMasterDesignation", async () => {
  const user = await createUser();
  const { masterPromotion, resumesService } = buildServices();
  const { designation } = await setupActiveMaster(
    user.id,
    masterPromotion,
    "Master Intacto",
  );

  const otherResume = await prisma.resume.create({
    data: {
      userId: user.id,
      title: "CV adaptado, não Master",
      isMaster: false,
      rawText: "conteudo qualquer",
    },
  });

  await resumesService.remove(user.id, otherResume.id);

  const stillActive = await prisma.cvMasterDesignation.findUniqueOrThrow({
    where: { id: designation.id },
  });
  assert.equal(
    stillActive.supersededAt,
    null,
    "excluir um Resume comum nunca deveria supersedir a designação do Master real",
  );
});
