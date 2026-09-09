// Testes permanentes — fonte canônica da análise/geração (2ª rodada da
// auditoria adversarial, 2026-09-08). Substitui zz-adversarial-audit.e2e-spec.ts
// (nunca commitado). Postgres real (earlycv_test). Todo teste registra seus
// próprios userId/talentSubjectId em RunArtifacts e limpa em finally — nunca
// depende de truncar a tabela, nunca toca em debris de execuções anteriores.
process.env.CV_STRUCTURED_PROFILE_PIPELINE_ENABLED = "true";
process.env.SKIP_AI = "false";

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";

import {
  allMessageContent,
  buildAnalysisWorker,
  buildCapturingAiClient,
  buildCvText,
  buildEntrypoint,
  buildProcessingWorker,
  buildRealCvAdaptationService,
  database,
  fakeCanonicalOutput,
  JOB_DESCRIPTION_BASE,
  minimalAnalysisJson,
  minimalGenerationJson,
  prisma,
  processOneAnalysisJob,
  processOneCvJob,
  FakeStorage,
} from "./test-support/canonical-pipeline-test-services";
import {
  cleanupRunArtifacts,
  makeRunId,
  RunArtifacts,
} from "./test-support/canonical-pipeline-test-harness";

async function createUser(runId: string, artifacts: RunArtifacts) {
  const user = await prisma.user.create({
    data: {
      email: `${runId}+${randomUUID()}@example.com`,
      name: "Audit User",
      profile: { create: {} },
    },
  });
  artifacts.trackUser(user.id);
  return user;
}

test("SENTINELA 1: análise de CV novo (texto colado) — payload contém só o canonicalJson desta extração", async () => {
  const runId = makeRunId("src-1");
  const artifacts = new RunArtifacts();
  try {
    const user = await createUser(runId, artifacts);

    await prisma.resume.create({
      data: {
        userId: user.id,
        title: `${runId} Resume solto`,
        isMaster: false,
        rawText: `${runId} ORIGEM_RAW não pode aparecer aqui`,
      },
    });
    await prisma.userProfile.update({
      where: { userId: user.id },
      data: {
        professionalSummary: `${runId} ORIGEM_USER_PROFILE não pode aparecer aqui`,
        profileReadinessStatus: "ready",
      },
    });

    const storage = new FakeStorage();
    const cvWorker = buildProcessingWorker(
      async () => fakeCanonicalOutput(`${runId} ORIGEM_CANONICAL_TEXTO_NOVO`),
      storage,
    );
    const entrypoint = buildEntrypoint(storage);
    const { client, capturedMessages } = buildCapturingAiClient(
      minimalAnalysisJson,
      minimalGenerationJson,
    );
    const service = buildRealCvAdaptationService(client, client, entrypoint);
    const analysisWorker = buildAnalysisWorker(service);

    const started = await service.startAuthenticatedAnalysisJob(user.id, {
      jobDescriptionText: `${JOB_DESCRIPTION_BASE} ${runId}`,
      masterCvText: buildCvText(`${runId} ORIGEM_CANONICAL_TEXTO_NOVO`, "dados"),
    });
    const row = await database.analysisJob.findUniqueOrThrow({
      where: { id: started.jobId },
    });
    await processOneCvJob(cvWorker, row.cvProcessingJobId as string);
    await processOneAnalysisJob(analysisWorker, started.jobId);

    assert.equal(
      capturedMessages.length,
      1,
      "deveria ter havido exatamente 1 chamada de IA (a análise)",
    );
    const payload = allMessageContent(capturedMessages[0]);
    assert.match(payload, /ORIGEM_CANONICAL_TEXTO_NOVO/);
    assert.doesNotMatch(payload, /ORIGEM_RAW/);
    assert.doesNotMatch(payload, /ORIGEM_USER_PROFILE/);
  } finally {
    await cleanupRunArtifacts(database, artifacts);
  }
});

