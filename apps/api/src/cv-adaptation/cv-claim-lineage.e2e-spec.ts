// Testes permanentes — seção 4 da 2ª rodada da auditoria adversarial
// (2026-09-08). Exercita o ClaimSourceGrantService REAL (nunca mockado),
// através do fluxo real service.claimGuestAnalysisJob -> claim(). Nunca
// assume idempotência/preservação de proveniência por leitura de código —
// só por execução real contra Postgres.
process.env.CV_STRUCTURED_PROFILE_PIPELINE_ENABLED = "true";
process.env.SKIP_AI = "false";

import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { test } from "node:test";

import type { MasterCvCanonicalExtractionOutput } from "../master-cv-canonical-extraction/master-cv-canonical-extraction.types";
import {
  buildAnalysisWorker,
  buildCapturingAiClient,
  buildEntrypoint,
  buildProcessingWorker,
  buildRealCvAdaptationService,
  claimSourceGrantService,
  database,
  JOB_DESCRIPTION_BASE,
  minimalAnalysisJson,
  minimalGenerationJson,
  prisma,
  processOneAnalysisJob,
  processOneCvJob,
  FakeStorage,
} from "./test-support/canonical-pipeline-test-services";
import { makeRunId } from "./test-support/canonical-pipeline-test-harness";

void claimSourceGrantService; // usado indiretamente via buildRealCvAdaptationService

function fakeOutput(runId: string, marker: string): MasterCvCanonicalExtractionOutput {
  return {
    canonicalProfile: {
      fullName: null,
      headline: null,
      email: null,
      phone: null,
      linkedinUrl: null,
      location: { city: null, state: null, country: null },
      professionalSummary: `${runId} ${marker}`,
      experiences: [],
      education: [
        {
          institution: `${runId} Instituto ${marker}`,
          degree: "Bacharelado",
          fieldOfStudy: "X",
          startDate: "2018",
          endDate: "2020",
        },
      ],
      skills: [`${runId}-skill-${marker}`],
      languages: [],
      certifications: [],
    },
    extractionCoverage: { identifiedFields: [], missingFields: [], fieldStatus: {} },
    confidence: {},
    evidence: {},
  };
}

type Harness = {
  service: ReturnType<typeof buildRealCvAdaptationService>;
  analysisWorker: ReturnType<typeof buildAnalysisWorker>;
  cvWorker: ReturnType<typeof buildProcessingWorker>;
  extractCalls: { count: number };
};

function buildHarness(runId: string, marker = "a"): Harness {
  const storage = new FakeStorage();
  const extractCalls = { count: 0 };
  const cvWorker = buildProcessingWorker(async () => {
    extractCalls.count += 1;
    return fakeOutput(runId, marker);
  }, storage);
  const entrypoint = buildEntrypoint(storage);
  const { client } = buildCapturingAiClient(minimalAnalysisJson, minimalGenerationJson);
  const service = buildRealCvAdaptationService(client, client, entrypoint, storage);
  const analysisWorker = buildAnalysisWorker(service);
  return { service, analysisWorker, cvWorker, extractCalls };
}

async function startAndProcessGuestJob(
  h: Harness,
  runId: string,
  sessionPublicToken: string,
  cvTextSuffix: string,
) {
  const started = await h.service.startGuestAnalysisJob(
    `${JOB_DESCRIPTION_BASE} ${runId}`,
    undefined,
    `${runId} resumo\nExperiência\n${runId} texto suficiente com múltiplas linhas relevantes ${cvTextSuffix}.`,
    undefined,
    { sessionPublicToken } as never,
  );
  const row = await database.analysisJob.findUniqueOrThrow({ where: { id: started.jobId } });
  if (!row.cvProcessingJobId) {
    throw new Error("guest allowlisted deveria ter entrado no pipeline novo");
  }
  const cvJobRow = await processOneCvJob(h.cvWorker, row.cvProcessingJobId);
  await processOneAnalysisJob(h.analysisWorker, started.jobId);
  return { started, cvJobRow };
}

async function withGuestAllowlist<T>(
  sessionPublicTokens: string[],
  fn: () => Promise<T>,
): Promise<T> {
  const hashes = sessionPublicTokens.map((t) =>
    createHash("sha256").update(t).digest("hex"),
  );
  const previous =
    process.env.CV_STRUCTURED_PROFILE_PIPELINE_ALLOWLIST_GUEST_SESSION_HASHES;
  process.env.CV_STRUCTURED_PROFILE_PIPELINE_ALLOWLIST_GUEST_SESSION_HASHES =
    hashes.join(",");
  try {
    return await fn();
  } finally {
    process.env.CV_STRUCTURED_PROFILE_PIPELINE_ALLOWLIST_GUEST_SESSION_HASHES =
      previous;
  }
}

