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
import { ClaimSourceGrantService } from "../cv-processing/claim-source-grant.service";
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

function minimalCanonicalProfile(fullName: string, headline: string | null = null) {
  return {
    fullName,
    headline,
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
  headline: string | null = null,
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
      canonicalJson: minimalCanonicalProfile(fullName, headline),
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
  // No pipeline real, CvTalentCaptureService#capture SEMPRE roda antes da
  // promoção (worker: extrai -> captura -> promove) — garante que o
  // TalentProfile já existe pro promoteAndProjectWithinTransaction
  // atualizar (updateMany nunca cria a linha). upsert aqui simula esse
  // passo sem precisar instanciar CvTalentCaptureService inteiro.
  await prisma.talentProfile.upsert({
    where: { userId },
    create: { userId },
    update: {},
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

// ===========================================================================
// Item 3 da correção pós-4ª-rodada — currentTitle na exclusão SEM
// substituto: nenhum outro CV é promovido automaticamente aqui
// (confirmado acima, "nenhuma promoção automática"), então currentTitle
// (fato consolidado, nunca uma projeção ao vivo — ver
// CvMasterPromotionService#promoteAndProjectWithinTransaction) precisa
// ser LIMPO, não deixado apontando pro Master que não existe mais.
//
// Os 6 testes originais acima (pré-existentes, não tocados nesta rodada)
// não tinham cleanup — debt histórico do arquivo, fora do escopo desta
// correção. Os testes NOVOS abaixo (item 3 da 4ª rodada) limpam depois de
// si mesmos: nenhum teste novo pode adicionar resíduo.
// ===========================================================================

async function cleanupUser(
  userId: string,
  extra?: { talentSubjectId?: string },
): Promise<void> {
  await prisma.cvMasterDesignation.deleteMany({ where: { userId } });
  await prisma.resume.deleteMany({ where: { userId } });
  await prisma.talentProfile.deleteMany({ where: { userId } });
  await prisma.cvSource.deleteMany({ where: { userId } });
  await prisma.userProfile.deleteMany({ where: { userId } }).catch(() => undefined);
  await prisma.userRadarProfile.deleteMany({ where: { userId } }).catch(() => undefined);
  await prisma.monitorProjectionJob.deleteMany({ where: { userId } }).catch(() => undefined);
  if (extra?.talentSubjectId) {
    await prisma.cvMasterDesignation.deleteMany({
      where: { talentSubjectId: extra.talentSubjectId },
    });
    await prisma.talentProfile.deleteMany({
      where: { talentSubjectId: extra.talentSubjectId },
    });
    await prisma.cvSource.deleteMany({
      where: { talentSubjectId: extra.talentSubjectId },
    });
    await prisma.talentSubject.deleteMany({ where: { id: extra.talentSubjectId } });
  }
  await prisma.user.deleteMany({ where: { id: userId } });
}

test("remove(): TalentProfile.currentTitle e campos derivados são limpos; preferências/metadados de matching preservados", async () => {
  const user = await createUser();
  try {
    const { masterPromotion, resumesService } = buildServices();
    const { resume } = await setupActiveMaster(
      user.id,
      masterPromotion,
      "Master com Cargo",
      "Engenheiro de Dados Sênior",
    );

    const profileBeforeRemove = await prisma.talentProfile.findUniqueOrThrow({
      where: { userId: user.id },
    });
    assert.equal(profileBeforeRemove.currentTitle, "Engenheiro de Dados Sênior");

    // Preferências de matching — nunca derivadas de CV, nunca tocadas pela
    // exclusão.
    await prisma.talentProfile.update({
      where: { userId: user.id },
      data: {
        internalMatchingEnabled: false,
        b2bExposureStatus: "OPT_IN_GRANTED",
        contactAuthorization: "GRANTED",
      },
    });

    await resumesService.remove(user.id, resume.id);

    const profileAfterRemove = await prisma.talentProfile.findUniqueOrThrow({
      where: { userId: user.id },
    });
    assert.equal(
      profileAfterRemove.currentTitle,
      null,
      "sem Master ativo nenhum, currentTitle não pode continuar apontando pro cargo do Master apagado",
    );
    assert.equal(profileAfterRemove.fullName, null);
    assert.equal(profileAfterRemove.seniority, null);
    assert.equal(profileAfterRemove.yearsExperience, null);
    assert.deepEqual(profileAfterRemove.primaryAreas, []);

    // Preferências de matching preservadas — a exclusão do Master nunca
    // pode desligar/reabrir a exposição B2B ou o matching interno do
    // candidato por conta própria.
    assert.equal(profileAfterRemove.internalMatchingEnabled, false);
    assert.equal(profileAfterRemove.b2bExposureStatus, "OPT_IN_GRANTED");
    assert.equal(profileAfterRemove.contactAuthorization, "GRANTED");
  } finally {
    await cleanupUser(user.id);
  }
});

test("remove(): excluir um Resume comum (não-Master) nunca mexe em TalentProfile.currentTitle", async () => {
  const user = await createUser();
  try {
    const { masterPromotion, resumesService } = buildServices();
    await setupActiveMaster(
      user.id,
      masterPromotion,
      "Master Intacto",
      "Cargo Que Deve Permanecer",
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

    const profile = await prisma.talentProfile.findUniqueOrThrow({
      where: { userId: user.id },
    });
    assert.equal(profile.currentTitle, "Cargo Que Deve Permanecer");
  } finally {
    await cleanupUser(user.id);
  }
});

test("remove(): retry (chamar remove() de novo pro MESMO Resume já apagado) falha limpo, não reabre nem reprocessa a limpeza", async () => {
  const user = await createUser();
  try {
    const { masterPromotion, resumesService } = buildServices();
    const { resume } = await setupActiveMaster(
      user.id,
      masterPromotion,
      "Master Retry",
      "Cargo Retry",
    );

    await resumesService.remove(user.id, resume.id);
    const profileAfterFirst = await prisma.talentProfile.findUniqueOrThrow({
      where: { userId: user.id },
    });
    assert.equal(profileAfterFirst.currentTitle, null);

    await assert.rejects(
      () => resumesService.remove(user.id, resume.id),
      (err: unknown) => err instanceof Error && /not found/i.test(err.message),
      "retry sobre um Resume já apagado precisa falhar explicitamente (NotFoundException), nunca reprocessar a limpeza silenciosamente",
    );

    const profileAfterRetry = await prisma.talentProfile.findUniqueOrThrow({
      where: { userId: user.id },
    });
    assert.equal(
      profileAfterRetry.currentTitle,
      null,
      "estado precisa continuar exatamente como o primeiro remove() deixou",
    );
  } finally {
    await cleanupUser(user.id);
  }
});

test("remove(): exclusão do Master DEPOIS de um claim real (guest -> conta) limpa currentTitle no TalentProfile do USUÁRIO", async () => {
  let userId: string | undefined;
  let guestSubjectId: string | undefined;
  try {
    const userProfileSync = new CvUserProfileSyncService(
      new ProfileCanonicalMergeService(),
      new ProfileReadinessService(),
    );
    const masterPromotion = new CvMasterPromotionService(database, userProfileSync);
    const claimService = new ClaimSourceGrantService(database, masterPromotion);
    const resumesService = new ResumesService(
      database,
      new FakeStorage() as never,
      undefined,
      undefined,
      masterPromotion,
      new UserRadarProfileService(database),
    );

    const guestSubject = await prisma.talentSubject.create({ data: {} });
    guestSubjectId = guestSubject.id;
    const guestCvSource = await prisma.cvSource.create({
      data: {
        ownerType: "GUEST",
        talentSubjectId: guestSubject.id,
        textStorageKey: `inline:${randomUUID()}`,
        textSha256: createHash("sha256").update(randomUUID()).digest("hex"),
      },
    });
    const guestSubmission = await prisma.cvSubmission.create({
      data: { cvSourceId: guestCvSource.id, origin: "PASTED_TEXT" },
    });
    const guestStructuredProfile = await prisma.cvStructuredProfile.create({
      data: {
        cvSourceId: guestCvSource.id,
        extractorVersion: "v1",
        schemaVersion: "v1",
        status: "READY",
        canonicalJson: minimalCanonicalProfile("Guest Reivindicado", "Cargo Reivindicado"),
        finishedAt: new Date(),
      },
    });
    const guestCvProcessingJob = await prisma.cvProcessingJob.create({
      data: {
        cvSourceId: guestCvSource.id,
        cvSubmissionId: guestSubmission.id,
        status: "READY",
        cvStructuredProfileId: guestStructuredProfile.id,
      },
    });
    // CvTalentCaptureService#capture sempre roda antes da promoção no
    // pipeline real — garante o TalentProfile do guest já existindo, com
    // TalentProfileSource ligada a este CvSource (senão
    // ClaimSourceGrantService#resolveSubject não encontra nada pra
    // reivindicar e pula a resolução de sujeito inteira).
    const guestTalentProfile = await prisma.talentProfile.upsert({
      where: { talentSubjectId: guestSubject.id },
      create: { talentSubjectId: guestSubject.id },
      update: {},
    });
    await prisma.talentProfileSource.create({
      data: { talentProfileId: guestTalentProfile.id, cvSourceId: guestCvSource.id },
    });
    // Guest's próprio Master provisório — mesmo caminho real
    // (CvProcessingWorker chamaria promoteAndProject com masterIntent
    // PROMOTE_IF_FIRST logo após a extração).
    await masterPromotion.promoteAndProject({
      ownerType: "GUEST",
      talentSubjectId: guestSubject.id,
      cvStructuredProfileId: guestStructuredProfile.id,
      masterIntent: "PROMOTE_IF_FIRST",
      promotedReason: "FIRST_EVER",
      canonicalProfile: guestStructuredProfile.canonicalJson as never,
      cvSourceId: guestCvSource.id,
    });

    const user = await createUser();
    userId = user.id;
    const claimResult = await claimService.claim({
      userId: user.id,
      analysisJobId: `seed-analysis-job-${randomUUID()}`,
      cvProcessingJobId: guestCvProcessingJob.id,
    });
    assert.ok(claimResult.master?.promoted, "claim precisa ter promovido o CV reivindicado a Master do usuário");
    const claimedResumeId = claimResult.master.resumeId as string;

    const profileAfterClaim = await prisma.talentProfile.findUniqueOrThrow({
      where: { userId: user.id },
    });
    assert.equal(profileAfterClaim.currentTitle, "Cargo Reivindicado");

    await resumesService.remove(user.id, claimedResumeId);

    const profileAfterRemove = await prisma.talentProfile.findUniqueOrThrow({
      where: { userId: user.id },
    });
    assert.equal(
      profileAfterRemove.currentTitle,
      null,
      "excluir o Master reivindicado via claim precisa limpar currentTitle igual a qualquer outro Master",
    );
  } finally {
    if (userId) await cleanupUser(userId, { talentSubjectId: guestSubjectId });
  }
});

// Exclusão do Master de um GUEST puro (nunca reivindicado): não existe
// hoje nenhum endpoint/fluxo do produto que apague um Resume de guest —
// guests não têm linha em Resume antes de um claim (ResumesService#remove
// exige userId autenticado). CvMasterDesignation de guest só é
// supersedida por uma promoção posterior (substituição), nunca por uma
// "exclusão sem substituto" equivalente à de resumes.service.ts#remove.
// Documentado aqui como NÃO COBERTO por ausência de fluxo no produto,
// conforme instrução explícita da 4ª rodada ("se esse fluxo existir").