test("SENTINELA 2: inputMode profile — payload contém só o canonicalJson do Master ativo, nunca UserProfile/rawText", async () => {
  const runId = makeRunId("src-2");
  const artifacts = new RunArtifacts();
  try {
    const user = await createUser(runId, artifacts);
    const storage = new FakeStorage();
    const cvWorker = buildProcessingWorker(
      async () => fakeCanonicalOutput(`${runId} ORIGEM_CANONICAL_MASTER_ATIVO`),
      storage,
    );
    const entrypoint = buildEntrypoint(storage);
    const { client, capturedMessages } = buildCapturingAiClient(
      minimalAnalysisJson,
      minimalGenerationJson,
    );
    const service = buildRealCvAdaptationService(client, client, entrypoint);
    const analysisWorker = buildAnalysisWorker(service);

    const setup = await service.startAuthenticatedAnalysisJob(user.id, {
      jobDescriptionText: `${JOB_DESCRIPTION_BASE} ${runId}`,
      masterCvText: buildCvText(`${runId} ORIGEM_CANONICAL_MASTER_ATIVO`, "dados"),
    });
    const setupRow = await database.analysisJob.findUniqueOrThrow({
      where: { id: setup.jobId },
    });
    await processOneCvJob(cvWorker, setupRow.cvProcessingJobId as string);
    await processOneAnalysisJob(analysisWorker, setup.jobId);
    capturedMessages.length = 0;

    await prisma.userProfile.update({
      where: { userId: user.id },
      data: {
        professionalSummary: `${runId} ORIGEM_USER_PROFILE não pode aparecer aqui`,
        profileReadinessStatus: "ready",
      },
    });

    const profileAnalysis = await service.startAuthenticatedAnalysisJob(
      user.id,
      {
        jobDescriptionText: `${JOB_DESCRIPTION_BASE} ${runId} profile`,
        inputMode: "profile",
      } as never,
    );
    await processOneAnalysisJob(analysisWorker, profileAnalysis.jobId);

    assert.equal(
      capturedMessages.length,
      1,
      "inputMode profile não deveria rodar nova extração — só a análise",
    );
    const payload = allMessageContent(capturedMessages[0]);
    assert.match(payload, /ORIGEM_CANONICAL_MASTER_ATIVO/);
    assert.doesNotMatch(payload, /ORIGEM_USER_PROFILE/);
  } finally {
    await cleanupRunArtifacts(database, artifacts);
  }
});

