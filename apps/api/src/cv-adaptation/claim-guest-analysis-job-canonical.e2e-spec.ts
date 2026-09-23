// Fase 2E (docs/specs/2026-09-04-cv-canonical-profile-pipeline-plan.md,
// seção 4) — testes reais de banco (Postgres local, earlycv_test) do
// BRANCHING dentro de CvAdaptationService#claimGuestAnalysisJob: com a
// flag ligada E a AnalysisJob tendo cvProcessingJobId preenchido, o claim
// granular novo (ClaimSourceGrantService) roda ALÉM do claim legado
// (saveGuestPreview); sem cvProcessingJobId (mesmo com a flag ligada), ou
// com a flag desligada, o caminho é 100% legado — o serviço novo nunca é
// chamado. cv-adaptation.service.spec.ts (108 testes, banco fake) já
// cobre o comportamento legado bit a bit com a flag desligada; este
// arquivo cobre especificamente a decisão condicional, com um double
// espião no lugar do ClaimSourceGrantService real (o comportamento
// interno dele já está coberto por claim-source-grant.service.spec.ts).
process.env.CV_STRUCTURED_PROFILE_PIPELINE_ENABLED = "true";

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";

import { PrismaClient } from "@prisma/client";

import { DatabaseService } from "../database/database.service";
import { MasterDesignationSubjectMismatchError } from "../cv-processing/cv-processing.errors";
import { CvAdaptationService } from "./cv-adaptation.service";

const CvAdaptationServiceCtor = CvAdaptationService as unknown as new (
  ...args: unknown[]
) => CvAdaptationService;

const prisma = new PrismaClient();
const database = new DatabaseService(prisma);

class ClaimSourceGrantSpy {
  calls: Array<{
    userId: string;
    analysisJobId: string;
    cvProcessingJobId: string;
  }> = [];

  async claim(input: {
    userId: string;
    analysisJobId: string;
    cvProcessingJobId: string;
  }) {
    this.calls.push(input);
    return {
      cvSourceId: "n/a",
      grantCreated: true,
      equivalence: null,
      subject: null,
      master: null,
    };
  }
}

// Achado real de produção (2026-09-22, bug do redirect pós-cadastro do
// radar): sem retry, uma única MasterDesignationSubjectMismatchError
// (erro de domínio que ClaimSourceGrantService#claim já traduz quando a
// trigger trg_master_designation_subject_match rejeita o commit — ver
// comentário lá) deixava AnalysisJob.userId reatribuído mas o claim
// granular nunca completo (nem grant, nem promoção de Master). Este double
// simula esse erro se repetindo `failTimes` vezes antes de finalmente
// suceder, pra exercitar o retry de claimGuestAnalysisJob.
class ClaimSourceGrantFlakySpy {
  calls = 0;

  constructor(private failTimes: number) {}

  async claim(_input: {
    userId: string;
    analysisJobId: string;
    cvProcessingJobId: string;
  }) {
    this.calls += 1;
    if (this.calls <= this.failTimes) {
      throw new MasterDesignationSubjectMismatchError(
        "simulado: trigger rejeitou o commit",
      );
    }
    return {
      cvSourceId: "n/a",
      grantCreated: true,
      equivalence: null,
      subject: null,
      master: null,
    };
  }
}

class ClaimSourceGrantAlwaysFailsSpy {
  calls = 0;

  async claim(_input: {
    userId: string;
    analysisJobId: string;
    cvProcessingJobId: string;
  }): Promise<never> {
    this.calls += 1;
    throw new MasterDesignationSubjectMismatchError(
      "simulado: trigger rejeitou o commit sempre",
    );
  }
}

class ClaimSourceGrantNonRecoverableSpy {
  calls = 0;

  async claim(_input: {
    userId: string;
    analysisJobId: string;
    cvProcessingJobId: string;
  }): Promise<never> {
    this.calls += 1;
    throw new Error("erro genérico, não é MasterDesignationSubjectMismatchError");
  }
}

