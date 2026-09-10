// Testes permanentes — seções 6 e 7 da 2ª rodada da auditoria adversarial
// (2026-09-08): ressalva de ensureLegacyStructuredOutput (nunca cair
// silenciosamente pro texto por erro de integridade) e integridade
// CONTÍNUA succeeded -> READY (a auditoria anterior conseguiu corromper o
// estado depois do sucesso — este arquivo formaliza cada tentativa de
// corrupção como teste permanente, classificando PROVADA/VIOLADA). Postgres
// real (earlycv_test), limpeza por runId em finally.
process.env.CV_STRUCTURED_PROFILE_PIPELINE_ENABLED = "true";
process.env.SKIP_AI = "false";

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";

import { BadRequestException } from "@nestjs/common";
import {
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

// Monta uma análise canônica READY + CvAdaptation materializada — ponto de
// partida comum pros testes abaixo.
async function setupReadyAdaptation(runId: string, artifacts: RunArtifacts) {
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
  const setupRow = await database.analysisJob.findUniqueOrThrow({
    where: { id: started.jobId },
  });
  await processOneCvJob(cvWorker, setupRow.cvProcessingJobId as string);
  const finalJob = await processOneAnalysisJob(analysisWorker, started.jobId);
  assert.equal(finalJob.status, "succeeded");

  const claimResult = await service.claimGuestAnalysisJob(
    user.id,
    started.jobId,
  );
  assert.equal(claimResult.status, "succeeded");
  if (claimResult.status !== "succeeded") throw new Error("unreachable");

  return { user, service, finalJob, claimResult };
}

// Constrói uma árvore mínima e coerente CvSource -> CvSubmission ->
// CvProcessingJob(READY, cvStructuredProfileId=profile) -> CvStructuredProfile
// READY, sem passar pelo worker/service — usado pelos testes de linhagem
// (seção "LINHAGEM") pra criar rapidamente perfis READY de outros
// donos/análises com quem corromper um AnalysisJob real.
async function buildCoherentReadyChain(
  runId: string,
  owner: { userId: string } | { talentSubjectId: string },
): Promise<{ cvSourceId: string; cvProcessingJobId: string; cvStructuredProfileId: string }> {
  const cvSource = await prisma.cvSource.create({
    data: {
      ownerType: "userId" in owner ? "USER" : "GUEST",
      userId: "userId" in owner ? owner.userId : null,
      talentSubjectId: "talentSubjectId" in owner ? owner.talentSubjectId : null,
      textStorageKey: `${runId}/${randomUUID()}.txt`,
      textSha256: `${runId}-${randomUUID()}`,
    },
  });
  const submission = await prisma.cvSubmission.create({
    data: { cvSourceId: cvSource.id, origin: "PASTED_TEXT" },
  });
  const profile = await prisma.cvStructuredProfile.create({
    data: {
      cvSourceId: cvSource.id,
      extractorVersion: `v-${randomUUID()}`,
      schemaVersion: "v1",
      status: "READY",
      canonicalJson: fakeCanonicalOutput(`${runId} coerente`).canonicalProfile as never,
    },
  });
  const cvJob = await prisma.cvProcessingJob.create({
    data: {
      cvSourceId: cvSource.id,
      cvSubmissionId: submission.id,
      status: "READY",
      cvStructuredProfileId: profile.id,
    },
  });
  return {
    cvSourceId: cvSource.id,
    cvProcessingJobId: cvJob.id,
    cvStructuredProfileId: profile.id,
  };
}

async function loadAdaptationForGeneration(cvAdaptationId: string) {
  return database.cvAdaptation.findUniqueOrThrow({
    where: { id: cvAdaptationId },
    include: { masterResume: { select: { rawText: true } } },
  });
}

// ===========================================================================
// Seção 6 — ressalva de ensureLegacyStructuredOutput.
// ===========================================================================

test("RESSALVA 1: FK canônica ausente (cvStructuredProfileId null, linhagem exige) — BadRequestException relançada, nunca null/fallback", async () => {
  const runId = makeRunId("ressalva-1");
  const artifacts = new RunArtifacts();
  try {
    const { service, claimResult } = await setupReadyAdaptation(
      runId,
      artifacts,
    );
    await database.cvAdaptation.update({
      where: { id: claimResult.cvAdaptationId },
      data: { cvStructuredProfileId: null },
    });
    const adaptation = await loadAdaptationForGeneration(
      claimResult.cvAdaptationId,
    );

    await assert.rejects(
      () =>
        (
          service as unknown as {
            ensureLegacyStructuredOutput: (a: typeof adaptation) => Promise<unknown>;
          }
        ).ensureLegacyStructuredOutput(adaptation),
      (err: unknown) => err instanceof BadRequestException,
    );
  } finally {
    await cleanupRunArtifacts(database, artifacts);
  }
});

test("RESSALVA 2: CvStructuredProfile FAILED — BadRequestException relançada, nunca null/fallback", async () => {
  const runId = makeRunId("ressalva-2");
  const artifacts = new RunArtifacts();
  try {
    const { service, claimResult, finalJob } = await setupReadyAdaptation(
      runId,
      artifacts,
    );
    // Achado desta rodada (migration 20260908210000): READY -> FAILED é
    // bloqueado pelo próprio banco (READY é terminal) — não dá mais pra
    // simular este estado via UPDATE num profile que já foi READY. A única
    // forma real é nascer FAILED (nunca chegou a READY) — constrói essa
    // árvore do zero, mantendo a MESMA linhagem coerente exigida pela
    // trigger de ownership (CvProcessingJob.cvStructuredProfileId aponta
    // pra este profile FAILED, e o repontamos ali também).
    const originalProfile = await database.cvStructuredProfile.findUniqueOrThrow(
      { where: { id: finalJob.cvStructuredProfileId as string } },
    );
    const originalSource = await database.cvSource.findUniqueOrThrow({
      where: { id: originalProfile.cvSourceId },
    });
    const failedProfile = await prisma.cvStructuredProfile.create({
      data: {
        cvSourceId: originalSource.id,
        extractorVersion: "v2-failed",
        schemaVersion: "v1",
        status: "FAILED",
      },
    });

    const adaptation = await loadAdaptationForGeneration(
      claimResult.cvAdaptationId,
    );
    (adaptation as { cvStructuredProfileId: string | null }).cvStructuredProfileId =
      failedProfile.id;

    await assert.rejects(
      () =>
        (
          service as unknown as {
            ensureLegacyStructuredOutput: (a: typeof adaptation) => Promise<unknown>;
          }
        ).ensureLegacyStructuredOutput(adaptation),
      (err: unknown) => err instanceof BadRequestException,
    );
  } finally {
    await cleanupRunArtifacts(database, artifacts);
  }
});

test("RESSALVA 3a: tentar mudar canonicalJson de um perfil já READY — o PRÓPRIO BANCO rejeita (trigger reject_ready_profile_mutation), nunca chega a existir esse estado", async () => {
  const runId = makeRunId("ressalva-3a");
  const artifacts = new RunArtifacts();
  try {
    const { finalJob } = await setupReadyAdaptation(runId, artifacts);
    // Achado desta rodada: UPDATE em canonicalJson de um perfil READY é
    // bloqueado por trigger de banco (migration 20260904220951,
    // reject_ready_profile_mutation) — mais forte do que a auditoria
    // anterior presumiu. A proteção real contra "READY sem canonicalJson"
    // é estrutural: nunca é possível corromper um perfil já READY por
    // UPDATE; só resta a possibilidade de nascer assim (ver RESSALVA 3b).
    await assert.rejects(
      () =>
        database.cvStructuredProfile.update({
          where: { id: finalJob.cvStructuredProfileId as string },
          data: { canonicalJson: undefined, coverageJson: null },
        }),
      /immutable once READY/,
    );
  } finally {
    await cleanupRunArtifacts(database, artifacts);
  }
});

test("RESSALVA 3b: CvStructuredProfile READY nascendo com canonicalJson null (via INSERT direto) — ensureLegacyStructuredOutput relança BadRequestException", async () => {
  const runId = makeRunId("ressalva-3b");
  const artifacts = new RunArtifacts();
  try {
    const { service, claimResult, finalJob } = await setupReadyAdaptation(
      runId,
      artifacts,
    );
    // O trigger reject_ready_profile_mutation só olha UPDATE (OLD.status =
    // 'READY') — não bloqueia um INSERT que já nasça READY+null. É a única
    // forma real de reproduzir este estado; usa o MESMO cvSourceId do
    // profile original (evita nova árvore de CvSource só pra este teste).
    const originalProfile = await database.cvStructuredProfile.findUniqueOrThrow(
      { where: { id: finalJob.cvStructuredProfileId as string } },
    );
    // CvSource próprio (evita colidir com o índice único
    // [cvSourceId, extractorVersion, schemaVersion] do profile original).
    const extraSource = await prisma.cvSource.create({
      data: {
        ownerType: "USER",
        userId: (await database.cvSource.findUniqueOrThrow({
          where: { id: originalProfile.cvSourceId },
        })).userId,
        textStorageKey: `${runId}/corrupt-source.txt`,
        textSha256: `${runId}-corrupt-hash`,
      },
    });
    const corruptProfile = await prisma.cvStructuredProfile.create({
      data: {
        cvSourceId: extraSource.id,
        extractorVersion: "v1",
        schemaVersion: "v1",
        status: "READY",
        canonicalJson: undefined,
      },
    });
    // Não persiste o repontamento via database.cvAdaptation.update — desde
    // a migration 20260908211500, isso violaria a trigger de linhagem
    // (CvAdaptation.cvStructuredProfileId precisa bater com o AnalysisJob
    // que a converteu). Muta só o objeto em memória passado pro método —
    // o alvo deste teste é o comportamento de ensureLegacyStructuredOutput
    // diante de um profile READY com canonicalJson nulo, não a escrita.
    const adaptation = await loadAdaptationForGeneration(
      claimResult.cvAdaptationId,
    );
    (adaptation as { cvStructuredProfileId: string | null }).cvStructuredProfileId =
      corruptProfile.id;

    await assert.rejects(
      () =>
        (
          service as unknown as {
            ensureLegacyStructuredOutput: (a: typeof adaptation) => Promise<unknown>;
          }
        ).ensureLegacyStructuredOutput(adaptation),
      (err: unknown) => err instanceof BadRequestException,
    );
  } finally {
    await cleanupRunArtifacts(database, artifacts);
  }
});

test("RESSALVA 4: erro real de IA/rede na geração — comportamento documentado é engolir (retorna null), nunca relança, nunca falha pro chamador HTTP", async () => {
  const runId = makeRunId("ressalva-4");
  const artifacts = new RunArtifacts();
  try {
    const { claimResult } = await setupReadyAdaptation(runId, artifacts);

    // Constrói um service SEPARADO cujo client de geração sempre lança —
    // simula falha real de rede/IA (não um erro de integridade).
    const storage = new FakeStorage();
    const entrypoint = buildEntrypoint(storage);
    const throwingClient = {
      chat: {
        completions: {
          create: async () => {
            throw new Error("simulated network failure");
          },
        },
      },
    };
    const service = buildRealCvAdaptationService(
      throwingClient,
      throwingClient,
      entrypoint,
    );

    const adaptation = await loadAdaptationForGeneration(
      claimResult.cvAdaptationId,
    );
    const output = await (
      service as unknown as {
        ensureLegacyStructuredOutput: (a: typeof adaptation) => Promise<unknown>;
      }
    ).ensureLegacyStructuredOutput(adaptation);
    assert.equal(
      output,
      null,
      "erro de rede/IA (não BadRequestException) deve ser engolido e retornar null — comportamento documentado, distinto de erro de integridade",
    );
  } finally {
    await cleanupRunArtifacts(database, artifacts);
  }
});

test("RESSALVA 5: fluxo legado (sem AnalysisJob de origem) continua podendo usar snapshot textual — nunca quebrado pela correção de linhagem", async () => {
  const runId = makeRunId("ressalva-5");
  const artifacts = new RunArtifacts();
  try {
    const user = await createUser(runId, artifacts);
    const storage = new FakeStorage();
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

    const resume = await prisma.resume.create({
      data: {
        userId: user.id,
        title: `${runId} Master legado`,
        isMaster: true,
        rawText: `${runId} Legado puro`,
      },
    });
    const snapshotText = `${runId} ${buildCvText("Legado puro", "vendas")}`;
    const textStorageKey = `analysis-cv-snapshots/text/${randomUUID()}.md`;
    await storage.putObject(textStorageKey, Buffer.from(snapshotText, "utf8"));
    const { createHash } = await import("node:crypto");
    const snapshot = await prisma.analysisCvSnapshot.create({
      data: {
        userId: user.id,
        sourceType: "master_resume",
        textStorageKey,
        textSha256: createHash("sha256").update(snapshotText).digest("hex"),
        textSizeBytes: Buffer.byteLength(snapshotText),
        professionalProfileFingerprint: `${runId}-fp`,
        professionalProfileJson: {},
        cvStructuredProfileId: null,
      },
    });
    const legacyAdaptation = await prisma.cvAdaptation.create({
      data: {
        userId: user.id,
        masterResumeId: resume.id,
        jobDescriptionText: `${JOB_DESCRIPTION_BASE} ${runId}`,
        analysisCvSnapshotId: snapshot.id,
        status: "pending",
        paymentStatus: "none",
      },
    });

    const adaptation = await loadAdaptationForGeneration(legacyAdaptation.id);
    const output = await (
      service as unknown as {
        ensureLegacyStructuredOutput: (a: typeof adaptation) => Promise<unknown>;
      }
    ).ensureLegacyStructuredOutput(adaptation);
    assert.ok(output, "fluxo legado sem AnalysisJob de origem precisa continuar funcionando via snapshot textual");
  } finally {
    await cleanupRunArtifacts(database, artifacts);
  }
});

// ===========================================================================
// Seção 7 — integridade CONTÍNUA succeeded -> READY. A auditoria anterior
// conseguiu corromper o estado depois do sucesso — cada corrupção abaixo é
// tentada explicitamente e classificada. Estado é sempre restaurado/limpo,
// mesmo quando a corrupção é aceita.
// ===========================================================================

test("CONTINUIDADE 1 (corrigido nesta rodada): READY -> FAILED depois de AnalysisJob succeeded — o banco REJEITA (READY é terminal); classificado PROVADA", async () => {
  const runId = makeRunId("cont-1");
  const artifacts = new RunArtifacts();
  try {
    const { finalJob } = await setupReadyAdaptation(runId, artifacts);
    // Achado da 1ª tentativa desta rodada, corrigido na migration
    // 20260908210000 (reject_ready_profile_mutation estendida pra incluir
    // status): READY -> FAILED agora é bloqueado no próprio banco.
    await assert.rejects(
      () =>
        database.cvStructuredProfile.update({
          where: { id: finalJob.cvStructuredProfileId as string },
          data: { status: "FAILED" },
        }),
      /immutable once READY/,
    );
    const reread = await database.cvStructuredProfile.findUniqueOrThrow({
      where: { id: finalJob.cvStructuredProfileId as string },
    });
    assert.equal(reread.status, "READY", "READY precisa permanecer READY — terminal");
  } finally {
    await cleanupRunArtifacts(database, artifacts);
  }
});

test("CONTINUIDADE 2 (corrigido nesta rodada): READY -> PROCESSING depois de succeeded — o banco REJEITA; classificado PROVADA", async () => {
  const runId = makeRunId("cont-2");
  const artifacts = new RunArtifacts();
  try {
    const { finalJob } = await setupReadyAdaptation(runId, artifacts);
    await assert.rejects(
      () =>
        database.cvStructuredProfile.update({
          where: { id: finalJob.cvStructuredProfileId as string },
          data: { status: "PROCESSING" },
        }),
      /immutable once READY/,
    );
    const reread = await database.cvStructuredProfile.findUniqueOrThrow({
      where: { id: finalJob.cvStructuredProfileId as string },
    });
    assert.equal(reread.status, "READY");
  } finally {
    await cleanupRunArtifacts(database, artifacts);
  }
});

test("CONTINUIDADE 2b: READY -> PENDING também é rejeitado (mesma proteção, terceiro valor do enum)", async () => {
  const runId = makeRunId("cont-2b");
  const artifacts = new RunArtifacts();
  try {
    const { finalJob } = await setupReadyAdaptation(runId, artifacts);
    await assert.rejects(
      () =>
        database.cvStructuredProfile.update({
          where: { id: finalJob.cvStructuredProfileId as string },
          data: { status: "PENDING" },
        }),
      /immutable once READY/,
    );
  } finally {
    await cleanupRunArtifacts(database, artifacts);
  }
});

test("CONTINUIDADE 3a: exclusão do CvStructuredProfile que TAMBÉM é o perfil do Master ativo — o banco REJEITA (RESTRICT via CvMasterDesignation); classificado PROVADA (proteção incidental)", async () => {
  const runId = makeRunId("cont-3a");
  const artifacts = new RunArtifacts();
  try {
    const { finalJob } = await setupReadyAdaptation(runId, artifacts);
    const profileId = finalJob.cvStructuredProfileId as string;
    // Achado desta rodada: a primeira análise autenticada promove Master
    // automaticamente (PROMOTE_IF_FIRST) — este profile também é o da
    // CvMasterDesignation ativa, cuja FK é RESTRICT. A proteção aqui é
    // INCIDENTAL (via Master), não uma proteção direta "referenciado por
    // AnalysisJob succeeded" — ver CONTINUIDADE 3b pro caso sem Master.
    await assert.rejects(
      () => database.cvStructuredProfile.delete({ where: { id: profileId } }),
      /CvMasterDesignation_cvStructuredProfileId_fkey/,
    );
  } finally {
    await cleanupRunArtifacts(database, artifacts);
  }
});

test("CONTINUIDADE 3b: exclusão do CvStructuredProfile de um CV NÃO-Master (masterIntent NONE) referenciado por AnalysisJob succeeded — o banco REJEITA (SetNull dispara o trigger de AnalysisJob); classificado PROVADA", async () => {
  const runId = makeRunId("cont-3b");
  const artifacts = new RunArtifacts();
  try {
    const user = await createUser(runId, artifacts);
    const storage = new FakeStorage();
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

    // Master A primeiro (pra existir Master ativo apontando pra OUTRO
    // profile), depois CV B com masterIntent NONE — B nunca vira Master,
    // então seu CvStructuredProfile não tem nenhuma CvMasterDesignation
    // apontando pra ele.
    const cvWorkerA = buildProcessingWorker(
      async () => fakeCanonicalOutput(`${runId} A`),
      storage,
    );
    const setupA = await service.startAuthenticatedAnalysisJob(user.id, {
      jobDescriptionText: `${JOB_DESCRIPTION_BASE} ${runId} a`,
      masterCvText: buildCvText(`${runId} A`, "dados"),
    });
    const rowA = await database.analysisJob.findUniqueOrThrow({
      where: { id: setupA.jobId },
    });
    await processOneCvJob(cvWorkerA, rowA.cvProcessingJobId as string);
    await processOneAnalysisJob(analysisWorker, setupA.jobId);

    const cvWorkerB = buildProcessingWorker(
      async () => fakeCanonicalOutput(`${runId} B`),
      storage,
    );
    const setupB = await service.startAuthenticatedAnalysisJob(user.id, {
      jobDescriptionText: `${JOB_DESCRIPTION_BASE} ${runId} b`,
      masterCvText: buildCvText(`${runId} B`, "vendas"),
      saveAsMaster: false,
    });
    const rowB = await database.analysisJob.findUniqueOrThrow({
      where: { id: setupB.jobId },
    });
    await processOneCvJob(cvWorkerB, rowB.cvProcessingJobId as string);
    const finalB = await processOneAnalysisJob(analysisWorker, setupB.jobId);
    assert.equal(finalB.status, "succeeded");

    const profileId = finalB.cvStructuredProfileId as string;
    // Achado desta rodada: mesmo sem a proteção incidental do Master, a
    // exclusão continua bloqueada — o SetNull que a FK faria na coluna
    // AnalysisJob.cvStructuredProfileId conta como UPDATE na linha do
    // AnalysisJob pro Postgres, o que dispara
    // trg_analysis_job_succeeded_requires_ready_profile de novo (ela roda
    // em QUALQUER UPDATE, não só o explícito) — que rejeita
    // cvStructuredProfileId nulo numa linha succeeded do pipeline novo.
    await assert.rejects(
      () => database.cvStructuredProfile.delete({ where: { id: profileId } }),
      /exige cvStructuredProfileId preenchido/,
    );
    const rereadJob = await database.analysisJob.findUniqueOrThrow({
      where: { id: finalB.id },
    });
    assert.equal(rereadJob.cvStructuredProfileId, profileId);
    assert.equal(rereadJob.status, "succeeded");
  } finally {
    await cleanupRunArtifacts(database, artifacts);
  }
});

test("CONTINUIDADE 4: remoção manual da FK (cvStructuredProfileId = null) num AnalysisJob succeeded — o banco REJEITA (trigger); classificado PROVADA", async () => {
  const runId = makeRunId("cont-4");
  const artifacts = new RunArtifacts();
  try {
    const { finalJob } = await setupReadyAdaptation(runId, artifacts);
    // Achado desta rodada: trg_analysis_job_succeeded_requires_ready_profile
    // dispara em QUALQUER UPDATE (não só na transição pra succeeded) —
    // revalida a cada escrita que a linha continua succeeded+cvProcessingJobId
    // preenchido => cvStructuredProfileId não pode ficar null.
    await assert.rejects(
      () =>
        database.analysisJob.update({
          where: { id: finalJob.id },
          data: { cvStructuredProfileId: null },
        }),
      /exige cvStructuredProfileId preenchido/,
    );
  } finally {
    await cleanupRunArtifacts(database, artifacts);
  }
});

test("CONTINUIDADE 5 (corrigido nesta rodada): repontar cvStructuredProfileId pra um perfil de OUTRO usuário — o banco REJEITA; classificado PROVADA", async () => {
  const runId = makeRunId("cont-5");
  const artifacts = new RunArtifacts();
  try {
    const first = await setupReadyAdaptation(`${runId}-a`, artifacts);
    const second = await setupReadyAdaptation(`${runId}-b`, artifacts);

    // Achado original desta rodada: nada impedia isso. Corrigido pela
    // migration 20260908211500 (ver também LINHAGEM 1, mesma checagem).
    await assert.rejects(
      () =>
        database.analysisJob.update({
          where: { id: first.finalJob.id },
          data: { cvStructuredProfileId: second.finalJob.cvStructuredProfileId },
        }),
      /não corresponde ao CvStructuredProfile produzido pelo seu CvProcessingJob/,
    );
    const reread = await database.analysisJob.findUniqueOrThrow({
      where: { id: first.finalJob.id },
    });
    assert.equal(
      reread.cvStructuredProfileId,
      first.finalJob.cvStructuredProfileId,
      "PROVADA: reapontar pra um perfil de outro usuário/análise agora é rejeitado — linhagem permanece a original",
    );
  } finally {
    await cleanupRunArtifacts(database, artifacts);
  }
});

test("CONTINUIDADE 6: múltiplas análises referenciando o MESMO perfil — comportamento ESPERADO (reuso de Master), não é corrupção", async () => {
  const runId = makeRunId("cont-6");
  const artifacts = new RunArtifacts();
  try {
    const { user, finalJob } = await setupReadyAdaptation(runId, artifacts);
    // Segunda análise autenticada do MESMO usuário, sem novo conteúdo —
    // reusa o Master (inputMode profile) — deve legitimamente apontar pro
    // MESMO cvStructuredProfileId.
    const storage = new FakeStorage();
    const entrypoint = buildEntrypoint(storage);
    const { client } = buildCapturingAiClient(
      minimalAnalysisJson,
      minimalGenerationJson,
    );
    const service = buildRealCvAdaptationService(client, client, entrypoint);
    const analysisWorker = buildAnalysisWorker(service);

    const second = await service.startAuthenticatedAnalysisJob(user.id, {
      jobDescriptionText: `${JOB_DESCRIPTION_BASE} ${runId} segunda`,
      inputMode: "profile",
    } as never);
    const finalSecond = await processOneAnalysisJob(analysisWorker, second.jobId);
    assert.equal(finalSecond.status, "succeeded");
    assert.equal(
      finalSecond.cvStructuredProfileId,
      finalJob.cvStructuredProfileId,
      "reuso legítimo do Master — duas análises apontando pro mesmo perfil READY é esperado, não uma corrupção",
    );
  } finally {
    await cleanupRunArtifacts(database, artifacts);
  }
});

// ===========================================================================
// Seção 3 (item 3 da correção pós-2ª-rodada) — linhagem e ownership da FK.
// A trigger antiga só verificava "existe um CvStructuredProfile READY";
// agora (migration 20260908211500) verifica que é o perfil PRODUZIDO pelo
// próprio CvProcessingJob da análise e que o dono bate (ou tem
// ClaimSourceGrant válido). Cada teste isola uma dimensão do achado.
// ===========================================================================

test("LINHAGEM 1: repontar pra um profile READY de OUTRO usuário (linhagem coerente, ownership errado) — banco rejeita", async () => {
  const runId = makeRunId("linhagem-1");
  const artifacts = new RunArtifacts();
  try {
    const { user: userA, finalJob } = await setupReadyAdaptation(runId, artifacts);
    const userB = await createUser(`${runId}-b`, artifacts);
    const chainB = await buildCoherentReadyChain(runId, { userId: userB.id });

    await assert.rejects(
      () =>
        database.analysisJob.update({
          where: { id: finalJob.id },
          data: {
            cvProcessingJobId: chainB.cvProcessingJobId,
            cvStructuredProfileId: chainB.cvStructuredProfileId,
          },
        }),
      /não é dono do CvSource/,
    );
    void userA;
  } finally {
    await cleanupRunArtifacts(database, artifacts);
  }
});

test("LINHAGEM 2: repontar pra um profile READY de OUTRO guest (TalentSubject diferente) — banco rejeita", async () => {
  const runId = makeRunId("linhagem-2");
  const artifacts = new RunArtifacts();
  try {
    const subjectA = await prisma.talentSubject.create({ data: {} });
    const subjectB = await prisma.talentSubject.create({ data: {} });
    artifacts.trackTalentSubject(subjectA.id);
    artifacts.trackTalentSubject(subjectB.id);

    const hashA = `${runId}-guest-a-hash`;
    await prisma.talentSubjectSessionSignal.create({
      data: { talentSubjectId: subjectA.id, guestSessionHash: hashA },
    });

    const chainA = await buildCoherentReadyChain(runId, { talentSubjectId: subjectA.id });
    const chainB = await buildCoherentReadyChain(runId, { talentSubjectId: subjectB.id });
    const submission = await prisma.cvSubmission.findFirstOrThrow({
      where: { cvSourceId: chainA.cvSourceId },
    });

    const guestJob = await prisma.analysisJob.create({
      data: {
        ownerKind: "guest",
        userId: null,
        guestSessionHash: hashA,
        jobDescriptionText: `${JOB_DESCRIPTION_BASE} ${runId}`,
        status: "pending",
        cvProcessingJobId: chainA.cvProcessingJobId,
        cvSubmissionId: submission.id,
      },
    });

    await assert.rejects(
      () =>
        database.analysisJob.update({
          where: { id: guestJob.id },
          data: {
            status: "succeeded",
            cvProcessingJobId: chainB.cvProcessingJobId,
            cvStructuredProfileId: chainB.cvStructuredProfileId,
          },
        }),
      /não corresponde ao TalentSubject dono do CvSource/,
    );
  } finally {
    await database.analysisJob.deleteMany({
      where: { jobDescriptionText: { contains: runId } },
    });
    await cleanupRunArtifacts(database, artifacts);
  }
});

test("LINHAGEM 3: profile diferente do produzido pelo PRÓPRIO CvProcessingJob (mesmo dono, mesmo usuário) — banco rejeita", async () => {
  const runId = makeRunId("linhagem-3");
  const artifacts = new RunArtifacts();
  try {
    const { user, finalJob } = await setupReadyAdaptation(runId, artifacts);
    // Segundo perfil READY do MESMO usuário, produzido por um
    // CvProcessingJob DIFERENTE — válido, do dono certo, mas não é o que
    // ESTE AnalysisJob deveria referenciar.
    const otherChain = await buildCoherentReadyChain(runId, { userId: user.id });

    await assert.rejects(
      () =>
        database.analysisJob.update({
          where: { id: finalJob.id },
          // cvProcessingJobId NÃO muda — continua apontando pro job
          // original, só o cvStructuredProfileId é trocado.
          data: { cvStructuredProfileId: otherChain.cvStructuredProfileId },
        }),
      /não corresponde ao CvStructuredProfile produzido pelo seu CvProcessingJob/,
    );
  } finally {
    await cleanupRunArtifacts(database, artifacts);
  }
});

test("LINHAGEM 4: AnalysisCvSnapshot.cvStructuredProfileId diferente do AnalysisJob que a referencia — banco rejeita (mesma transação)", async () => {
  const runId = makeRunId("linhagem-4");
  const artifacts = new RunArtifacts();
  try {
    const { user, finalJob } = await setupReadyAdaptation(runId, artifacts);
    const otherChain = await buildCoherentReadyChain(runId, { userId: user.id });

    await assert.rejects(
      () =>
        prisma.$transaction(async (tx) => {
          const snapshot = await tx.analysisCvSnapshot.create({
            data: {
              userId: user.id,
              sourceType: "master_resume",
              textStorageKey: `${runId}/snapshot.md`,
              textSha256: `${runId}-snapshot-hash`,
              textSizeBytes: 10,
              professionalProfileFingerprint: `${runId}-fp`,
              professionalProfileJson: {},
              cvStructuredProfileId: otherChain.cvStructuredProfileId,
            },
          });
          await tx.analysisJob.update({
            where: { id: finalJob.id },
            data: { analysisCvSnapshotId: snapshot.id },
          });
        }),
      /AnalysisCvSnapshot\.cvStructuredProfileId .* diverge do AnalysisJob/,
    );
  } finally {
    await cleanupRunArtifacts(database, artifacts);
  }
});

test("LINHAGEM 5: CvAdaptation.cvStructuredProfileId diferente do AnalysisJob que a converteu — banco rejeita (mesma transação)", async () => {
  const runId = makeRunId("linhagem-5");
  const artifacts = new RunArtifacts();
  try {
    const { user, finalJob } = await setupReadyAdaptation(runId, artifacts);
    const otherChain = await buildCoherentReadyChain(runId, { userId: user.id });

    await assert.rejects(
      () =>
        prisma.$transaction(async (tx) => {
          const adaptation = await tx.cvAdaptation.create({
            data: {
              userId: user.id,
              jobDescriptionText: `${JOB_DESCRIPTION_BASE} ${runId}`,
              status: "delivered",
              cvStructuredProfileId: otherChain.cvStructuredProfileId,
            },
          });
          await tx.analysisJob.update({
            where: { id: finalJob.id },
            data: { convertedCvAdaptationId: adaptation.id, convertedAt: new Date() },
          });
        }),
      /CvAdaptation\.cvStructuredProfileId .* diverge do AnalysisJob/,
    );
  } finally {
    await cleanupRunArtifacts(database, artifacts);
  }
});

test("LINHAGEM 6: profile referenciado existe e a linhagem bate, mas NÃO está READY (ainda PROCESSING) — banco rejeita", async () => {
  const runId = makeRunId("linhagem-6");
  const artifacts = new RunArtifacts();
  try {
    const user = await createUser(runId, artifacts);
    const cvSource = await prisma.cvSource.create({
      data: {
        ownerType: "USER",
        userId: user.id,
        textStorageKey: `${runId}/${randomUUID()}.txt`,
        textSha256: `${runId}-${randomUUID()}`,
      },
    });
    const submission = await prisma.cvSubmission.create({
      data: { cvSourceId: cvSource.id, origin: "PASTED_TEXT" },
    });
    const processingProfile = await prisma.cvStructuredProfile.create({
      data: {
        cvSourceId: cvSource.id,
        extractorVersion: "v1",
        schemaVersion: "v1",
        status: "PROCESSING",
      },
    });
    const cvJob = await prisma.cvProcessingJob.create({
      data: {
        cvSourceId: cvSource.id,
        cvSubmissionId: submission.id,
        status: "PROCESSING",
        cvStructuredProfileId: processingProfile.id,
      },
    });

    await assert.rejects(
      () =>
        prisma.analysisJob.create({
          data: {
            ownerKind: "authenticated",
            userId: user.id,
            jobDescriptionText: `${JOB_DESCRIPTION_BASE} ${runId}`,
            status: "succeeded",
            cvProcessingJobId: cvJob.id,
            cvStructuredProfileId: processingProfile.id,
            cvSubmissionId: submission.id,
          },
        }),
      /exige CvStructuredProfile READY/,
    );
  } finally {
    await database.analysisJob.deleteMany({
      where: { jobDescriptionText: { contains: runId } },
    });
    await cleanupRunArtifacts(database, artifacts);
  }
});

test("LINHAGEM 7: ClaimSourceGrant válido — usuário SEM ser dono direto do CvSource, mas com grant, é aceito", async () => {
  const runId = makeRunId("linhagem-7");
  const artifacts = new RunArtifacts();
  try {
    const guestSubject = await prisma.talentSubject.create({ data: {} });
    artifacts.trackTalentSubject(guestSubject.id);
    const chain = await buildCoherentReadyChain(runId, { talentSubjectId: guestSubject.id });
    const submission = await prisma.cvSubmission.findFirstOrThrow({
      where: { cvSourceId: chain.cvSourceId },
    });
    const userB = await createUser(runId, artifacts);
    await prisma.claimSourceGrant.create({
      data: {
        cvSourceId: chain.cvSourceId,
        userId: userB.id,
        provenByAnalysisJobId: "seed",
      },
    });

    const job = await prisma.analysisJob.create({
      data: {
        ownerKind: "authenticated",
        userId: userB.id,
        jobDescriptionText: `${JOB_DESCRIPTION_BASE} ${runId}`,
        status: "pending",
        cvProcessingJobId: chain.cvProcessingJobId,
        cvSubmissionId: submission.id,
      },
    });

    await database.analysisJob.update({
      where: { id: job.id },
      data: { status: "succeeded", cvStructuredProfileId: chain.cvStructuredProfileId },
    });
    const reread = await database.analysisJob.findUniqueOrThrow({ where: { id: job.id } });
    assert.equal(reread.status, "succeeded", "com grant válido, a análise pode suceder normalmente");
  } finally {
    await database.analysisJob.deleteMany({
      where: { jobDescriptionText: { contains: runId } },
    });
    await cleanupRunArtifacts(database, artifacts);
  }
});

test("LINHAGEM 8: mesmo cenário da 7, SEM ClaimSourceGrant — banco rejeita", async () => {
  const runId = makeRunId("linhagem-8");
  const artifacts = new RunArtifacts();
  try {
    const guestSubject = await prisma.talentSubject.create({ data: {} });
    artifacts.trackTalentSubject(guestSubject.id);
    const chain = await buildCoherentReadyChain(runId, { talentSubjectId: guestSubject.id });
    const submission = await prisma.cvSubmission.findFirstOrThrow({
      where: { cvSourceId: chain.cvSourceId },
    });
    const userB = await createUser(runId, artifacts);
    // Nenhum ClaimSourceGrant criado desta vez.

    const job = await prisma.analysisJob.create({
      data: {
        ownerKind: "authenticated",
        userId: userB.id,
        jobDescriptionText: `${JOB_DESCRIPTION_BASE} ${runId}`,
        status: "pending",
        cvProcessingJobId: chain.cvProcessingJobId,
        cvSubmissionId: submission.id,
      },
    });

    await assert.rejects(
      () =>
        database.analysisJob.update({
          where: { id: job.id },
          data: { status: "succeeded", cvStructuredProfileId: chain.cvStructuredProfileId },
        }),
      /não é dono do CvSource .* nem possui ClaimSourceGrant válido/,
    );
  } finally {
    await database.analysisJob.deleteMany({
      where: { jobDescriptionText: { contains: runId } },
    });
    await cleanupRunArtifacts(database, artifacts);
  }
});

test("LINHAGEM 9: violação via SQL direto (contornando o Prisma Client) — o banco rejeita igual", async () => {
  const runId = makeRunId("linhagem-9");
  const artifacts = new RunArtifacts();
  try {
    const { user, finalJob } = await setupReadyAdaptation(runId, artifacts);
    const otherChain = await buildCoherentReadyChain(runId, { userId: user.id });

    await assert.rejects(
      () =>
        prisma.$executeRawUnsafe(
          `UPDATE "AnalysisJob" SET "cvStructuredProfileId" = $1 WHERE id = $2`,
          otherChain.cvStructuredProfileId,
          finalJob.id,
        ),
      /não corresponde ao CvStructuredProfile produzido pelo seu CvProcessingJob/,
    );
  } finally {
    await cleanupRunArtifacts(database, artifacts);
  }
});

test("LINHAGEM 10: retry legítimo (reprocessar um AnalysisJob failed com a MESMA linhagem) continua funcionando", async () => {
  const runId = makeRunId("linhagem-10");
  const artifacts = new RunArtifacts();
  try {
    const { finalJob } = await setupReadyAdaptation(runId, artifacts);
    // Simula um retry: marca failed e depois succeeded de novo, com a
    // MESMA linhagem (cvProcessingJobId/cvStructuredProfileId inalterados)
    // — precisa continuar funcionando, nunca ser bloqueado pela correção.
    await database.analysisJob.update({
      where: { id: finalJob.id },
      data: { status: "failed", lastError: "retry simulado" },
    });
    await database.analysisJob.update({
      where: { id: finalJob.id },
      data: { status: "succeeded", lastError: null },
    });
    const reread = await database.analysisJob.findUniqueOrThrow({
      where: { id: finalJob.id },
    });
    assert.equal(reread.status, "succeeded");
    assert.equal(reread.cvStructuredProfileId, finalJob.cvStructuredProfileId);
  } finally {
    await cleanupRunArtifacts(database, artifacts);
  }
});