test("SENTINELA 3: Master trocado depois da análise — geração da análise antiga usa o perfil ANTIGO, nunca o Master novo", async () => {
  const runId = makeRunId("src-3");
  const artifacts = new RunArtifacts();
  try {
    const user = await createUser(runId, artifacts);
    const storage = new FakeStorage();
    const cvWorker = buildProcessingWorker(
      async () => fakeCanonicalOutput(`${runId} ORIGEM_CANONICAL_MASTER_ANTIGO`),
      storage,
    );
    const entrypoint = buildEntrypoint(storage);
    const { client, capturedMessages } = buildCapturingAiClient(
      minimalAnalysisJson,
      minimalGenerationJson,
    );
    const service = buildRealCvAdaptationService(client, client, entrypoint);
    const analysisWorker = buildAnalysisWorker(service);

    const setup = await service.startAuthenticatedAnalysisJob(user.id, {
      jobDescriptionText: `${JOB_DESCRIPTION_BASE} ${runId}`,
      masterCvText: buildCvText(`${runId} ORIGEM_CANONICAL_MASTER_ANTIGO`, "dados"),
    });
    const setupRow = await database.analysisJob.findUniqueOrThrow({
      where: { id: setup.jobId },
    });
    await processOneCvJob(cvWorker, setupRow.cvProcessingJobId as string);
    const finalAnalysis = await processOneAnalysisJob(
      analysisWorker,
      setup.jobId,
    );
    assert.equal(finalAnalysis.status, "succeeded");

    const claimResult = await service.claimGuestAnalysisJob(
      user.id,
      setup.jobId,
    );
    assert.equal(claimResult.status, "succeeded");
    if (claimResult.status !== "succeeded") throw new Error("unreachable");

    const novoWorker = buildProcessingWorker(
      async () => fakeCanonicalOutput(`${runId} ORIGEM_MASTER_NOVO`),
      storage,
    );
    const novo = await service.startAuthenticatedAnalysisJob(user.id, {
      jobDescriptionText: `${JOB_DESCRIPTION_BASE} ${runId} novo`,
      masterCvText: buildCvText(`${runId} ORIGEM_MASTER_NOVO`, "produto"),
      saveAsMaster: true,
    });
    const novoRow = await database.analysisJob.findUniqueOrThrow({
      where: { id: novo.jobId },
    });
    await processOneCvJob(novoWorker, novoRow.cvProcessingJobId as string);

    capturedMessages.length = 0;

    const adaptation = await database.cvAdaptation.findUniqueOrThrow({
      where: { id: claimResult.cvAdaptationId },
      include: { masterResume: { select: { rawText: true } } },
    });
    const output = await (
      service as unknown as {
        ensureLegacyStructuredOutput: (a: typeof adaptation) => Promise<unknown>;
      }
    ).ensureLegacyStructuredOutput(adaptation);
    assert.ok(output);

    assert.equal(capturedMessages.length, 1);
    const payload = allMessageContent(capturedMessages[0]);
    assert.match(payload, /ORIGEM_CANONICAL_MASTER_ANTIGO/);
    assert.doesNotMatch(
      payload,
      /ORIGEM_MASTER_NOVO/,
      "geração de uma análise antiga NUNCA pode usar o perfil do Master trocado depois",
    );
  } finally {
    await cleanupRunArtifacts(database, artifacts);
  }
});

