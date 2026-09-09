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

function fakeOutput(
  runId: string,
  marker: string,
): MasterCvCanonicalExtractionOutput {
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
    extractionCoverage: {
      identifiedFields: [],
      missingFields: [],
      fieldStatus: {},
    },
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
  const { client } = buildCapturingAiClient(
    minimalAnalysisJson,
    minimalGenerationJson,
  );
  const service = buildRealCvAdaptationService(
    client,
    client,
    entrypoint,
    storage,
  );
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
  const row = await database.analysisJob.findUniqueOrThrow({
    where: { id: started.jobId },
  });
  if (!row.cvProcessingJobId) {
    throw new Error("guest allowlisted deveria ter entrado no pipeline novo");
  }
  const cvJobRow = await processOneCvJob(h.cvWorker, row.cvProcessingJobId);
  await processOneAnalysisJob(h.analysisWorker, started.jobId);
  return { started, cvJobRow };
}

// Não existe mais allowlist dedicada de guest — CV_STRUCTURED_PROFILE_PIPELINE_ENABLED
// (setado no topo do arquivo) já liga o pipeline novo pra guest pelo mesmo
// master switch do usuário autenticado. Mantido como pass-through para não
// mexer nos 6 call sites abaixo.
async function withGuestAllowlist<T>(
  _sessionPublicTokens: string[],
  fn: () => Promise<T>,
): Promise<T> {
  return fn();
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
  // CvUnlock/CvAdaptation ANTES do Resume: o Resume "adaptado" tem
  // basedOnResumeId apontando pro master (onDelete: SetNull) — apagar o
  // master primeiro deixaria o adaptado sem templateId/targetJob NEM
  // basedOnResumeId, violando o check constraint
  // Resume_adapted_requires_context_check.
  if (userId) {
    await database.cvUnlock.deleteMany({ where: { userId } });
    await database.cvAdaptation.deleteMany({ where: { userId } });
    // O Resume "adaptado" físico sobrevive à exclusão do CvAdaptation (não
    // há cascade dele pro Resume) — apagar ANTES do master evita que o
    // onDelete: SetNull do basedOnResumeId deixe o adaptado sem
    // templateId/targetJob NEM basedOnResumeId (violaria
    // Resume_adapted_requires_context_check).
    await database.resume.deleteMany({ where: { userId, kind: "adapted" } });
  }
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
    await database.user
      .deleteMany({ where: { id: userId } })
      .catch(() => undefined);
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

    const source = await database.cvSource.findUniqueOrThrow({
      where: { id: cvSourceId },
    });
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
    assert.ok(
      masterDesignation,
      "primeiro Master do usuário precisa ter sido promovido pelo claim",
    );
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
    assert.equal(
      grants.length,
      1,
      "nunca duplicar ClaimSourceGrant em claim repetido",
    );

    const mergeEvents = await prisma.talentSubjectMergeEvent.count({
      where: { triggeringAnalysisJobId: started.jobId },
    });
    assert.equal(
      mergeEvents,
      1,
      "resolução de sujeito não pode duplicar evento em claim repetido",
    );

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
      () =>
        startAndProcessGuestJob(
          h,
          runId,
          session,
          "v2-conteudo-diferente-o-suficiente",
        ),
    );
    cvSourceId2 = job2.cvSourceId;

    const source1 = await database.cvSource.findUniqueOrThrow({
      where: { id: cvSourceId1 },
    });
    const source2 = await database.cvSource.findUniqueOrThrow({
      where: { id: cvSourceId2 },
    });
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
    assert.equal(
      profileSourcesBefore,
      2,
      "os dois CVs precisam ter alimentado o mesmo TalentProfile do guest",
    );

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
    assert.equal(
      profileSourcesAfter,
      2,
      "claim parcial não remove nenhuma fonte do perfil do guest",
    );

    // Perfil do usuário só recebeu as observações da fonte reivindicada
    // (cvSourceId1), nunca as da fonte 2 (não reivindicada).
    const userProfile = await prisma.talentProfile.findUniqueOrThrow({
      where: { userId },
    });
    const userEduObs = await prisma.talentEducationObservation.findMany({
      where: { talentProfileId: userProfile.id },
    });
    assert.equal(
      userEduObs.length,
      1,
      "só a formação da fonte 1 (reivindicada) foi copiada",
    );
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
    const guestSource = await database.cvSource.findUniqueOrThrow({
      where: { id: cvSourceId },
    });

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
    const resume = await database.resume.findFirstOrThrow({
      where: { userId },
    });
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
            cvStructuredProfile: {
              cvSourceId: { in: [ownSourceId, cvSourceId] },
            },
          },
        });
      }
      if (userId) {
        await database.resume.deleteMany({ where: { userId } });
      }
      await cleanupClaimRun(runId, [cvSourceId], userId);
      if (ownSourceId) {
        await database.cvSource
          .deleteMany({ where: { id: ownSourceId } })
          .catch(() => undefined);
      }
      if (userId)
        await database.user
          .deleteMany({ where: { id: userId } })
          .catch(() => undefined);
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
        textSha256: createHash("sha256")
          .update(`${runId}-own-master`)
          .digest("hex"),
      },
    });
    const ownStructuredProfile = await database.cvStructuredProfile.create({
      data: {
        cvSourceId: ownSource.id,
        extractorVersion: "v1",
        schemaVersion: "v1",
        status: "READY",
        canonicalJson: fakeOutput(runId, "own-master")
          .canonicalProfile as never,
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
    const guestSource = await database.cvSource.findUniqueOrThrow({
      where: { id: cvSourceId },
    });
    const guestDesignationBefore = await prisma.cvMasterDesignation.findFirst({
      where: {
        talentSubjectId: guestSource.talentSubjectId as string,
        supersededAt: null,
      },
    });
    assert.ok(
      guestDesignationBefore,
      "guest precisa ter sua própria designação provisória (primeiro CV do guest)",
    );

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
    const guestDesignationAfter =
      await prisma.cvMasterDesignation.findUniqueOrThrow({
        where: { id: guestDesignationBefore.id },
      });
    assert.equal(guestDesignationAfter.supersededAt, null);

    // O Master ATIVO do usuário continua sendo o original, não o do guest.
    const userActiveDesignation =
      await prisma.cvMasterDesignation.findFirstOrThrow({
        where: { userId, supersededAt: null },
      });
    assert.equal(
      userActiveDesignation.cvStructuredProfileId,
      ownStructuredProfile.id,
    );
  } finally {
    if (cvSourceId && userId) {
      await prisma.cvMasterDesignation.deleteMany({ where: { userId } });
      await database.resume.deleteMany({ where: { userId } });
      await cleanupClaimRun(runId, [cvSourceId], userId);
      await database.cvSource.deleteMany({ where: { userId } });
    }
  }
});