function buildService(
  claimSourceGrantService:
    | ClaimSourceGrantSpy
    | ClaimSourceGrantFlakySpy
    | ClaimSourceGrantAlwaysFailsSpy
    | ClaimSourceGrantNonRecoverableSpy,
) {
  return new CvAdaptationServiceCtor(
    database, // database
    undefined, // _aiService
    undefined, // paymentService
    undefined, // pdfService
    undefined, // docxService
    undefined, // protectedAnalyzeService
    undefined, // storage
    undefined, // analysisTelemetry
    undefined, // jobApplicationsService
    undefined, // profileMergeService
    undefined, // profileReadinessService
    undefined, // jobCanonicalizationService
    undefined, // jobRequirementSetsService
    undefined, // talentProfileCapture
    undefined, // masterCvCanonicalExtractionService
    undefined, // funnelEvents
    undefined, // cvProcessingEntrypoint
    undefined, // cvMasterPromotionForAnalysis
    undefined, // talentSubjectService
    claimSourceGrantService, // claimSourceGrantService (Fase 2E)
  );
}

async function createUser() {
  return prisma.user.create({
    data: {
      email: `claim-canonical-branch+${randomUUID()}@example.com`,
      name: "Claim Canonical Branch Test",
    },
  });
}

async function createSucceededSnapshot() {
  return prisma.analysisCvSnapshot.create({
    data: {
      sourceType: "text_input",
      textStorageKey: `inline:${randomUUID()}`,
      textSha256: randomUUID(),
      textSizeBytes: 100,
      professionalProfileFingerprint: randomUUID(),
      professionalProfileJson: {},
    },
  });
}

async function createSucceededGuestAnalysisJob(input: {
  userId: string;
  snapshotId: string;
  cvProcessingJobId?: string;
  cvSubmissionId?: string;
  cvStructuredProfileId?: string;
}) {
  return prisma.analysisJob.create({
    data: {
      ownerKind: "guest",
      status: "succeeded",
      userId: input.userId,
      analysisCvSnapshotId: input.snapshotId,
      adaptedContentJson: { vaga: { cargo: "Analista", empresa: "Acme" } },
      previewText: "preview",
      masterCvText: "CV completo",
      jobDescriptionText:
        "Vaga com descricao suficientemente longa para passar na validacao interna.",
      jobTitle: "Analista",
      companyName: "Acme",
      cvProcessingJobId: input.cvProcessingJobId ?? null,
      cvSubmissionId: input.cvSubmissionId ?? null,
      // Obrigatório a partir da Fase 2F quando cvProcessingJobId está
      // preenchido — trigger trg_analysis_job_succeeded_requires_ready_profile
      // (migration 20260905131500) exige um CvStructuredProfile READY por
      // trás de todo AnalysisJob succeeded que passou pelo pipeline novo.
      cvStructuredProfileId: input.cvStructuredProfileId ?? null,
    },
  });
}

test("flag ligada + AnalysisJob SEM cvProcessingJobId: usa o caminho legado, ClaimSourceGrantService nunca é chamado", async () => {
  const user = await createUser();
  const snapshot = await createSucceededSnapshot();
  const job = await createSucceededGuestAnalysisJob({
    userId: user.id,
    snapshotId: snapshot.id,
  });

  const spy = new ClaimSourceGrantSpy();
  const service = buildService(spy);

  const result = await service.claimGuestAnalysisJob(user.id, job.id);

  assert.equal(result.status, "succeeded");
  assert.equal(spy.calls.length, 0);
});