// ===========================================================================
// Invariante 4 — CV diferente não substitui Master (arquivo e texto colado).
// ===========================================================================
for (const variant of ["texto colado", "arquivo (via masterResumeId)"] as const) {
  test(`INVARIANTE 4 (${variant}): CV B diferente, masterIntent NONE — não altera Resume.isMaster nem CvMasterDesignation de A`, async () => {
    const runId = makeRunId(`inv4-${variant === "texto colado" ? "texto" : "arquivo"}`);
    const artifacts = new RunArtifacts();
    try {
      const user = await createUser(runId, artifacts);
      const storage = new FakeStorage();
      const cvWorkerA = buildProcessingWorker(
        async () => fakeCanonicalOutput(`${runId} ORIGEM_A`),
        storage,
      );
      const entrypoint = buildEntrypoint(storage);
      const { client } = buildCapturingAiClient(
        minimalAnalysisJson,
        minimalGenerationJson,
      );
      const service = buildRealCvAdaptationService(client, client, entrypoint);
      const analysisWorker = buildAnalysisWorker(service);

      // Master A.
      const setupA = await service.startAuthenticatedAnalysisJob(user.id, {
        jobDescriptionText: `${JOB_DESCRIPTION_BASE} ${runId} a`,
        masterCvText: buildCvText(`${runId} ORIGEM_A`, "dados"),
      });
      const rowA = await database.analysisJob.findUniqueOrThrow({
        where: { id: setupA.jobId },
      });
      await processOneCvJob(cvWorkerA, rowA.cvProcessingJobId as string);
      await processOneAnalysisJob(analysisWorker, setupA.jobId);

      const designationBefore =
        await prisma.cvMasterDesignation.findFirstOrThrow({
          where: { userId: user.id, supersededAt: null },
        });
      const masterResumeIdA = designationBefore.resumeId;
      const userProfileBefore = await prisma.userProfile.findUniqueOrThrow({
        where: { userId: user.id },
      });

      // CV B, diferente, masterIntent NONE (saveAsMaster: false).
      const cvWorkerB = buildProcessingWorker(
        async () => fakeCanonicalOutput(`${runId} ORIGEM_B`),
        storage,
      );
      let resumeIdForB: string | undefined;
      if (variant === "arquivo (via masterResumeId)") {
        const resumeB = await prisma.resume.create({
          data: {
            userId: user.id,
            title: `${runId} Resume B avulso`,
            isMaster: false,
            rawText: `${runId} ${buildCvText(`${runId} ORIGEM_B`, "vendas")}`,
          },
        });
        resumeIdForB = resumeB.id;
      }
      const setupB = await service.startAuthenticatedAnalysisJob(user.id, {
        jobDescriptionText: `${JOB_DESCRIPTION_BASE} ${runId} b`,
        ...(resumeIdForB
          ? { masterResumeId: resumeIdForB }
          : { masterCvText: buildCvText(`${runId} ORIGEM_B`, "vendas") }),
        saveAsMaster: false,
      });
      const rowB = await database.analysisJob.findUniqueOrThrow({
        where: { id: setupB.jobId },
      });
      assert.notEqual(
        rowB.cvProcessingJobId,
        rowA.cvProcessingJobId,
        "CV B precisa gerar seu próprio CvProcessingJob/CvSource, nunca reusar o de A",
      );
      const cvJobB = await database.cvProcessingJob.findUniqueOrThrow({
        where: { id: rowB.cvProcessingJobId as string },
      });
      assert.equal(cvJobB.masterIntent, "NONE");
      await processOneCvJob(cvWorkerB, rowB.cvProcessingJobId as string);
      const finalB = await processOneAnalysisJob(analysisWorker, setupB.jobId);
      assert.equal(finalB.status, "succeeded");
      assert.notEqual(
        finalB.cvStructuredProfileId,
        rowA.cvStructuredProfileId,
        "análise de B precisa usar o CvStructuredProfile de B, nunca o de A",
      );

      // Master A intacto.
      const designationAfter = await prisma.cvMasterDesignation.findFirstOrThrow(
        { where: { userId: user.id, supersededAt: null } },
      );
      assert.equal(
        designationAfter.id,
        designationBefore.id,
        "CvMasterDesignation ativa não pode mudar só por analisar B",
      );
      assert.equal(designationAfter.resumeId, masterResumeIdA);
      const masterResumeAfter = await prisma.resume.findUniqueOrThrow({
        where: { id: masterResumeIdA as string },
      });
      assert.equal(
        masterResumeAfter.isMaster,
        true,
        "Resume.isMaster de A precisa continuar true",
      );
      const userProfileAfter = await prisma.userProfile.findUniqueOrThrow({
        where: { userId: user.id },
      });
      assert.equal(
        userProfileAfter.updatedAt.getTime(),
        userProfileBefore.updatedAt.getTime(),
        "UserProfile não pode ser recalculado a partir de B (nenhuma promoção aconteceu)",
      );

      // TalentProfile recebeu observações de B mesmo assim (captura sempre
      // roda, independente de virar Master — ver CvProcessingWorker#processJob
      // passo 2, incondicional).
      const talentProfile = await prisma.talentProfile.findUnique({
        where: { userId: user.id },
      });
      assert.ok(
        talentProfile,
        "TalentProfile precisa existir mesmo pra CV não-Master (B)",
      );

      const isMasterCount = await prisma.resume.count({
        where: { userId: user.id, isMaster: true },
      });
      assert.equal(isMasterCount, 1, "exatamente um Master ao final");
    } finally {
      await cleanupRunArtifacts(database, artifacts);
    }
  });
}

