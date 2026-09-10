// Testes permanentes — item 3 da 3ª rodada da auditoria adversarial
// (2026-09-09). TalentProfile.currentTitle é um FATO CONSOLIDADO, gravado
// em cada evento que confirma quem é o Master (extração inicial via
// CvTalentCaptureService#deriveCurrentTitle, ou promoção posterior via
// CvMasterPromotionService#promoteAndProjectWithinTransaction) — NUNCA uma
// projeção "ao vivo" recalculada por leitura. Uma vez gravado por um evento
// de Master, o valor persiste mesmo que o Master seja depois superseded/
// removido — não há re-derivação automática nesses casos.
process.env.CV_STRUCTURED_PROFILE_PIPELINE_ENABLED = "true";
process.env.SKIP_AI = "false";

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";

import type { MasterCvCanonicalExtractionOutput } from "../master-cv-canonical-extraction/master-cv-canonical-extraction.types";
import {
  buildAnalysisWorker,
  buildCapturingAiClient,
  buildCvText,
  buildEntrypoint,
  buildProcessingWorker,
  buildRealCvAdaptationService,
  database,
  JOB_DESCRIPTION_BASE,
  masterPromotion,
  minimalAnalysisJson,
  minimalGenerationJson,
  prisma,
  processOneAnalysisJob,
  processOneCvJob,
  FakeStorage,
} from "./test-support/canonical-pipeline-test-services";
import { makeRunId } from "./test-support/canonical-pipeline-test-harness";

function buildOutput(
  runId: string,
  headline: string | null,
): MasterCvCanonicalExtractionOutput {
  return {
    canonicalProfile: {
      fullName: null,
      headline,
      email: null,
      phone: null,
      linkedinUrl: null,
      location: { city: null, state: null, country: null },
      professionalSummary: `${runId} resumo`,
      experiences: [],
      education: [],
      skills: [],
      languages: [],
      certifications: [],
    },
    extractionCoverage: { identifiedFields: [], missingFields: [], fieldStatus: {} },
    confidence: {},
    evidence: {},
  };
}

async function cleanup(runId: string, cvSourceIds: string[], userId?: string): Promise<void> {
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
  if (userId) await prisma.cvMasterDesignation.deleteMany({ where: { userId } });
  if (talentSubjectIds.size)
    await prisma.cvMasterDesignation.deleteMany({
      where: { talentSubjectId: { in: [...talentSubjectIds] } },
    });
  await database.resume.deleteMany({ where: { cvSourceId: { in: cvSourceIds } } });
  if (userId) await database.resume.deleteMany({ where: { userId } });
  if (userId) await database.talentProfile.deleteMany({ where: { userId } });
  if (talentSubjectIds.size)
    await prisma.talentProfile.deleteMany({
      where: { talentSubjectId: { in: [...talentSubjectIds] } },
    });
  await database.cvSource.deleteMany({ where: { id: { in: cvSourceIds } } });
  if (talentSubjectIds.size)
    await prisma.talentSubject.deleteMany({ where: { id: { in: [...talentSubjectIds] } } });
  if (userId) await database.user.deleteMany({ where: { id: userId } });
}

async function makeUser(runId: string) {
  return database.user.create({
    data: { email: `${runId}-${randomUUID()}@example.com`, passwordHash: "x", name: runId },
  });
}

test("CURRENTTITLE 1: Master (primeiro CV, promovido automaticamente) com headline — currentTitle gravado", async () => {
  const runId = makeRunId("ct-1");
  const user = await makeUser(runId);
  let cvSourceId: string | undefined;
  try {
    const storage = new FakeStorage();
    const cvWorker = buildProcessingWorker(
      async () => buildOutput(runId, `${runId} Cargo Master`),
      storage,
    );
    const entrypoint = buildEntrypoint(storage);
    const { client } = buildCapturingAiClient(minimalAnalysisJson, minimalGenerationJson);
    const service = buildRealCvAdaptationService(client, client, entrypoint);
    const analysisWorker = buildAnalysisWorker(service);

    const started = await service.startAuthenticatedAnalysisJob(user.id, {
      jobDescriptionText: `${JOB_DESCRIPTION_BASE} ${runId}`,
      masterCvText: buildCvText(runId, "geral"),
    });
    const row = await database.analysisJob.findUniqueOrThrow({ where: { id: started.jobId } });
    const cvJobRow = await processOneCvJob(cvWorker, row.cvProcessingJobId as string);
    cvSourceId = cvJobRow.cvSourceId;
    await processOneAnalysisJob(analysisWorker, started.jobId);

    const profile = await prisma.talentProfile.findUniqueOrThrow({ where: { userId: user.id } });
    assert.equal(profile.currentTitle, `${runId} Cargo Master`);
  } finally {
    if (cvSourceId) await cleanup(runId, [cvSourceId], user.id);
  }
});