// Achado real de auditoria de claim (2026-09-09): claimGuest() (o caminho
// "Liberar CV com 1 crédito", diferente de claimGuestAnalysisJob) tinha o
// MESMO defeito — nunca perguntava se a análise reivindicada já tinha
// linhagem canônica, então sempre criava um CvSource/CvStructuredProfile
// NOVO a partir de masterCvText (texto re-renderizado) e reextraía pela
// IA. Os dois testes abaixo cobrem a correção: reusa a fonte quando ela
// existe, preserva o comportamento antigo quando não existe (legado real).
test("CLAIM-GUEST 1: análise com linhagem canônica → claimGuest() reutiliza CvSource/CvStructuredProfile, zero nova extração", async () => {
  const runId = makeRunId("claim-guest-1");
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
    await database.user.update({
      where: { id: userId },
      data: { creditsRemaining: 5 },
    });

    const job = await database.analysisJob.findUniqueOrThrow({
      where: { id: started.jobId },
    });
    if (!job.analysisCvSnapshotId) {
      throw new Error("análise guest deveria ter gerado um snapshot");
    }

    const extractCallsBeforeClaim = h.extractCalls.count;

    const adaptation = await h.service.claimGuest(
      userId,
      {
        adaptedContentJson: (job.adaptedContentJson ?? {}) as Record<
          string,
          unknown
        >,
        previewText: job.previewText ?? undefined,
        jobDescriptionText: job.jobDescriptionText,
        masterCvText: job.masterCvText ?? "",
        analysisCvSnapshotId: job.analysisCvSnapshotId,
        jobTitle: job.jobTitle ?? undefined,
        companyName: job.companyName ?? undefined,
        guestSessionPublicToken: session,
      },
      { sessionPublicToken: session } as never,
    );

    assert.equal(
      h.extractCalls.count,
      extractCallsBeforeClaim,
      "claimGuest() nunca deve chamar o extrator de IA de novo quando a análise já tem linhagem canônica",
    );

    const masterResume = await database.resume.findUniqueOrThrow({
      where: { id: adaptation.masterResumeId as string },
    });
    assert.equal(
      masterResume.cvSourceId,
      cvSourceId,
      "o Resume do usuário precisa apontar pro MESMO CvSource do guest — nunca um novo",
    );

    const source = await database.cvSource.findUniqueOrThrow({
      where: { id: cvSourceId },
    });
    assert.equal(
      source.ownerType,
      "GUEST",
      "CvSource nunca muda de dono — claimGuest() só formaliza acesso via grant",
    );

    const grant = await prisma.claimSourceGrant.findUnique({
      where: { cvSourceId_userId: { cvSourceId, userId } },
    });
    assert.ok(grant, "ClaimSourceGrant precisa existir após claimGuest()");

    const userDesignation = await prisma.cvMasterDesignation.findFirstOrThrow({
      where: { userId, supersededAt: null },
    });
    assert.equal(userDesignation.promotedReason, "CLAIM_PROMOTION");
    assert.equal(
      userDesignation.cvStructuredProfileId,
      cvJobRow.cvStructuredProfileId,
      "designação do usuário precisa apontar pro MESMO CvStructuredProfile do guest",
    );

    const guestDesignation = await prisma.cvMasterDesignation.findFirstOrThrow({
      where: { talentSubjectId: source.talentSubjectId as string },
    });
    assert.notEqual(
      guestDesignation.supersededAt,
      null,
      "designação guest precisa ser encerrada pelo mesmo claim",
    );

    const activeCount = await prisma.cvMasterDesignation.count({
      where: {
        cvStructuredProfileId: cvJobRow.cvStructuredProfileId as string,
        supersededAt: null,
      },
    });
    assert.equal(
      activeCount,
      1,
      "exatamente uma designação ativa para este perfil estruturado ao final",
    );
  } finally {
    if (cvSourceId) await cleanupClaimRun(runId, [cvSourceId], userId);
  }
});