async function makeRealUser(runId: string): Promise<string> {
  const user = await database.user.create({
    data: {
      email: `${runId}-${randomUUID()}@example.com`,
      passwordHash: "x",
      name: `${runId} user`,
    },
  });
  return user.id;
}

async function cleanupClaimRun(
  runId: string,
  cvSourceIds: string[],
  userId?: string,
): Promise<void> {
  await database.analysisJob.deleteMany({
    where: { jobDescriptionText: { contains: runId } },
  });
  const talentSubjectIds = new Set<string>();
  for (const id of cvSourceIds) {
    const source = await database.cvSource.findUnique({
      where: { id },
      select: { talentSubjectId: true },
    });
    if (source?.talentSubjectId) talentSubjectIds.add(source.talentSubjectId);
  }
  if (userId) {
    await prisma.cvMasterDesignation.deleteMany({ where: { userId } });
  }
  if (talentSubjectIds.size > 0) {
    await prisma.cvMasterDesignation.deleteMany({
      where: { talentSubjectId: { in: [...talentSubjectIds] } },
    });
  }
  await database.resume.deleteMany({
    where: { cvSourceId: { in: cvSourceIds } },
  });
  if (userId) {
    await database.talentProfile.deleteMany({ where: { userId } });
  }
  if (talentSubjectIds.size > 0) {
    await prisma.talentProfile.deleteMany({
      where: { talentSubjectId: { in: [...talentSubjectIds] } },
    });
  }
  await database.cvSource.deleteMany({ where: { id: { in: cvSourceIds } } });
  if (talentSubjectIds.size > 0) {
    await prisma.talentSubject.deleteMany({
      where: { id: { in: [...talentSubjectIds] } },
    });
  }
  if (userId) {
    await database.user.deleteMany({ where: { id: userId } }).catch(() => undefined);
  }
}

test("CLAIM 1: claim completo — primeiro CV do guest, usuário sem Master prévio → CLAIM_FULL, TalentProfile reatribuído, Master promovido", async () => {
  const runId = makeRunId("claim-1");
  const session = `${runId}-session`;
  const h = buildHarness(runId);
  let cvSourceId: string | undefined;
  let userId: string | undefined;
  try {
    const { cvJobRow, started } = await withGuestAllowlist([session], () =>
      startAndProcessGuestJob(h, runId, session, "v1"),
    );
    cvSourceId = cvJobRow.cvSourceId;
    userId = await makeRealUser(runId);

    const result = await h.service.claimGuestAnalysisJob(
      userId,
      started.jobId,
      started.guestPossessionToken,
      { sessionPublicToken: session } as never,
    );
    assert.equal(result.status, "succeeded");

    const source = await database.cvSource.findUniqueOrThrow({ where: { id: cvSourceId } });
    const talentSubjectId = source.talentSubjectId as string;

    const talentProfile = await prisma.talentProfile.findUniqueOrThrow({
      where: { userId },
    });
    assert.equal(
      talentProfile.talentSubjectId,
      null,
      "CLAIM_FULL: TalentProfile reatribuído — talentSubjectId zerado, agora userId-owned",
    );

    const subject = await prisma.talentSubject.findUniqueOrThrow({
      where: { id: talentSubjectId },
    });
    assert.equal(subject.mergedIntoUserId, userId);
    assert.equal(subject.mergedIntoTalentProfileId, talentProfile.id);

    const grant = await prisma.claimSourceGrant.findUnique({
      where: { cvSourceId_userId: { cvSourceId, userId } },
    });
    assert.ok(grant, "ClaimSourceGrant precisa existir após o claim");

    // CvSource NUNCA muda de dono — só o grant formaliza acesso.
    assert.equal(source.ownerType, "GUEST");
    assert.equal(source.userId, null);

    const masterDesignation = await prisma.cvMasterDesignation.findFirst({
      where: { userId, supersededAt: null },
    });
    assert.ok(masterDesignation, "primeiro Master do usuário precisa ter sido promovido pelo claim");
  } finally {
    if (cvSourceId) await cleanupClaimRun(runId, [cvSourceId], userId);
  }
});