test("CURRENTTITLE 2: CV não-Master com headline diferente — currentTitle NÃO muda", async () => {
  const runId = makeRunId("ct-2");
  const user = await makeUser(runId);
  let cvSourceId1: string | undefined;
  let cvSourceId2: string | undefined;
  try {
    const storage = new FakeStorage();
    const entrypoint = buildEntrypoint(storage);
    const { client } = buildCapturingAiClient(minimalAnalysisJson, minimalGenerationJson);
    const service = buildRealCvAdaptationService(client, client, entrypoint);
    const analysisWorker = buildAnalysisWorker(service);

    const cvWorker1 = buildProcessingWorker(
      async () => buildOutput(`${runId}-1`, `${runId} Cargo Master`),
      storage,
    );
    const started1 = await service.startAuthenticatedAnalysisJob(user.id, {
      jobDescriptionText: `${JOB_DESCRIPTION_BASE} ${runId}-1`,
      masterCvText: buildCvText(`${runId}-1`, "v1"),
    });
    const row1 = await database.analysisJob.findUniqueOrThrow({ where: { id: started1.jobId } });
    const cvJob1 = await processOneCvJob(cvWorker1, row1.cvProcessingJobId as string);
    cvSourceId1 = cvJob1.cvSourceId;
    await processOneAnalysisJob(analysisWorker, started1.jobId);

    const profileAfterMaster = await prisma.talentProfile.findUniqueOrThrow({
      where: { userId: user.id },
    });
    assert.equal(profileAfterMaster.currentTitle, `${runId} Cargo Master`);

    // Segundo CV, masterIntent NONE (avulso, nunca vira Master).
    const cvWorker2 = buildProcessingWorker(
      async () => buildOutput(`${runId}-2`, `${runId} Cargo Avulso`),
      storage,
    );
    const started2 = await service.startAuthenticatedAnalysisJob(user.id, {
      jobDescriptionText: `${JOB_DESCRIPTION_BASE} ${runId}-2`,
      masterCvText: buildCvText(`${runId}-2`, "v2-bem-diferente"),
      masterIntent: "NONE",
    } as never);
    const row2 = await database.analysisJob.findUniqueOrThrow({ where: { id: started2.jobId } });
    const cvJob2 = await processOneCvJob(cvWorker2, row2.cvProcessingJobId as string);
    cvSourceId2 = cvJob2.cvSourceId;
    await processOneAnalysisJob(analysisWorker, started2.jobId);

    const profileAfterAvulso = await prisma.talentProfile.findUniqueOrThrow({
      where: { userId: user.id },
    });
    assert.equal(
      profileAfterAvulso.currentTitle,
      `${runId} Cargo Master`,
      "CV avulso não pode substituir currentTitle já confirmado pelo Master",
    );
  } finally {
    if (cvSourceId2) await cleanup(runId, [cvSourceId2]);
    if (cvSourceId1) await cleanup(runId, [cvSourceId1], user.id);
  }
});