test("INVARIANTE 4 (promoção explícita): B só substitui A DEPOIS de READY, de forma atômica", async () => {
  const runId = makeRunId("inv4-promocao");
  const artifacts = new RunArtifacts();
  try {
    const user = await createUser(runId, artifacts);
    const storage = new FakeStorage();
    const entrypoint = buildEntrypoint(storage);
    const { client } = buildCapturingAiClient(
      minimalAnalysisJson,
      minimalGenerationJson,
    );
    const service = buildRealCvAdaptationService(client, client, entrypoint);
    const analysisWorker = buildAnalysisWorker(service);

    const cvWorkerA = buildProcessingWorker(
      async () => fakeCanonicalOutput(`${runId} ORIGEM_A`),
      storage,
    );
    const setupA = await service.startAuthenticatedAnalysisJob(user.id, {
      jobDescriptionText: `${JOB_DESCRIPTION_BASE} ${runId} a`,
      masterCvText: buildCvText(`${runId} ORIGEM_A`, "dados"),
    });
    const rowA = await database.analysisJob.findUniqueOrThrow({
      where: { id: setupA.jobId },
    });
    await processOneCvJob(cvWorkerA, rowA.cvProcessingJobId as string);
    await processOneAnalysisJob(analysisWorker, setupA.jobId);
    const designationA = await prisma.cvMasterDesignation.findFirstOrThrow({
      where: { userId: user.id, supersededAt: null },
    });

    // B, promoção explícita — antes do CvProcessingJob de B virar READY, A
    // continua sendo o Master ativo (promoção só acontece dentro do worker,
    // depois da extração).
    const cvWorkerB = buildProcessingWorker(
      async () => fakeCanonicalOutput(`${runId} ORIGEM_B`),
      storage,
    );
    const setupB = await service.startAuthenticatedAnalysisJob(user.id, {
      jobDescriptionText: `${JOB_DESCRIPTION_BASE} ${runId} b`,
      masterCvText: buildCvText(`${runId} ORIGEM_B`, "produto"),
      saveAsMaster: true,
    });
    const rowB = await database.analysisJob.findUniqueOrThrow({
      where: { id: setupB.jobId },
    });
    const designationDuring = await prisma.cvMasterDesignation.findFirstOrThrow(
      { where: { userId: user.id, supersededAt: null } },
    );
    assert.equal(
      designationDuring.id,
      designationA.id,
      "antes do CvProcessingJob de B ficar READY, A continua sendo o Master ativo",
    );

    await processOneCvJob(cvWorkerB, rowB.cvProcessingJobId as string);

    const designationAfter = await prisma.cvMasterDesignation.findFirstOrThrow(
      { where: { userId: user.id, supersededAt: null } },
    );
    assert.notEqual(
      designationAfter.id,
      designationA.id,
      "depois de READY, B substitui A atomicamente",
    );
    const oldDesignation = await prisma.cvMasterDesignation.findUniqueOrThrow({
      where: { id: designationA.id },
    });
    assert.ok(
      oldDesignation.supersededAt,
      "designação de A precisa ficar supersedida, nunca deletada",
    );
  } finally {
    await cleanupRunArtifacts(database, artifacts);
  }
});

// ===========================================================================
// Seção 9 (2ª rodada) — resolver de flags REAL. Elimina o fallback
// @Optional() em todos os cenários abaixo.
// ===========================================================================

test("FLAGS 1: flag global desligada + usuário fora da allowlist -> legado (cvProcessingJobId null)", async () => {
  const runId = makeRunId("flags-1");
  const artifacts = new RunArtifacts();
  const previousFlag = process.env.CV_STRUCTURED_PROFILE_PIPELINE_ENABLED;
  const previousAllowlist =
    process.env.CV_STRUCTURED_PROFILE_PIPELINE_ALLOWLIST_USER_IDS;
  process.env.CV_STRUCTURED_PROFILE_PIPELINE_ENABLED = "false";
  process.env.CV_STRUCTURED_PROFILE_PIPELINE_ALLOWLIST_USER_IDS = "";
  try {
    const user = await createUser(runId, artifacts);
    const storage = new FakeStorage();
    const entrypoint = buildEntrypoint(storage);
    const { client } = buildCapturingAiClient(
      minimalAnalysisJson,
      minimalGenerationJson,
    );
    const service = buildRealCvAdaptationService(client, client, entrypoint);

    const started = await service.startAuthenticatedAnalysisJob(user.id, {
      jobDescriptionText: `${JOB_DESCRIPTION_BASE} ${runId}`,
      masterCvText: buildCvText(`${runId} comum`, "vendas"),
    });
    const row = await database.analysisJob.findUniqueOrThrow({
      where: { id: started.jobId },
    });
    assert.equal(row.cvProcessingJobId, null);
  } finally {
    process.env.CV_STRUCTURED_PROFILE_PIPELINE_ENABLED = previousFlag;
    process.env.CV_STRUCTURED_PROFILE_PIPELINE_ALLOWLIST_USER_IDS =
      previousAllowlist;
    await cleanupRunArtifacts(database, artifacts);
  }
});

