// Teste de integração real (Postgres local) — cobre o achado de 2026-09-09
// (edições diretas em UserProfile nunca alimentavam análises novas) e a
// garantia contrária (análises/adaptações já existentes nunca são tocadas).
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";

import { PrismaClient } from "@prisma/client";

import { DatabaseService } from "../database/database.service";
import { ProfileCanonicalMergeService } from "../profiles/profile-canonical-merge.service";
import { ProfileReadinessService } from "../profiles/profile-readiness.service";
import { CvMasterPromotionService } from "./cv-master-promotion.service";
import { CvUserProfileSyncService } from "./cv-user-profile-sync.service";
import { UserProfileMasterSyncService } from "./user-profile-master-sync.service";

const prisma = new PrismaClient();
const database = new DatabaseService(prisma);
const userProfileSync = new CvUserProfileSyncService(
  new ProfileCanonicalMergeService(),
  new ProfileReadinessService(),
);
const masterPromotion = new CvMasterPromotionService(database, userProfileSync);

class FakeStorage {
  async putObject(): Promise<string> {
    return "fake://noop";
  }
}

const service = new UserProfileMasterSyncService(
  database,
  masterPromotion,
  new FakeStorage(),
);

async function createUser() {
  return prisma.user.create({
    data: {
      email: `user-profile-master-sync+${randomUUID()}@example.com`,
      name: "User Profile Master Sync Test",
      profile: { create: {} },
    },
  });
}

async function setProfileExperience(userId: string, role: string) {
  return prisma.userProfile.update({
    where: { userId },
    data: {
      fullName: "Ana Souza",
      // profileFieldMetaJson com source "manual_edit" — mesmo formato que
      // profiles.service.ts#update grava a cada PUT /users/profile real.
      // Sem isso, UserProfileMasterSyncService trata como "nunca editado
      // manualmente" e não sincroniza nada (gate 2026-09-10).
      profileFieldMetaJson: {
        fullName: { source: "manual_edit", manuallyEdited: true },
        experiencesJson: { source: "manual_edit", manuallyEdited: true },
      },
      experiencesJson: [
        {
          id: "exp-1",
          role,
          company: "Acme",
          description: "Descrição",
        },
      ],
    },
  });
}

test("UserProfile preenchido só por projeção de IA (sem edição manual): no-op, nunca mexe no Master", async () => {
  const user = await createUser();
  // Mesmo conteúdo de setProfileExperience, mas SEM profileFieldMetaJson
  // "manual_edit" — simula os campos projetados automaticamente pela
  // extração por IA (CvUserProfileSyncService), nunca tocados pelo usuário.
  await prisma.userProfile.update({
    where: { userId: user.id },
    data: {
      fullName: "Ana Souza",
      experiencesJson: [
        { id: "exp-1", role: "Gerente de Produto", company: "Acme" },
      ],
    },
  });

  await service.ensureMasterReflectsProfileEdits(user.id);

  const active = await masterPromotion.getActiveDesignation({
    ownerType: "USER",
    userId: user.id,
  });
  assert.equal(
    active,
    null,
    "não deveria promover nada sem nenhuma edição manual real",
  );
});

test("Master ativo de arquivo enviado: sincronização reusa o MESMO Resume, preservando título/nome do arquivo original", async () => {
  const user = await createUser();

  const cvSource = await prisma.cvSource.create({
    data: {
      ownerType: "USER",
      userId: user.id,
      textStorageKey: "inline:original",
      textSha256: `original-${randomUUID()}`,
    },
  });
  const structuredProfile = await prisma.cvStructuredProfile.create({
    data: {
      cvSourceId: cvSource.id,
      extractorVersion: "v1",
      schemaVersion: "v1",
      status: "READY",
      canonicalJson: {},
      finishedAt: new Date(),
    },
  });
  const originalResume = await prisma.resume.create({
    data: {
      userId: user.id,
      title: "meu-curriculo-2024",
      sourceFileName: "meu-curriculo-2024.pdf",
      kind: "master",
      isMaster: true,
      cvSourceId: cvSource.id,
      rawText: "conteudo original",
    },
  });
  await masterPromotion.promote({
    ownerType: "USER",
    userId: user.id,
    cvStructuredProfileId: structuredProfile.id,
    resumeId: originalResume.id,
    masterIntent: "PROMOTE_EXPLICIT",
    promotedReason: "FIRST_EVER",
    syncResumeIsMaster: true,
  });

  await setProfileExperience(user.id, "Gerente de Produto Sênior");
  await service.ensureMasterReflectsProfileEdits(user.id);

  const active = await masterPromotion.getActiveDesignation({
    ownerType: "USER",
    userId: user.id,
  });
  assert.equal(
    active!.resumeId,
    originalResume.id,
    "deveria reusar o Resume do arquivo original, nunca criar um novo",
  );

  const resumeAfter = await prisma.resume.findUniqueOrThrow({
    where: { id: originalResume.id },
  });
  assert.equal(
    resumeAfter.title,
    "meu-curriculo-2024",
    "o título/nome do arquivo original nunca pode ser sobrescrito pela sincronização",
  );
  assert.equal(resumeAfter.sourceFileName, "meu-curriculo-2024.pdf");

  const resumeCount = await prisma.resume.count({ where: { userId: user.id } });
  assert.equal(resumeCount, 1, "não deveria criar um segundo Resume");
});