test("CLAIM 2: claim idempotente — chamar claimGuestAnalysisJob duas vezes não duplica grant nem re-extrai", async () => {
  const runId = makeRunId("claim-2");
  const session = `${runId}-session`;
  const h = buildHarness(runId);
  let cvSourceId: string | undefined;
  let userId: string | undefined;
  try {
    const { cvJobRow, started } = await withGuestAllowlist([session], () =>
      startAndProcessGuestJob(h, runId, session, "v1"),
    );
    cvSourceId = cvJobRow.cvSourceId;
    userId = await makeRealUser(runId);

    const extractCallsBeforeClaim = h.extractCalls.count;

    const first = await h.service.claimGuestAnalysisJob(
      userId,
      started.jobId,
      started.guestPossessionToken,
      { sessionPublicToken: session } as never,
    );
    assert.equal(first.status, "succeeded");

    const second = await h.service.claimGuestAnalysisJob(
      userId,
      started.jobId,
      started.guestPossessionToken,
      { sessionPublicToken: session } as never,
    );
    assert.equal(second.status, "succeeded");
    assert.equal(
      "cvAdaptationId" in first && "cvAdaptationId" in second
        ? first.cvAdaptationId === second.cvAdaptationId
        : false,
      true,
      "segunda chamada precisa devolver o MESMO CvAdaptation, nunca criar outro",
    );

    const grants = await prisma.claimSourceGrant.findMany({
      where: { cvSourceId, userId },
    });
    assert.equal(grants.length, 1, "nunca duplicar ClaimSourceGrant em claim repetido");

    const mergeEvents = await prisma.talentSubjectMergeEvent.count({
      where: { triggeringAnalysisJobId: started.jobId },
    });
    assert.equal(mergeEvents, 1, "resolução de sujeito não pode duplicar evento em claim repetido");

    assert.equal(
      h.extractCalls.count,
      extractCallsBeforeClaim,
      "claim() é operação só de banco — nunca chama o extrator de IA de novo",
    );
  } finally {
    if (cvSourceId) await cleanupClaimRun(runId, [cvSourceId], userId);
  }
});

test("CLAIM 3: claim parcial — usuário reivindica só UM dos dois CVs da mesma sessão guest → CLAIM_PARTIAL_COPY, perfil do guest intacto", async () => {
  const runId = makeRunId("claim-3");
  const session = `${runId}-session`;
  const h = buildHarness(runId);
  let cvSourceId1: string | undefined;
  let cvSourceId2: string | undefined;
  let userId: string | undefined;
  try {
    const { cvJobRow: job1, started: started1 } = await withGuestAllowlist(
      [session],
      () => startAndProcessGuestJob(h, runId, session, "v1"),
    );
    cvSourceId1 = job1.cvSourceId;
    const { cvJobRow: job2, started: started2 } = await withGuestAllowlist(
      [session],
      () => startAndProcessGuestJob(h, runId, session, "v2-conteudo-diferente-o-suficiente"),
    );
    cvSourceId2 = job2.cvSourceId;

    const source1 = await database.cvSource.findUniqueOrThrow({ where: { id: cvSourceId1 } });
    const source2 = await database.cvSource.findUniqueOrThrow({ where: { id: cvSourceId2 } });
    assert.equal(
      source1.talentSubjectId,
      source2.talentSubjectId,
      "mesma sessão guest precisa consolidar no MESMO TalentSubject",
    );
    const talentSubjectId = source1.talentSubjectId as string;
    const guestProfile = await prisma.talentProfile.findUniqueOrThrow({
      where: { talentSubjectId },
    });
    const profileSourcesBefore = await prisma.talentProfileSource.count({
      where: { talentProfileId: guestProfile.id },
    });
    assert.equal(profileSourcesBefore, 2, "os dois CVs precisam ter alimentado o mesmo TalentProfile do guest");

    userId = await makeRealUser(runId);
    const result = await h.service.claimGuestAnalysisJob(
      userId,
      started1.jobId,
      started1.guestPossessionToken,
      { sessionPublicToken: session } as never,
    );
    assert.equal(result.status, "succeeded");

    const event = await prisma.talentSubjectMergeEvent.findFirstOrThrow({
      where: { triggeringAnalysisJobId: started1.jobId },
    });
    assert.equal(event.reason, "CLAIM_PARTIAL_COPY");

    // Perfil do guest continua intacto — nunca reatribuído, nunca perde a
    // segunda fonte não reivindicada.
    const guestProfileAfter = await prisma.talentProfile.findUniqueOrThrow({
      where: { id: guestProfile.id },
    });
    assert.equal(guestProfileAfter.talentSubjectId, talentSubjectId);
    assert.equal(guestProfileAfter.userId, null);
    const profileSourcesAfter = await prisma.talentProfileSource.count({
      where: { talentProfileId: guestProfile.id },
    });
    assert.equal(profileSourcesAfter, 2, "claim parcial não remove nenhuma fonte do perfil do guest");

    // Perfil do usuário só recebeu as observações da fonte reivindicada
    // (cvSourceId1), nunca as da fonte 2 (não reivindicada).
    const userProfile = await prisma.talentProfile.findUniqueOrThrow({ where: { userId } });
    const userEduObs = await prisma.talentEducationObservation.findMany({
      where: { talentProfileId: userProfile.id },
    });
    assert.equal(userEduObs.length, 1, "só a formação da fonte 1 (reivindicada) foi copiada");
    assert.ok(userEduObs[0].institutionRaw.includes("Instituto a"));

    // Ainda não reivindicou a segunda fonte: sem grant pra ela.
    const grant2 = await prisma.claimSourceGrant.findUnique({
      where: { cvSourceId_userId: { cvSourceId: cvSourceId2, userId } },
    });
    assert.equal(grant2, null);

    // Reivindicando a segunda fonte agora: completa o merge (CLAIM_FULL
    // desta segunda chamada), guest profile finalmente reatribuído.
    const result2 = await h.service.claimGuestAnalysisJob(
      userId,
      started2.jobId,
      started2.guestPossessionToken,
      { sessionPublicToken: session } as never,
    );
    assert.equal(result2.status, "succeeded");
    const event2 = await prisma.talentSubjectMergeEvent.findFirstOrThrow({
      where: { triggeringAnalysisJobId: started2.jobId },
    });
    assert.equal(event2.reason, "CLAIM_FULL");
  } finally {
    if (cvSourceId1 && cvSourceId2) {
      await cleanupClaimRun(runId, [cvSourceId1, cvSourceId2], userId);
    }
  }
});