test("CURRENTTITLE 3: promoção EXPLÍCITA de um CV que já existia (não era Master) — currentTitle passa a refletir o novo Master", async () => {
  const runId = makeRunId("ct-3");
  const user = await makeUser(runId);
  let cvSourceId1: string | undefined;
  let cvSourceId2: string | undefined;
  try {
    const storage = new FakeStorage();
    const entrypoint = buildEntrypoint(storage);
    const { client } = buildCapturingAiClient(minimalAnalysisJson, minimalGenerationJson);
    const service = buildRealCvAdaptationService(client, client, entrypoint);
    const analysisWorker = buildAnalysisWorker(service);

    const cvWorker1 = buildProcessingWorker(
      async () => buildOutput(`${runId}-1`, `${runId} Cargo Master Original`),
      storage,
    );
    const started1 = await service.startAuthenticatedAnalysisJob(user.id, {
      jobDescriptionText: `${JOB_DESCRIPTION_BASE} ${runId}-1`,
      masterCvText: buildCvText(`${runId}-1`, "v1"),
    });
    const row1 = await database.analysisJob.findUniqueOrThrow({ where: { id: started1.jobId } });
    const cvJob1 = await processOneCvJob(cvWorker1, row1.cvProcessingJobId as string);
    cvSourceId1 = cvJob1.cvSourceId;
    await processOneAnalysisJob(analysisWorker, started1.jobId);

    // Segundo CV, avulso a princípio (masterIntent NONE) — não vira Master
    // no momento da extração, então CvTalentCaptureService#deriveCurrentTitle
    // não escreve nada por ele ainda.
    const cvWorker2 = buildProcessingWorker(
      async () => buildOutput(`${runId}-2`, `${runId} Cargo do CV Promovido Depois`),
      storage,
    );
    const started2 = await service.startAuthenticatedAnalysisJob(user.id, {
      jobDescriptionText: `${JOB_DESCRIPTION_BASE} ${runId}-2`,
      masterCvText: buildCvText(`${runId}-2`, "v2-bem-diferente"),
      masterIntent: "NONE",
    } as never);
    const row2 = await database.analysisJob.findUniqueOrThrow({ where: { id: started2.jobId } });
    const cvJob2 = await processOneCvJob(cvWorker2, row2.cvProcessingJobId as string);
    cvSourceId2 = cvJob2.cvSourceId;
    await processOneAnalysisJob(analysisWorker, started2.jobId);

    const beforePromotion = await prisma.talentProfile.findUniqueOrThrow({
      where: { userId: user.id },
    });
    assert.equal(beforePromotion.currentTitle, `${runId} Cargo Master Original`);

    // Promoção EXPLÍCITA do segundo CV pra Master — mesmo caminho real de
    // resumes.service.ts#setPrimary (PROMOTE_EXPLICIT + syncResumeIsMaster).
    const structuredProfile2 = await database.cvStructuredProfile.findUniqueOrThrow({
      where: { id: cvJob2.cvStructuredProfileId as string },
    });
    // CvMasterDesignation ativa de USER exige resumeId (invariante formal,
    // schema.prisma) — este CV foi analisado por texto colado, sem Resume
    // associado, então cria um mínimo aqui pra satisfazer a invariante
    // (mesmo padrão de resumes.service.ts#setPrimary, que sempre parte de
    // um Resume existente).
    const resume2 = await database.resume.create({
      data: {
        userId: user.id,
        title: "Promovido explicitamente",
        isMaster: false,
        cvSourceId: cvSourceId2,
      },
    });
    await masterPromotion.promoteAndProject({
      ownerType: "USER",
      userId: user.id,
      cvStructuredProfileId: structuredProfile2.id,
      resumeId: resume2.id,
      masterIntent: "PROMOTE_EXPLICIT",
      promotedReason: "EXPLICIT_FLAG",
      canonicalProfile: structuredProfile2.canonicalJson as never,
      confidence: {},
      cvSourceId: cvSourceId2,
      syncResumeIsMaster: true,
    });

    const afterPromotion = await prisma.talentProfile.findUniqueOrThrow({
      where: { userId: user.id },
    });
    assert.equal(
      afterPromotion.currentTitle,
      `${runId} Cargo do CV Promovido Depois`,
      "promoção explícita precisa atualizar currentTitle para refletir o NOVO Master, mesmo sem re-executar a extração",
    );
  } finally {
    await prisma.cvMasterDesignation.deleteMany({ where: { userId: user.id } });
    const ids = [cvSourceId1, cvSourceId2].filter((id): id is string => Boolean(id));
    if (ids.length) await cleanup(runId, ids, user.id);
  }
});

test("CURRENTTITLE 4: guest com Master provisório — currentTitle gravado no TalentProfile do TalentSubject", async () => {
  const runId = makeRunId("ct-4");
  let cvSourceId: string | undefined;
  try {
    const storage = new FakeStorage();
    const cvWorker = buildProcessingWorker(
      async () => buildOutput(runId, `${runId} Cargo Guest`),
      storage,
    );
    const entrypoint = buildEntrypoint(storage);
    const { client } = buildCapturingAiClient(minimalAnalysisJson, minimalGenerationJson);
    const service = buildRealCvAdaptationService(client, client, entrypoint);
    const analysisWorker = buildAnalysisWorker(service);

    const session = `${runId}-session`;
    const started = await service.startGuestAnalysisJob(
      `${JOB_DESCRIPTION_BASE} ${runId}`,
      undefined,
      buildCvText(runId, "geral"),
      undefined,
      { sessionPublicToken: session } as never,
    );
    const row = await database.analysisJob.findUniqueOrThrow({ where: { id: started.jobId } });
    const cvJobRow = await processOneCvJob(cvWorker, row.cvProcessingJobId as string);
    cvSourceId = cvJobRow.cvSourceId;
    await processOneAnalysisJob(analysisWorker, started.jobId);

    const source = await database.cvSource.findUniqueOrThrow({ where: { id: cvSourceId } });
    const profile = await prisma.talentProfile.findUniqueOrThrow({
      where: { talentSubjectId: source.talentSubjectId as string },
    });
    assert.equal(profile.currentTitle, `${runId} Cargo Guest`);
  } finally {
    if (cvSourceId) await cleanup(runId, [cvSourceId]);
  }
});