test("FLAGS 2: flag desligada + userId allowlisted -> pipeline novo", async () => {
  const runId = makeRunId("flags-2");
  const artifacts = new RunArtifacts();
  const previousFlag = process.env.CV_STRUCTURED_PROFILE_PIPELINE_ENABLED;
  const previousAllowlist =
    process.env.CV_STRUCTURED_PROFILE_PIPELINE_ALLOWLIST_USER_IDS;
  process.env.CV_STRUCTURED_PROFILE_PIPELINE_ENABLED = "false";
  try {
    const user = await createUser(runId, artifacts);
    process.env.CV_STRUCTURED_PROFILE_PIPELINE_ALLOWLIST_USER_IDS = user.id;
    const storage = new FakeStorage();
    const entrypoint = buildEntrypoint(storage);
    const { client } = buildCapturingAiClient(
      minimalAnalysisJson,
      minimalGenerationJson,
    );
    const service = buildRealCvAdaptationService(client, client, entrypoint);

    const started = await service.startAuthenticatedAnalysisJob(user.id, {
      jobDescriptionText: `${JOB_DESCRIPTION_BASE} ${runId}`,
      masterCvText: buildCvText(`${runId} allowlisted`, "vendas"),
    });
    const row = await database.analysisJob.findUniqueOrThrow({
      where: { id: started.jobId },
    });
    assert.ok(row.cvProcessingJobId, "userId allowlisted deveria entrar no pipeline novo mesmo com flag global desligada");
  } finally {
    process.env.CV_STRUCTURED_PROFILE_PIPELINE_ENABLED = previousFlag;
    process.env.CV_STRUCTURED_PROFILE_PIPELINE_ALLOWLIST_USER_IDS =
      previousAllowlist;
    await cleanupRunArtifacts(database, artifacts);
  }
});

test("FLAGS 3: admin (internalRole) -> pipeline novo mesmo com flag desligada e fora da allowlist", async () => {
  const runId = makeRunId("flags-3");
  const artifacts = new RunArtifacts();
  const previousFlag = process.env.CV_STRUCTURED_PROFILE_PIPELINE_ENABLED;
  const previousAllowlist =
    process.env.CV_STRUCTURED_PROFILE_PIPELINE_ALLOWLIST_USER_IDS;
  process.env.CV_STRUCTURED_PROFILE_PIPELINE_ENABLED = "false";
  process.env.CV_STRUCTURED_PROFILE_PIPELINE_ALLOWLIST_USER_IDS = "";
  try {
    const user = await createUser(runId, artifacts);
    await prisma.user.update({
      where: { id: user.id },
      data: { internalRole: "admin" },
    });
    const storage = new FakeStorage();
    const entrypoint = buildEntrypoint(storage);
    const { client } = buildCapturingAiClient(
      minimalAnalysisJson,
      minimalGenerationJson,
    );
    const service = buildRealCvAdaptationService(client, client, entrypoint);

    const started = await service.startAuthenticatedAnalysisJob(user.id, {
      jobDescriptionText: `${JOB_DESCRIPTION_BASE} ${runId}`,
      masterCvText: buildCvText(`${runId} admin`, "vendas"),
    });
    const row = await database.analysisJob.findUniqueOrThrow({
      where: { id: started.jobId },
    });
    assert.ok(row.cvProcessingJobId, "admin deveria sempre entrar no pipeline novo");
  } finally {
    process.env.CV_STRUCTURED_PROFILE_PIPELINE_ENABLED = previousFlag;
    process.env.CV_STRUCTURED_PROFILE_PIPELINE_ALLOWLIST_USER_IDS =
      previousAllowlist;
    await cleanupRunArtifacts(database, artifacts);
  }
});