test("CLAIM 4: colisão de hash — usuário já tem CV próprio com texto idêntico ao do guest → equivalência registrada, CvSource do guest NUNCA reatribuído", async () => {
  const runId = makeRunId("claim-4");
  const session = `${runId}-session`;
  const h = buildHarness(runId);
  let cvSourceId: string | undefined;
  let userId: string | undefined;
  let ownSourceId: string | undefined;
  try {
    const { cvJobRow, started } = await withGuestAllowlist([session], () =>
      startAndProcessGuestJob(h, runId, session, "v1"),
    );
    cvSourceId = cvJobRow.cvSourceId;
    const guestSource = await database.cvSource.findUniqueOrThrow({ where: { id: cvSourceId } });

    userId = await makeRealUser(runId);
    // Usuário já possui, ANTES do claim, um CvSource próprio com o MESMO
    // textSha256 do guest (mesmo texto exato) — força a colisão real de
    // hash prevista na seção 4.3.
    const ownSource = await database.cvSource.create({
      data: {
        ownerType: "USER",
        userId,
        textStorageKey: `cv-processing/users/${userId}/${guestSource.textSha256}.txt`,
        textSha256: guestSource.textSha256,
      },
    });
    ownSourceId = ownSource.id;

    const result = await h.service.claimGuestAnalysisJob(
      userId,
      started.jobId,
      started.guestPossessionToken,
      { sessionPublicToken: session } as never,
    );
    assert.equal(result.status, "succeeded");

    const equivalence = await prisma.cvSourceEquivalence.findUniqueOrThrow({
      where: {
        primaryCvSourceId_equivalentCvSourceId: {
          primaryCvSourceId: ownSource.id,
          equivalentCvSourceId: cvSourceId,
        },
      },
    });
    assert.ok(equivalence);

    // O CvSource do guest nunca é reapontado — dono e conteúdo continuam
    // exatamente como estavam.
    const guestSourceAfter = await database.cvSource.findUniqueOrThrow({
      where: { id: cvSourceId },
    });
    assert.equal(guestSourceAfter.ownerType, "GUEST");
    assert.equal(guestSourceAfter.userId, null);

    // Resume criado pelo claim aponta pra fonte PRÓPRIA do usuário
    // (ownSource), nunca pra fonte do guest.
    const resume = await database.resume.findFirstOrThrow({ where: { userId } });
    assert.equal(resume.cvSourceId, ownSource.id);
  } finally {
    if (cvSourceId) {
      // Ordem estrita: CvMasterDesignation (userId, talentSubjectId E
      // qualquer uma que referencie o CvStructuredProfile da fonte
      // própria) antes de Resume, antes de CvSource — a promoção do
      // claim pode ter criado uma designação nova apontando pro
      // ownSource, que bloqueia a exclusão do Resume/CvSource dele até
      // ser removida primeiro.
      if (userId) {
        await prisma.cvMasterDesignation.deleteMany({ where: { userId } });
      }
      if (ownSourceId) {
        await prisma.cvMasterDesignation.deleteMany({
          where: {
            cvStructuredProfile: { cvSourceId: { in: [ownSourceId, cvSourceId] } },
          },
        });
      }
      if (userId) {
        await database.resume.deleteMany({ where: { userId } });
      }
      await cleanupClaimRun(runId, [cvSourceId], userId);
      if (ownSourceId) {
        await database.cvSource.deleteMany({ where: { id: ownSourceId } }).catch(() => undefined);
      }
      if (userId) await database.user.deleteMany({ where: { id: userId } }).catch(() => undefined);
    }
  }
});