test("CLAIM-GUEST 2: análise genuinamente legada (sem cvProcessingJobId) → claimGuest() preserva o comportamento atual", async () => {
  const runId = makeRunId("claim-guest-2");
  const session = `${runId}-session`;
  const h = buildHarness(runId);
  let userId: string | undefined;
  try {
    // Constrói uma AnalysisJob genuinamente legada (cvProcessingJobId
    // null) chamando analyzeGuest() diretamente — mesmo método que o
    // fluxo legado de verdade usa, sem depender do fire-and-forget
    // interno de startGuestAnalysisJob (que não dá pra aguardar
    // deterministicamente num teste sem um poll).
    const legacyResult = await h.service.analyzeGuest(
      `${JOB_DESCRIPTION_BASE} ${runId}`,
      undefined,
      `${runId} resumo\nExperiência\n${runId} texto legado suficiente com múltiplas linhas relevantes v1.`,
      undefined,
      { sessionPublicToken: session } as never,
    );
    const job = await database.analysisJob.create({
      data: {
        ownerKind: "guest",
        status: "succeeded",
        jobDescriptionText: `${JOB_DESCRIPTION_BASE} ${runId}`,
        adaptedContentJson: legacyResult.adaptedContentJson as never,
        previewText: legacyResult.previewText,
        masterCvText: legacyResult.masterCvText,
        analysisCvSnapshotId: legacyResult.analysisCvSnapshotId,
      },
    });
    assert.equal(
      job.cvProcessingJobId,
      null,
      "pré-condição do teste: esta análise precisa ser genuinamente legada",
    );

    userId = await makeRealUser(runId);
    await database.user.update({
      where: { id: userId },
      data: { creditsRemaining: 5 },
    });

    const adaptation = await h.service.claimGuest(
      userId,
      {
        adaptedContentJson: (job.adaptedContentJson ?? {}) as Record<
          string,
          unknown
        >,
        previewText: job.previewText ?? undefined,
        jobDescriptionText: job.jobDescriptionText,
        masterCvText: job.masterCvText ?? "",
        analysisCvSnapshotId: job.analysisCvSnapshotId,
        jobTitle: job.jobTitle ?? undefined,
        companyName: job.companyName ?? undefined,
        guestSessionPublicToken: session,
      },
      { sessionPublicToken: session } as never,
    );

    // Comportamento antigo preservado: sem linhagem canônica pra
    // reivindicar, claimGuest() cria um Resume/CvSource novo pro usuário a
    // partir do masterCvText — exatamente como sempre fez.
    const masterResume = await database.resume.findUniqueOrThrow({
      where: { id: adaptation.masterResumeId as string },
    });
    assert.equal(masterResume.userId, userId);
    assert.equal(masterResume.rawText, job.masterCvText);

    const grant = await prisma.claimSourceGrant.count({ where: { userId } });
    assert.equal(
      grant,
      0,
      "análise legada não tem CvSource pra formalizar grant — nenhum deve ser criado",
    );
  } finally {
    if (userId) {
      await prisma.cvMasterDesignation.deleteMany({ where: { userId } });
      await database.resume.deleteMany({ where: { userId } });
      await cleanupClaimRun(runId, [], userId);
      await database.cvSource.deleteMany({ where: { userId } });
    }
  }
});