test("FLAGS 4/5: guest com flag global desligada -> legado; com flag ligada -> novo", async () => {
  const runId = makeRunId("flags-4-5");
  const previousFlag = process.env.CV_STRUCTURED_PROFILE_PIPELINE_ENABLED;
  try {
    assert.equal(previousFlag, "true", "pré-condição do arquivo");
    const storage = new FakeStorage();
    const entrypoint = buildEntrypoint(storage);
    const { client } = buildCapturingAiClient(
      minimalAnalysisJson,
      minimalGenerationJson,
    );
    const service = buildRealCvAdaptationService(client, client, entrypoint);

    // 4: flag desligada -> legado (guest não tem nenhum outro caminho de
    // ativação além do master switch).
    delete process.env.CV_STRUCTURED_PROFILE_PIPELINE_ENABLED;
    const flagDesligada = await service.startGuestAnalysisJob(
      `${JOB_DESCRIPTION_BASE} ${runId} desligada`,
      undefined,
      buildCvText(`${runId} guest comum`, "vendas"),
      undefined,
      { sessionPublicToken: `${runId}-flag-off-${randomUUID()}` } as never,
    );
    const rowDesligada = await database.analysisJob.findUniqueOrThrow({
      where: { id: flagDesligada.jobId },
    });
    assert.equal(rowDesligada.cvProcessingJobId, null);

    // 5: flag ligada -> novo, para qualquer sessão guest, sem allowlist.
    process.env.CV_STRUCTURED_PROFILE_PIPELINE_ENABLED = "true";
    const flagLigada = await service.startGuestAnalysisJob(
      `${JOB_DESCRIPTION_BASE} ${runId} ligada`,
      undefined,
      buildCvText(`${runId} guest com flag ligada`, "vendas"),
      undefined,
      { sessionPublicToken: `${runId}-flag-on-${randomUUID()}` } as never,
    );
    const rowLigada = await database.analysisJob.findUniqueOrThrow({
      where: { id: flagLigada.jobId },
    });
    assert.ok(rowLigada.cvProcessingJobId);

    await database.analysisJob.deleteMany({
      where: {
        jobDescriptionText: { contains: runId },
      },
    });
  } finally {
    process.env.CV_STRUCTURED_PROFILE_PIPELINE_ENABLED = previousFlag;
  }
});

test("SENTINELA 4 (migrada de zz-adversarial-audit.e2e-spec.ts): guest sem identidade — payload de análise contém só o canonicalJson do visitante", async () => {
  const runId = makeRunId("src-4-guest");
  const marker = `ORIGEM_CANONICAL_GUEST_${runId}`;
  let cvSourceId: string | undefined;
  try {
    const storage = new FakeStorage();
    const cvWorker = buildProcessingWorker(
      async () => fakeCanonicalOutput(marker),
      storage,
    );
    const entrypoint = buildEntrypoint(storage);
    const { client, capturedMessages } = buildCapturingAiClient(
      minimalAnalysisJson,
      minimalGenerationJson,
    );
    const service = buildRealCvAdaptationService(client, client, entrypoint);
    const analysisWorker = buildAnalysisWorker(service);

    const sessionPublicToken = `${runId}-session-${randomUUID()}`;

    const started = await service.startGuestAnalysisJob(
      `${JOB_DESCRIPTION_BASE} ${runId}`,
      undefined,
      buildCvText(marker, "atendimento"),
      undefined,
      { sessionPublicToken } as never,
    );
    const row = await database.analysisJob.findUniqueOrThrow({
      where: { id: started.jobId },
    });
    assert.ok(row.cvProcessingJobId, "guest deveria ter entrado no pipeline novo (flag global ligada)");
    const cvJobRow = await processOneCvJob(cvWorker, row.cvProcessingJobId as string);
    cvSourceId = cvJobRow.cvSourceId;
    await processOneAnalysisJob(analysisWorker, started.jobId);

    assert.equal(capturedMessages.length, 1);
    const payload = allMessageContent(capturedMessages[0]);
    assert.match(payload, new RegExp(marker));
  } finally {
    if (cvSourceId) {
      const source = await database.cvSource.findUnique({ where: { id: cvSourceId } });
      await database.analysisJob.deleteMany({
        where: { jobDescriptionText: { contains: runId } },
      });
      if (source?.talentSubjectId) {
        await prisma.cvMasterDesignation.deleteMany({
          where: { talentSubjectId: source.talentSubjectId },
        });
        await prisma.talentProfile.deleteMany({
          where: { talentSubjectId: source.talentSubjectId },
        });
      }
      await database.cvSource.deleteMany({ where: { id: cvSourceId } });
      if (source?.talentSubjectId) {
        await prisma.talentSubject.deleteMany({ where: { id: source.talentSubjectId } });
      }
    }
  }
});