test("flag ligada + AnalysisJob COM cvProcessingJobId: roda o claim granular novo ALÉM do legado (saveGuestPreview continua materializando o CvAdaptation)", async () => {
  const user = await createUser();
  const snapshot = await createSucceededSnapshot();

  const cvSource = await prisma.cvSource.create({
    data: {
      ownerType: "GUEST",
      talentSubjectId: (await prisma.talentSubject.create({ data: {} })).id,
      textStorageKey: "inline:x",
      textSha256: randomUUID(),
    },
  });
  const cvSubmission = await prisma.cvSubmission.create({
    data: { cvSourceId: cvSource.id, origin: "PASTED_TEXT" },
  });
  const structuredProfile = await prisma.cvStructuredProfile.create({
    data: {
      cvSourceId: cvSource.id,
      extractorVersion: "v1",
      schemaVersion: "v1",
      status: "READY",
      canonicalJson: {},
      coverageJson: {},
      confidenceJson: {},
      evidenceJson: {},
    },
  });
  // status READY + cvStructuredProfileId preenchido no PRÓPRIO
  // CvProcessingJob (nunca só na AnalysisJob) — reflete o estado real que
  // o worker deixa (cv-processing.worker.ts#processJob) e satisfaz a
  // trigger de linhagem (migration 20260908211500): AnalysisJob.
  // cvStructuredProfileId precisa bater com o do CvProcessingJob que a
  // originou, não só existir isoladamente.
  const cvProcessingJob = await prisma.cvProcessingJob.create({
    data: {
      cvSourceId: cvSource.id,
      cvSubmissionId: cvSubmission.id,
      status: "READY",
      cvStructuredProfileId: structuredProfile.id,
    },
  });

  // Ownership: a AnalysisJob abaixo já nasce com userId preenchido (como se
  // o claim já tivesse transferido a posse) — a trigger de linhagem exige
  // ou CvSource.userId bater, ou um ClaimSourceGrant válido (fonte é
  // GUEST-owned aqui, então precisa do grant, mesmo padrão real de
  // ClaimSourceGrantService#ensureGrant).
  await prisma.claimSourceGrant.create({
    data: {
      cvSourceId: cvSource.id,
      userId: user.id,
      provenByAnalysisJobId: "seed",
    },
  });

  const job = await createSucceededGuestAnalysisJob({
    userId: user.id,
    snapshotId: snapshot.id,
    cvProcessingJobId: cvProcessingJob.id,
    cvSubmissionId: cvSubmission.id,
    cvStructuredProfileId: structuredProfile.id,
  });

  const spy = new ClaimSourceGrantSpy();
  const service = buildService(spy);

  const result = await service.claimGuestAnalysisJob(user.id, job.id);

  assert.equal(result.status, "succeeded");
  assert.equal(spy.calls.length, 1);
  assert.deepEqual(spy.calls[0], {
    userId: user.id,
    analysisJobId: job.id,
    cvProcessingJobId: cvProcessingJob.id,
  });
});

// Extraído dos setups repetidos nos testes de retry abaixo — mesmo estado
// "pronto pro claim granular" do segundo teste acima (CvSource GUEST +
// CvProcessingJob READY + grant pré-existente simulando reatribuição de
// ownership já commitada, igual ao caminho real do funil radar → cadastro).
async function createReadyClaimSetup(userId: string) {
  const snapshot = await createSucceededSnapshot();
  const cvSource = await prisma.cvSource.create({
    data: {
      ownerType: "GUEST",
      talentSubjectId: (await prisma.talentSubject.create({ data: {} })).id,
      textStorageKey: `inline:${randomUUID()}`,
      textSha256: randomUUID(),
    },
  });
  const cvSubmission = await prisma.cvSubmission.create({
    data: { cvSourceId: cvSource.id, origin: "PASTED_TEXT" },
  });
  const structuredProfile = await prisma.cvStructuredProfile.create({
    data: {
      cvSourceId: cvSource.id,
      extractorVersion: "v1",
      schemaVersion: "v1",
      status: "READY",
      canonicalJson: {},
      coverageJson: {},
      confidenceJson: {},
      evidenceJson: {},
    },
  });
  const cvProcessingJob = await prisma.cvProcessingJob.create({
    data: {
      cvSourceId: cvSource.id,
      cvSubmissionId: cvSubmission.id,
      status: "READY",
      cvStructuredProfileId: structuredProfile.id,
    },
  });
  await prisma.claimSourceGrant.create({
    data: {
      cvSourceId: cvSource.id,
      userId,
      provenByAnalysisJobId: "seed",
    },
  });
  const job = await createSucceededGuestAnalysisJob({
    userId,
    snapshotId: snapshot.id,
    cvProcessingJobId: cvProcessingJob.id,
    cvSubmissionId: cvSubmission.id,
    cvStructuredProfileId: structuredProfile.id,
  });
  return { job, cvProcessingJob };
}