// Achado real em teste manual pelo navegador (2026-09-09, gate ligado —
// guest_analysis_auth_gate_enabled=true): claimGuestAnalysisJob transfere
// AnalysisJob.userId do guest pro usuário assim que o cadastro acontece,
// mesmo que a extração/análise canônica ainda esteja pending/processing
// (necessário pra pollAndClaim funcionar enquanto o worker não terminou).
// Se o worker só marca a AnalysisJob "succeeded" DEPOIS dessa
// transferência, a trigger trg_analysis_job_succeeded_requires_ready_profile
// (20260908211500) via ownership check rejeitava o UPDATE — o CvSource
// continuava GUEST-owned e nenhum ClaimSourceGrant existia ainda (só
// criado quando a AnalysisJob já estava succeeded no fluxo antigo). Prova
// aqui que CvAnalysisWorker#ensureClaimBeforeSucceeding fecha esse gap:
// só roda a extração do CV (nunca a análise), transfere ownership com o
// job ainda pending, SÓ DEPOIS roda a análise — precisa terminar succeeded
// sem exceção, com grant/linhagem corretos.
test("CLAIM-RACE 1: ownership transferido ANTES da análise terminar (gate ligado) — worker cria o grant sozinho e marca succeeded sem violar a trigger de linhagem", async () => {
  const runId = makeRunId("claim-race-1");
  const session = `${runId}-session`;
  const h = buildHarness(runId);
  let cvSourceId: string | undefined;
  let userId: string | undefined;
  try {
    const started = await h.service.startGuestAnalysisJob(
      `${JOB_DESCRIPTION_BASE} ${runId}`,
      undefined,
      `${runId} resumo\nExperiência\n${runId} texto suficiente com múltiplas linhas relevantes v1.`,
      undefined,
      { sessionPublicToken: session } as never,
    );
    const row = await database.analysisJob.findUniqueOrThrow({
      where: { id: started.jobId },
    });
    if (!row.cvProcessingJobId) {
      throw new Error("guest deveria ter entrado no pipeline novo");
    }

    // Só a extração do CV — a AnalysisJob continua "pending" de propósito,
    // simulando o worker de análise ainda não ter rodado.
    const cvJobRow = await processOneCvJob(h.cvWorker, row.cvProcessingJobId);
    cvSourceId = cvJobRow.cvSourceId;

    const stillPending = await database.analysisJob.findUniqueOrThrow({
      where: { id: started.jobId },
    });
    assert.equal(
      stillPending.status,
      "pending",
      "pré-condição do teste: a análise em si ainda não pode ter rodado",
    );

    userId = await makeRealUser(runId);

    // Cadastro/claim acontece AGORA, com a análise ainda pending — mesmo
    // padrão do gate ligado (pollAndClaim chama isso assim que autentica).
    const claimResult = await h.service.claimGuestAnalysisJob(
      userId,
      started.jobId,
      started.guestPossessionToken,
      { sessionPublicToken: session } as never,
    );
    assert.equal(
      claimResult.status,
      "pending",
      "claim precisa transferir ownership e devolver o status real, sem esperar a análise terminar",
    );

    const transferred = await database.analysisJob.findUniqueOrThrow({
      where: { id: started.jobId },
    });
    assert.equal(
      transferred.userId,
      userId,
      "ownership precisa ter sido transferida mesmo com a análise ainda pending",
    );

    const sourceBeforeAnalysis = await database.cvSource.findUniqueOrThrow({
      where: { id: cvSourceId },
    });
    assert.equal(
      sourceBeforeAnalysis.ownerType,
      "GUEST",
      "CvSource continua guest-owned nesse ponto — nenhum grant ainda",
    );
    const grantBeforeAnalysis = await prisma.claimSourceGrant.count({
      where: { cvSourceId, userId },
    });
    assert.equal(grantBeforeAnalysis, 0);

    // Só agora a análise canônica roda de verdade — é aqui que o bug
    // real acontecia (worker tentando marcar succeeded sobre um userId
    // sem grant válido sobre o CvSource).
    const finished = await processOneAnalysisJob(
      h.analysisWorker,
      started.jobId,
    );

    assert.equal(
      finished.status,
      "succeeded",
      `análise precisa terminar succeeded, não "${finished.status}" (lastError: ${finished.lastError})`,
    );
    assert.ok(
      finished.cvStructuredProfileId,
      "AnalysisJob succeeded precisa ter cvStructuredProfileId preenchido",
    );

    const grantAfterAnalysis = await prisma.claimSourceGrant.findUnique({
      where: { cvSourceId_userId: { cvSourceId, userId } },
    });
    assert.ok(
      grantAfterAnalysis,
      "ClaimSourceGrant precisa ter sido criado pelo worker antes de marcar succeeded",
    );

    const source = await database.cvSource.findUniqueOrThrow({
      where: { id: cvSourceId },
    });
    assert.equal(
      source.ownerType,
      "GUEST",
      "CvSource nunca muda de dono — mesmo com o grant criado pelo worker",
    );
  } finally {
    if (cvSourceId) await cleanupClaimRun(runId, [cvSourceId], userId);
  }
});