test("FLAGS 7/8: allowlist de userId vazia e variável ausente -> nunca ligam sozinhas", async () => {
  const previousUserAllowlist =
    process.env.CV_STRUCTURED_PROFILE_PIPELINE_ALLOWLIST_USER_IDS;
  try {
    // 7: allowlist vazia (string vazia).
    process.env.CV_STRUCTURED_PROFILE_PIPELINE_ALLOWLIST_USER_IDS = "";
    const { isUserIdInPipelineAllowlist } = await import(
      "../cv-processing/cv-processing-flag-resolver.service"
    );
    assert.equal(isUserIdInPipelineAllowlist("qualquer-id"), false);

    // 8: variável totalmente ausente.
    delete process.env.CV_STRUCTURED_PROFILE_PIPELINE_ALLOWLIST_USER_IDS;
    assert.equal(isUserIdInPipelineAllowlist("qualquer-id"), false);
  } finally {
    process.env.CV_STRUCTURED_PROFILE_PIPELINE_ALLOWLIST_USER_IDS =
      previousUserAllowlist;
  }
});

test("FLAGS 10: alterar a flag DEPOIS de criar AnalysisJob/CvAdaptation não muda a linhagem histórica", async () => {
  const runId = makeRunId("flags-10");
  const artifacts = new RunArtifacts();
  const previousFlag = process.env.CV_STRUCTURED_PROFILE_PIPELINE_ENABLED;
  try {
    const user = await createUser(runId, artifacts);
    const storage = new FakeStorage();
    const cvWorker = buildProcessingWorker(
      async () => fakeCanonicalOutput(`${runId} ORIGEM`),
      storage,
    );
    const entrypoint = buildEntrypoint(storage);
    const { client } = buildCapturingAiClient(
      minimalAnalysisJson,
      minimalGenerationJson,
    );
    const service = buildRealCvAdaptationService(client, client, entrypoint);
    const analysisWorker = buildAnalysisWorker(service);

    const started = await service.startAuthenticatedAnalysisJob(user.id, {
      jobDescriptionText: `${JOB_DESCRIPTION_BASE} ${runId}`,
      masterCvText: buildCvText(`${runId} ORIGEM`, "dados"),
    });
    const row = await database.analysisJob.findUniqueOrThrow({
      where: { id: started.jobId },
    });
    await processOneCvJob(cvWorker, row.cvProcessingJobId as string);
    await processOneAnalysisJob(analysisWorker, started.jobId);

    process.env.CV_STRUCTURED_PROFILE_PIPELINE_ENABLED = "false";
    const rowAfterFlagChange = await database.analysisJob.findUniqueOrThrow({
      where: { id: started.jobId },
    });
    assert.ok(
      rowAfterFlagChange.cvProcessingJobId,
      "desligar a flag depois não pode apagar a linhagem já persistida",
    );
    assert.equal(rowAfterFlagChange.status, "succeeded");
  } finally {
    process.env.CV_STRUCTURED_PROFILE_PIPELINE_ENABLED = previousFlag;
    await cleanupRunArtifacts(database, artifacts);
  }
});