test("CURRENTTITLE 5: claim — currentTitle do guest sobrevive na conta do usuário depois do claim (CLAIM_FULL, reatribuição)", async () => {
  const runId = makeRunId("ct-5");
  const user = await makeUser(runId);
  let cvSourceId: string | undefined;
  try {
    const storage = new FakeStorage();
    const cvWorker = buildProcessingWorker(
      async () => buildOutput(runId, `${runId} Cargo Guest Reivindicado`),
      storage,
    );
    const entrypoint = buildEntrypoint(storage);
    const { client } = buildCapturingAiClient(minimalAnalysisJson, minimalGenerationJson);
    const service = buildRealCvAdaptationService(client, client, entrypoint);
    const analysisWorker = buildAnalysisWorker(service);

    const session = `${runId}-session`;
    const started = await service.startGuestAnalysisJob(
      `${JOB_DESCRIPTION_BASE} ${runId}`,
      undefined,
      buildCvText(runId, "geral"),
      undefined,
      { sessionPublicToken: session } as never,
    );
    const row = await database.analysisJob.findUniqueOrThrow({ where: { id: started.jobId } });
    const cvJobRow = await processOneCvJob(cvWorker, row.cvProcessingJobId as string);
    cvSourceId = cvJobRow.cvSourceId;
    await processOneAnalysisJob(analysisWorker, started.jobId);

    const claimResult = await service.claimGuestAnalysisJob(
      user.id,
      started.jobId,
      started.guestPossessionToken,
      { sessionPublicToken: session } as never,
    );
    assert.equal(claimResult.status, "succeeded");

    const userProfile = await prisma.talentProfile.findUniqueOrThrow({
      where: { userId: user.id },
    });
    assert.equal(
      userProfile.currentTitle,
      `${runId} Cargo Guest Reivindicado`,
      "claim completo (CLAIM_FULL) reatribui o TalentProfile do guest pro usuário — currentTitle precisa vir junto, é o mesmo registro",
    );
  } finally {
    if (cvSourceId) await cleanup(runId, [cvSourceId], user.id);
  }
});

test("CURRENTTITLE 6: Master superseded/removido depois — currentTitle é FATO CONSOLIDADO, não reverte automaticamente", async () => {
  const runId = makeRunId("ct-6");
  const user = await makeUser(runId);
  let cvSourceId: string | undefined;
  try {
    const storage = new FakeStorage();
    const cvWorker = buildProcessingWorker(
      async () => buildOutput(runId, `${runId} Cargo Congelado`),
      storage,
    );
    const entrypoint = buildEntrypoint(storage);
    const { client } = buildCapturingAiClient(minimalAnalysisJson, minimalGenerationJson);
    const service = buildRealCvAdaptationService(client, client, entrypoint);
    const analysisWorker = buildAnalysisWorker(service);

    const started = await service.startAuthenticatedAnalysisJob(user.id, {
      jobDescriptionText: `${JOB_DESCRIPTION_BASE} ${runId}`,
      masterCvText: buildCvText(runId, "geral"),
    });
    const row = await database.analysisJob.findUniqueOrThrow({ where: { id: started.jobId } });
    const cvJobRow = await processOneCvJob(cvWorker, row.cvProcessingJobId as string);
    cvSourceId = cvJobRow.cvSourceId;
    await processOneAnalysisJob(analysisWorker, started.jobId);

    const before = await prisma.talentProfile.findUniqueOrThrow({ where: { userId: user.id } });
    assert.equal(before.currentTitle, `${runId} Cargo Congelado`);

    // Supersede a designação ativa diretamente (simula o Master sendo
    // removido/substituído sem que nenhuma nova extração rode) — nada
    // reavalia currentTitle automaticamente nesse evento.
    await prisma.cvMasterDesignation.updateMany({
      where: { userId: user.id, supersededAt: null },
      data: { supersededAt: new Date() },
    });

    const after = await prisma.talentProfile.findUniqueOrThrow({ where: { userId: user.id } });
    assert.equal(
      after.currentTitle,
      `${runId} Cargo Congelado`,
      "currentTitle é fato consolidado — não é limpo nem recalculado só porque a designação de Master foi superseded",
    );
  } finally {
    if (cvSourceId) await cleanup(runId, [cvSourceId], user.id);
  }
});