// Achado real REPETINDO o teste manual (2026-09-09, mesmo dia): o fix de
// CLAIM-RACE 1 cobre "claim aconteceu antes do worker sequer começar a
// processar" — mas o bug real observado era mais estreito: o worker já
// tinha lido a AnalysisJob (job.userId ainda null nesse snapshot, guest)
// e estava no MEIO da chamada de IA quando o cadastro/claim aconteceu.
// ensureClaimBeforeSucceeding usava job.userId (o snapshot em memória,
// desatualizado) pra decidir se criava o grant — pulava, e o UPDATE final
// (que sempre vê o valor ATUAL da linha no banco, não o snapshot) caía na
// mesma trigger de linhagem sem grant nenhum. Reproduz aqui interleaving
// manual: claim() chamado ENTRE o worker já ter "claimado" a linha
// (status processing, snapshot com userId null) e o processamento
// terminar — exatamente a janela que o snapshot em memória não vê.
test("CLAIM-RACE 2: claim acontece DURANTE o processamento (não antes) — ensureClaimBeforeSucceeding relê o dono atual, não confia no snapshot em memória", async () => {
  const runId = makeRunId("claim-race-2");
  const session = `${runId}-session`;
  const h = buildHarness(runId);
  let cvSourceId: string | undefined;
  let userId: string | undefined;
  try {
    const started = await h.service.startGuestAnalysisJob(
      `${JOB_DESCRIPTION_BASE} ${runId}`,
      undefined,
      `${runId} resumo\nExperiência\n${runId} texto suficiente com múltiplas linhas relevantes v1.`,
      undefined,
      { sessionPublicToken: session } as never,
    );
    const row = await database.analysisJob.findUniqueOrThrow({
      where: { id: started.jobId },
    });
    if (!row.cvProcessingJobId) {
      throw new Error("guest deveria ter entrado no pipeline novo");
    }
    const cvJobRow = await processOneCvJob(h.cvWorker, row.cvProcessingJobId);
    cvSourceId = cvJobRow.cvSourceId;

    // Mesmo "claim" interno que processOneAnalysisJob faria — mas para
    // por aqui, ANTES de processReadyJob, guardando o snapshot (userId
    // ainda null: o worker "pegou" a linha antes do cadastro acontecer).
    const claimedSnapshot = await (
      h.analysisWorker as unknown as {
        claim: (
          id: string,
        ) => Promise<
          (typeof row & { userId: string | null; ownerKind: string }) | null
        >;
      }
    ).claim(started.jobId);
    if (!claimedSnapshot) {
      throw new Error("analysis job deveria estar pending nesse ponto");
    }
    assert.equal(
      claimedSnapshot.userId,
      null,
      "pré-condição: o snapshot que o worker vai usar ainda não tem dono",
    );

    userId = await makeRealUser(runId);

    // O cadastro/claim acontece AGORA — "durante" a análise do ponto de
    // vista do worker, que já está com o snapshot antigo em mãos.
    const claimResult = await h.service.claimGuestAnalysisJob(
      userId,
      started.jobId,
      started.guestPossessionToken,
      { sessionPublicToken: session } as never,
    );
    assert.equal(claimResult.status, "processing");

    const transferredWhileProcessing =
      await database.analysisJob.findUniqueOrThrow({
        where: { id: started.jobId },
      });
    assert.equal(
      transferredWhileProcessing.userId,
      userId,
      "ownership já foi transferida no banco, mesmo com o worker ainda usando o snapshot antigo",
    );

    // Só agora o worker "termina" o processamento — com o snapshot ANTIGO
    // (userId null), reproduzindo exatamente a corrida real.
    await (
      h.analysisWorker as unknown as {
        processReadyJob: (
          job: typeof claimedSnapshot,
          cvProcessingJob: {
            id: string;
            cvSourceId: string;
            cvStructuredProfileId: string | null;
          },
        ) => Promise<void>;
      }
    ).processReadyJob(claimedSnapshot, {
      id: row.cvProcessingJobId,
      cvSourceId: cvJobRow.cvSourceId,
      cvStructuredProfileId: cvJobRow.cvStructuredProfileId,
    });

    const finished = await database.analysisJob.findUniqueOrThrow({
      where: { id: started.jobId },
    });
    assert.equal(
      finished.status,
      "succeeded",
      `análise precisa terminar succeeded, não "${finished.status}" (lastError: ${finished.lastError})`,
    );

    const grant = await prisma.claimSourceGrant.findUnique({
      where: { cvSourceId_userId: { cvSourceId, userId } },
    });
    assert.ok(
      grant,
      "ClaimSourceGrant precisa existir mesmo quando o claim aconteceu depois do worker já ter lido a linha",
    );
  } finally {
    if (cvSourceId) await cleanupClaimRun(runId, [cvSourceId], userId);
  }
});