test("sem CV nenhum no UserProfile: no-op, nenhuma designação criada", async () => {
  const user = await createUser();
  await service.ensureMasterReflectsProfileEdits(user.id);

  const active = await masterPromotion.getActiveDesignation({
    ownerType: "USER",
    userId: user.id,
  });
  assert.equal(active, null);
});

test("primeira sincronização promove um Master novo a partir do UserProfile", async () => {
  const user = await createUser();
  await setProfileExperience(user.id, "Gerente de Produto");

  await service.ensureMasterReflectsProfileEdits(user.id);

  const active = await masterPromotion.getActiveDesignation({
    ownerType: "USER",
    userId: user.id,
  });
  assert.ok(active, "esperava uma designação ativa");
  assert.equal(active!.promotedReason, "PROFILE_EDIT_SYNC");
  assert.ok(active!.resumeId, "esperava resumeId preenchido (invariante de banco)");

  const resume = await prisma.resume.findUnique({
    where: { id: active!.resumeId! },
  });
  assert.equal(resume?.isMaster, true);

  const structuredProfile = await prisma.cvStructuredProfile.findUnique({
    where: { id: active!.cvStructuredProfileId },
  });
  assert.equal(
    (structuredProfile?.canonicalJson as { fullName?: string })?.fullName,
    "Ana Souza",
  );
});

test("chamar de novo sem editar o perfil é no-op (nenhuma nova designação)", async () => {
  const user = await createUser();
  await setProfileExperience(user.id, "Gerente de Produto");
  await service.ensureMasterReflectsProfileEdits(user.id);

  const before = await masterPromotion.getActiveDesignation({
    ownerType: "USER",
    userId: user.id,
  });

  await service.ensureMasterReflectsProfileEdits(user.id);

  const after = await masterPromotion.getActiveDesignation({
    ownerType: "USER",
    userId: user.id,
  });
  assert.equal(after!.id, before!.id, "não deveria criar uma designação nova");
});

test("editar o perfil de novo promove uma versão nova, reusando o mesmo Resume", async () => {
  const user = await createUser();
  await setProfileExperience(user.id, "Gerente de Produto");
  await service.ensureMasterReflectsProfileEdits(user.id);

  const first = await masterPromotion.getActiveDesignation({
    ownerType: "USER",
    userId: user.id,
  });

  await setProfileExperience(user.id, "Diretora de Produto");
  await service.ensureMasterReflectsProfileEdits(user.id);

  const second = await masterPromotion.getActiveDesignation({
    ownerType: "USER",
    userId: user.id,
  });

  assert.notEqual(second!.id, first!.id, "deveria ter promovido uma versão nova");
  assert.equal(
    second!.resumeId,
    first!.resumeId,
    "deveria reusar o mesmo Resume, nunca criar um segundo",
  );

  const resumeCount = await prisma.resume.count({ where: { userId: user.id } });
  assert.equal(resumeCount, 1, "não deveria duplicar Resume a cada edição");

  const supersededFirst = await prisma.cvMasterDesignation.findUnique({
    where: { id: first!.id },
  });
  assert.ok(supersededFirst?.supersededAt, "a designação antiga deveria ter sido supersedida");
});

test("análise/adaptação já existente nunca é tocada por uma sincronização posterior", async () => {
  const user = await createUser();
  await setProfileExperience(user.id, "Gerente de Produto");
  await service.ensureMasterReflectsProfileEdits(user.id);

  const activeBefore = await masterPromotion.getActiveDesignation({
    ownerType: "USER",
    userId: user.id,
  });

  // Simula uma CvAdaptation histórica gerada com a versão ANTIGA do Master.
  const historicalAdaptation = await prisma.cvAdaptation.create({
    data: {
      userId: user.id,
      jobDescriptionText: "vaga de teste",
      status: "delivered",
      cvStructuredProfileId: activeBefore!.cvStructuredProfileId,
    },
  });

  await setProfileExperience(user.id, "Diretora de Produto");
  await service.ensureMasterReflectsProfileEdits(user.id);

  const reread = await prisma.cvAdaptation.findUniqueOrThrow({
    where: { id: historicalAdaptation.id },
  });
  assert.equal(
    reread.cvStructuredProfileId,
    activeBefore!.cvStructuredProfileId,
    "a adaptação histórica deveria continuar apontando pro CvStructuredProfile de quando foi criada",
  );

  const originalStructuredProfile = await prisma.cvStructuredProfile.findUniqueOrThrow(
    { where: { id: activeBefore!.cvStructuredProfileId } },
  );
  assert.equal(
    (originalStructuredProfile.canonicalJson as { experiences?: Array<{ role?: string }> })
      ?.experiences?.[0]?.role,
    "Gerente de Produto",
    "o CvStructuredProfile antigo é imutável — nunca reflete a edição posterior",
  );
});