test("CLAIM 5: usuário já tem Master ativo de OUTRA fonte — claim preserva grant mas NÃO ativa a designação do guest", async () => {
  const runId = makeRunId("claim-5");
  const session = `${runId}-session`;
  const h = buildHarness(runId);
  let cvSourceId: string | undefined;
  let userId: string | undefined;
  try {
    userId = await makeRealUser(runId);

    // Usuário já tem seu próprio Master, de uma fonte totalmente separada,
    // ANTES de reivindicar qualquer coisa do guest.
    const ownSource = await database.cvSource.create({
      data: {
        ownerType: "USER",
        userId,
        textStorageKey: `cv-processing/users/${userId}/${randomUUID()}.txt`,
        textSha256: createHash("sha256").update(`${runId}-own-master`).digest("hex"),
      },
    });
    const ownStructuredProfile = await database.cvStructuredProfile.create({
      data: {
        cvSourceId: ownSource.id,
        extractorVersion: "v1",
        schemaVersion: "v1",
        status: "READY",
        canonicalJson: fakeOutput(runId, "own-master").canonicalProfile as never,
      },
    });
    const ownResume = await database.resume.create({
      data: {
        userId,
        title: "Master original",
        isMaster: true,
        cvSourceId: ownSource.id,
      },
    });
    await prisma.cvMasterDesignation.create({
      data: {
        ownerType: "USER",
        userId,
        cvStructuredProfileId: ownStructuredProfile.id,
        resumeId: ownResume.id,
        promotedReason: "FIRST_EVER",
      },
    });

    const { cvJobRow, started } = await withGuestAllowlist([session], () =>
      startAndProcessGuestJob(h, runId, session, "v1"),
    );
    cvSourceId = cvJobRow.cvSourceId;
    const guestSource = await database.cvSource.findUniqueOrThrow({ where: { id: cvSourceId } });
    const guestDesignationBefore = await prisma.cvMasterDesignation.findFirst({
      where: { talentSubjectId: guestSource.talentSubjectId as string, supersededAt: null },
    });
    assert.ok(guestDesignationBefore, "guest precisa ter sua própria designação provisória (primeiro CV do guest)");

    const result = await h.service.claimGuestAnalysisJob(
      userId,
      started.jobId,
      started.guestPossessionToken,
      { sessionPublicToken: session } as never,
    );
    assert.equal(result.status, "succeeded");

    const grant = await prisma.claimSourceGrant.findUnique({
      where: { cvSourceId_userId: { cvSourceId, userId } },
    });
    assert.ok(grant, "grant precisa existir mesmo sem ativar Master");

    // Designação do guest continua intacta, nunca superseded.
    const guestDesignationAfter = await prisma.cvMasterDesignation.findUniqueOrThrow({
      where: { id: guestDesignationBefore.id },
    });
    assert.equal(guestDesignationAfter.supersededAt, null);

    // O Master ATIVO do usuário continua sendo o original, não o do guest.
    const userActiveDesignation = await prisma.cvMasterDesignation.findFirstOrThrow({
      where: { userId, supersededAt: null },
    });
    assert.equal(userActiveDesignation.cvStructuredProfileId, ownStructuredProfile.id);
  } finally {
    if (cvSourceId && userId) {
      await prisma.cvMasterDesignation.deleteMany({ where: { userId } });
      await database.resume.deleteMany({ where: { userId } });
      await cleanupClaimRun(runId, [cvSourceId], userId);
      await database.cvSource.deleteMany({ where: { userId } });
    }
  }
});