// Achado real em teste manual (2026-09-09, mesmo dia): CvTalentCaptureService
// #findOrCreateTalentProfile pode criar um TalentProfile(userId) do zero,
// concorrente com o claim tentando reapontar o TalentProfile do guest pro
// MESMO userId ("zero cópia" — resolveMasterAndResume/resolveSubject) —
// violava @@unique([userId]) e derrubava a análise inteira pra "failed"
// (pior que o bug original: sem esse UPDATE nem a designação nem o Master
// eram promovidos, e não havia retry automático). Prova aqui chamando
// claim() DUAS VEZES concorrentemente pra mesma fonte/usuário (mesma
// classe de corrida — dois escritores independentes disputando o mesmo
// TalentProfile(userId)) — as duas precisam terminar sem exceção, e o
// estado final precisa ser consistente (um TalentSubject fundido, nunca
// duas fusões conflitantes).
test("CLAIM-RACE 3: duas chamadas concorrentes de claim() convergem (direto ou via retry) sem nunca ficar presas por unique constraint em TalentProfile", async () => {
  const runId = makeRunId("claim-race-3");
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

    const claimInput = {
      userId,
      analysisJobId: started.jobId,
      cvProcessingJobId: cvJobRow.id,
    };

    // Concorrência real de verdade (duas transações independentes
    // disputando exatamente o mesmo grant) pode ainda fazer UMA das duas
    // perder a corrida em ensureGrant — isso é uma limitação DOCUMENTADA
    // e aceita nesse método (comentário de ensureGrant: "a transação
    // perdedora falha inteira... quem chamou trata como recuperável").
    // O que este teste prova é o achado real do bug: mesmo perdendo essa
    // corrida, um RETRY (o mesmo padrão que claimGuestAnalysisJob e
    // pollAndClaim já fazem) sempre converge — nunca mais falha por causa
    // do TalentProfile(userId) que a corrida concorrente pode ter criado
    // no meio do caminho (isso sim seria um bug permanente, não uma
    // corrida recuperável).
    const results = await Promise.allSettled([
      claimSourceGrantService.claim(claimInput),
      claimSourceGrantService.claim(claimInput),
    ]);

    const anyRejected = results.some((r) => r.status === "rejected");
    if (anyRejected) {
      const retry = await claimSourceGrantService.claim(claimInput);
      assert.ok(retry, "retry depois de perder a corrida precisa suceder");
    }

    const source = await database.cvSource.findUniqueOrThrow({
      where: { id: cvSourceId },
    });
    const talentSubject = await prisma.talentSubject.findUniqueOrThrow({
      where: { id: source.talentSubjectId as string },
    });
    assert.equal(
      talentSubject.mergedIntoUserId,
      userId,
      "TalentSubject precisa ter sido fundido no usuário mesmo com duas chamadas concorrentes",
    );

    const grantCount = await prisma.claimSourceGrant.count({
      where: { cvSourceId, userId },
    });
    assert.equal(grantCount, 1, "nunca duplica o grant sob concorrência");

    const userProfileCount = await prisma.talentProfile.count({
      where: { userId },
    });
    assert.equal(
      userProfileCount,
      1,
      "nunca sobra mais de um TalentProfile pro mesmo usuário",
    );
  } finally {
    if (cvSourceId) await cleanupClaimRun(runId, [cvSourceId], userId);
  }
});