test("claim granular falha com MasterDesignationSubjectMismatchError uma vez: retry converge e claimGuestAnalysisJob ainda sucede (bug real do redirect pós-cadastro do radar)", async () => {
  const user = await createUser();
  const { job } = await createReadyClaimSetup(user.id);

  const spy = new ClaimSourceGrantFlakySpy(1);
  const service = buildService(spy);

  const result = await service.claimGuestAnalysisJob(user.id, job.id);

  assert.equal(result.status, "succeeded");
  assert.equal(spy.calls, 2, "deveria ter tentado de novo depois da 1ª falha");
});

test("claim granular falha com MasterDesignationSubjectMismatchError em todas as tentativas: propaga o erro (não fica preso num estado intermediário silencioso)", async () => {
  const user = await createUser();
  const { job } = await createReadyClaimSetup(user.id);

  const spy = new ClaimSourceGrantAlwaysFailsSpy();
  const service = buildService(spy);

  await assert.rejects(
    () => service.claimGuestAnalysisJob(user.id, job.id),
    MasterDesignationSubjectMismatchError,
  );
  assert.equal(spy.calls, 3, "deveria ter esgotado as 3 tentativas");
});

test("claim granular falha com erro NÃO recuperável: propaga na primeira tentativa, sem retry", async () => {
  const user = await createUser();
  const { job } = await createReadyClaimSetup(user.id);

  const spy = new ClaimSourceGrantNonRecoverableSpy();
  const service = buildService(spy);

  await assert.rejects(() => service.claimGuestAnalysisJob(user.id, job.id));
  assert.equal(spy.calls, 1, "erro não recuperável não deveria ter retry");
});

test("flag ligada + AnalysisJob ainda não succeeded: nem o legado nem o claim novo materializam nada", async () => {
  const user = await createUser();
  const snapshot = await createSucceededSnapshot();

  const cvSource = await prisma.cvSource.create({
    data: {
      ownerType: "GUEST",
      talentSubjectId: (await prisma.talentSubject.create({ data: {} })).id,
      textStorageKey: "inline:y",
      textSha256: randomUUID(),
    },
  });
  const cvSubmission = await prisma.cvSubmission.create({
    data: { cvSourceId: cvSource.id, origin: "PASTED_TEXT" },
  });
  const cvProcessingJob = await prisma.cvProcessingJob.create({
    data: {
      cvSourceId: cvSource.id,
      cvSubmissionId: cvSubmission.id,
      status: "PENDING",
    },
  });

  const job = await prisma.analysisJob.create({
    data: {
      ownerKind: "guest",
      status: "processing",
      userId: user.id,
      analysisCvSnapshotId: snapshot.id,
      jobDescriptionText: "Vaga em processamento.",
      cvProcessingJobId: cvProcessingJob.id,
      cvSubmissionId: cvSubmission.id,
    },
  });

  const spy = new ClaimSourceGrantSpy();
  const service = buildService(spy);

  const result = await service.claimGuestAnalysisJob(user.id, job.id);

  assert.deepEqual(result, { status: "processing" });
  assert.equal(spy.calls.length, 0);
});
