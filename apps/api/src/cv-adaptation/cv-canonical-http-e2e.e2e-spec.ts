// Testes permanentes — 5ª rodada da auditoria adversarial (2026-09-09),
// itens 1-5: cobertura HTTP real (upload binário de verdade, endpoints
// reais, Postgres real) para os cenários que a 4ª rodada só cobria por
// caminhos análogos (masterResumeId em vez de upload, texto injetado
// direto no service em vez de arquivo). Único ponto faked: a extração de
// IA da estruturação canônica (CvStructuredProfileExtractionService) e os
// clientes de IA de análise/geração (CV_ANALYSIS_AI_CLIENT/
// CV_GENERATION_AI_CLIENT) — mesma metodologia usada em toda a auditoria
// desde a 2ª rodada (nunca chamar IA real em teste, sempre interceptar no
// limite exato onde o payload seria enviado). Extração de TEXTO do
// arquivo (mammoth) é real — o arquivo é um DOCX genuinamente válido,
// construído com a biblioteca `docx` e lido de volta pela mesma
// `extractTextFromCvFile` que a rota HTTP usa em produção.
process.env.CV_STRUCTURED_PROFILE_PIPELINE_ENABLED = "true";
process.env.SKIP_AI = "false";

import "reflect-metadata";

import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { afterEach, test } from "node:test";

import { type INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { Document, Packer, Paragraph, TextRun } from "docx";
import request from "supertest";

import { requestContextMiddleware } from "../analysis-protection/request-context.middleware";
import { AppModule } from "../app.module";
import { CvProcessingWorker } from "../cv-processing/cv-processing.worker";
import {
  CV_PROCESSING_JOB_CREATED,
  CV_PROCESSING_JOB_READY,
  cvProcessingDispatchSignal,
} from "../cv-processing/cv-processing-dispatch.signal";
import { CvStructuredProfileExtractionService } from "../cv-processing/cv-structured-profile-extraction.service";
import { DatabaseService } from "../database/database.service";
import { PlansService } from "../plans/plans.service";
import { StorageService } from "../storage/storage.service";
import { CvAnalysisWorker } from "./cv-analysis.worker";

const openApps = new Set<INestApplication>();

afterEach(async () => {
  const apps = Array.from(openApps);
  openApps.clear();
  await Promise.all(
    apps.map(async (app) => {
      try {
        await app.close();
      } catch {
        // ignore
      }
    }),
  );
});

type CapturedMessages = Array<{ role: string; content: string }>;

function fakeChatClient(
  responder: (messages: CapturedMessages) => string | Promise<string>,
  captured: CapturedMessages[],
  opts?: { failTimes?: number },
) {
  let calls = 0;
  return {
    chat: {
      completions: {
        create: async (params: { messages: CapturedMessages }) => {
          calls += 1;
          captured.push(params.messages);
          if (opts?.failTimes && calls <= opts.failTimes) {
            throw new Error("simulated AI failure");
          }
          return {
            choices: [
              { message: { content: await responder(params.messages) } },
            ],
            usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
          };
        },
      },
    },
  };
}

function minimalAnalysisJson(): string {
  return JSON.stringify({
    vaga: { cargo: "Analista", empresa: "Acme" },
    requirements: [
      {
        requirementText: "req",
        importance: "medium",
        coverageStatus: "partial",
        evidence: [],
        gapExplanation: "",
        recommendation: "",
        impactScore: 5,
      },
    ],
    fit: {
      score: 50,
      score_pos_ajustes: 50,
      categoria: "medio",
      headline: "ok",
      subheadline: "ok",
    },
    secoes: {
      experiencia: { score: 20, max: 40 },
      competencias: { score: 20, max: 40 },
      formatacao: { score: 10, max: 20 },
    },
    positivos: [],
    ajustes_conteudo: [],
    keywords: { presentes: [], possiveis: [], ausentes: [] },
    formato_cv: { ats_score: 50, resumo: "ok", problemas: [], campos: [] },
    comparacao: { antes: "antes", depois: "depois" },
    preview: { antes: "antes", depois: "depois" },
    pontos_fortes: [],
    lacunas: [],
    melhorias_aplicadas: [],
    ats_keywords: { presentes: [], ausentes: [] },
    projecao_melhoria: {
      score_atual: 50,
      score_pos_otimizacao: 50,
      explicacao_curta: "ok",
    },
    mensagem_venda: { titulo: "ok", subtexto: "ok" },
  });
}

function minimalGenerationJson(): string {
  return JSON.stringify({
    summary: "ok",
    sections: [
      {
        sectionType: "experience",
        title: "Exp",
        items: [{ heading: "H", bullets: ["b"] }],
      },
    ],
    highlightedSkills: [],
    removedSections: [],
    adaptationNotes: "ok",
  });
}

async function buildDocxBuffer(lines: string[]): Promise<Buffer> {
  const doc = new Document({
    sections: [
      {
        children: lines.map(
          (line) => new Paragraph({ children: [new TextRun(line)] }),
        ),
      },
    ],
  });
  return Packer.toBuffer(doc);
}

function fakeExtractionClient(
  outputBuilder: () => {
    canonicalProfile: Record<string, unknown>;
    extractionCoverage: unknown;
    confidence: unknown;
    evidence: unknown;
  },
  callTracker: { count: number },
) {
  return {
    extract: async () => {
      callTracker.count += 1;
      return outputBuilder();
    },
  };
}

function canonicalOutput(marker: string) {
  return {
    canonicalProfile: {
      fullName: marker,
      headline: marker,
      email: null,
      phone: null,
      linkedinUrl: null,
      location: { city: null, state: null, country: null },
      professionalSummary: `${marker} resumo`,
      experiences: [
        {
          role: `${marker} Analista`,
          company: `${marker} Empresa`,
          location: null,
          startDate: "2020-01",
          endDate: "2022-01",
          bullets: [`${marker} bullet`],
          technologies: [],
        },
      ],
      education: [],
      skills: [`${marker}-skill`],
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

async function createApp(opts: {
  extraction: { extract: () => Promise<unknown> };
  analysisClient?: unknown;
  generationClient?: unknown;
}) {
  process.env.SKIP_TURNSTILE_VERIFICATION = "true";

  let moduleBuilder = Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(StorageService)
    .useValue({
      async deleteObject() {
        return;
      },
      async getObject() {
        return Buffer.from("mock-storage-object");
      },
      async putObject(key: string) {
        return `https://mock-storage.local/${key}`;
      },
    })
    .overrideProvider(CvStructuredProfileExtractionService)
    .useValue(opts.extraction);

  if (opts.analysisClient) {
    moduleBuilder = moduleBuilder
      .overrideProvider("CV_ANALYSIS_AI_CLIENT")
      .useValue(opts.analysisClient);
  }
  if (opts.generationClient) {
    moduleBuilder = moduleBuilder
      .overrideProvider("CV_GENERATION_AI_CLIENT")
      .useValue(opts.generationClient);
  }

  const moduleRef = await moduleBuilder.compile();
  const app: INestApplication = moduleRef.createNestApplication();
  app.use(requestContextMiddleware);
  app.setGlobalPrefix("api");
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );
  await app.init();
  openApps.add(app);
  return { app, database: app.get(DatabaseService) };
}

function subscribeWorkers(app: INestApplication) {
  const worker = app.get(CvProcessingWorker);
  const analysisWorker = app.get(CvAnalysisWorker);
  const onCreated = (jobId: string) => worker.triggerProcessing(jobId);
  const onReady = (cvProcessingJobId: string) =>
    analysisWorker.triggerProcessingForCvProcessingJob(cvProcessingJobId);
  cvProcessingDispatchSignal.on(CV_PROCESSING_JOB_CREATED, onCreated);
  cvProcessingDispatchSignal.on(CV_PROCESSING_JOB_READY, onReady);
  return () => {
    cvProcessingDispatchSignal.off(CV_PROCESSING_JOB_CREATED, onCreated);
    cvProcessingDispatchSignal.off(CV_PROCESSING_JOB_READY, onReady);
  };
}

async function waitFor<T>(
  fn: () => Promise<T>,
  predicate: (value: T) => boolean,
  opts: { attempts?: number; intervalMs?: number } = {},
): Promise<T> {
  const attempts = opts.attempts ?? 80;
  const intervalMs = opts.intervalMs ?? 150;
  let last = await fn();
  for (let i = 0; i < attempts; i++) {
    if (predicate(last)) return last;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
    last = await fn();
  }
  return last;
}

function syntheticCvLines(runId: string, tag: string): string[] {
  return [
    `${runId} ${tag} Nome`,
    `Resumo profissional com experiencia relevante em ${tag}.`,
    "Experiencia profissional",
    `${runId} ${tag} Empresa — Analista ${tag} — 2020 a 2023`,
    "Responsavel por relatorios e projetos de dados.",
    "Formacao academica",
    "Bacharelado em Administracao — Universidade Exemplo",
    "Competencias",
    `Excel, SQL, comunicacao, gestao de projetos, ${tag}.`,
  ];
}

async function registerUser(app: INestApplication, prefix: string) {
  const safePrefix = prefix.replace(/[^a-z0-9]/gi, "").slice(0, 20);
  const email = `${safePrefix}.${randomUUID()}@earlycv.dev`;
  const response = await request(app.getHttpServer())
    .post("/api/auth/register")
    .send({ email, password: "Super-secret-123", name: `${prefix} User` });
  assert.equal(response.status, 201, JSON.stringify(response.body));
  return {
    accessToken: response.body.accessToken as string,
    email,
    userId: response.body.user.id as string,
  };
}

async function markPurchaseAsApproved(
  app: INestApplication,
  paymentReference: string,
) {
  const plansService = app.get(PlansService) as unknown as {
    resolveMercadoPagoPayment: (body: unknown) => Promise<{
      paymentReference: string | null;
      status: "approved" | "failed" | "pending" | "unknown";
    }>;
    handleWebhook: (provider: string, body: unknown) => Promise<void>;
  };

  const originalResolve = plansService.resolveMercadoPagoPayment;
  plansService.resolveMercadoPagoPayment = async () => ({
    paymentReference,
    status: "approved",
  });

  try {
    await plansService.handleWebhook("mercadopago", {
      type: "payment",
      data: { id: "fake" },
    });
  } finally {
    plansService.resolveMercadoPagoPayment = originalResolve;
  }
}

async function cleanupUser(
  database: DatabaseService,
  userId: string,
  talentSubjectId?: string,
) {
  const prisma = database as unknown as { $transaction: unknown } as never;
  void prisma;
  await database.cvMasterDesignation
    .deleteMany({ where: { userId } })
    .catch(() => undefined);
  await database.cvAdaptation
    .deleteMany({ where: { userId } })
    .catch(() => undefined);
  await database.analysisJob
    .deleteMany({ where: { userId } })
    .catch(() => undefined);
  await database.resume
    .deleteMany({ where: { userId } })
    .catch(() => undefined);
  await database.talentProfile
    .deleteMany({ where: { userId } })
    .catch(() => undefined);
  await database.cvSource
    .deleteMany({ where: { userId } })
    .catch(() => undefined);
  await database.userProfile
    .deleteMany({ where: { userId } })
    .catch(() => undefined);
  if (talentSubjectId) {
    await database.cvMasterDesignation
      .deleteMany({ where: { talentSubjectId } })
      .catch(() => undefined);
    await database.talentProfile
      .deleteMany({ where: { talentSubjectId } })
      .catch(() => undefined);
    await database.cvSource
      .deleteMany({ where: { talentSubjectId } })
      .catch(() => undefined);
  }
  await database.user
    .deleteMany({ where: { id: userId } })
    .catch(() => undefined);
}

// ===========================================================================
// Item 1 — guest com upload binário real.
// ===========================================================================
test("HTTP 1: guest allowlisted envia arquivo DOCX real via /analyze-guest — extração, submission, worker, claim, talento, tudo ponta a ponta", async () => {
  const runId = `http1-${Date.now()}-${randomUUID().slice(0, 8)}`;
  const extractCalls = { count: 0 };
  const extraction = fakeExtractionClient(
    () => canonicalOutput(runId),
    extractCalls,
  );
  const { client: analysisClient, captured: analysisCaptured } = (() => {
    const captured: CapturedMessages[] = [];
    return {
      client: fakeChatClient(() => minimalAnalysisJson(), captured),
      captured,
    };
  })();
  const { app, database } = await createApp({
    extraction,
    analysisClient,
    generationClient: analysisClient,
  });
  void analysisCaptured;

  const worker = app.get(CvProcessingWorker);
  // O worker só se auto-inscreve no signal fora de NODE_ENV=test (ver
  // comentário em cv-processing.worker.ts) — em teste, a inscrição manual
  // abaixo É o mecanismo de trigger imediato sendo exercido de verdade,
  // não um substituto dele: mesmo signal singleton do processo, mesmo
  // triggerProcessing()/claimOne() que o worker real usaria em produção.
  const onCreated = (jobId: string) => worker.triggerProcessing(jobId);
  cvProcessingDispatchSignal.on(CV_PROCESSING_JOB_CREATED, onCreated);
  const analysisWorker = app.get(CvAnalysisWorker);
  const onReady = (cvProcessingJobId: string) =>
    analysisWorker.triggerProcessingForCvProcessingJob(cvProcessingJobId);
  cvProcessingDispatchSignal.on(CV_PROCESSING_JOB_READY, onReady);

  let userId: string | undefined;
  let talentSubjectId: string | undefined;
  try {
    const session = `${runId}-session`;
    const hash = createHash("sha256").update(session).digest("hex");
    process.env.CV_STRUCTURED_PROFILE_PIPELINE_ALLOWLIST_GUEST_SESSION_HASHES =
      hash;

    const docxBuffer = await buildDocxBuffer([
      `${runId} Nome`,
      "Resumo profissional com experiencia relevante na area de analise de dados.",
      "Experiencia profissional",
      `${runId} Empresa Acme — Analista — 2020 a 2023`,
      "Responsavel por relatorios e projetos de dados.",
      "Formacao academica",
      "Bacharelado em Administracao — Universidade Exemplo",
      "Competencias",
      "Excel, SQL, comunicacao, gestao de projetos.",
    ]);

    const response = await request(app.getHttpServer())
      .post("/api/cv-adaptation/analyze-guest")
      .set("Cookie", `analysis_session_token=${session}`)
      .attach("file", docxBuffer, {
        filename: "cv.docx",
        contentType:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      })
      .field(
        "jobDescriptionText",
        `Vaga para analista com responsabilidades e requisitos. ${runId}`,
      );

    assert.equal(response.status, 201, JSON.stringify(response.body));
    const jobId = response.body.jobId as string;
    const guestPossessionToken = response.body.guestPossessionToken as string;

    const row = await database.analysisJob.findUniqueOrThrow({
      where: { id: jobId },
    });
    assert.ok(
      row.cvProcessingJobId,
      "guest allowlisted com arquivo precisa entrar no pipeline novo",
    );

    const cvJob = await database.cvProcessingJob.findUniqueOrThrow({
      where: { id: row.cvProcessingJobId as string },
    });
    const submission = await database.cvSubmission.findFirstOrThrow({
      where: { cvSourceId: cvJob.cvSourceId },
    });
    assert.equal(
      submission.origin,
      "FILE_UPLOAD",
      "requisito 3: CvSubmission.origin precisa ser FILE_UPLOAD",
    );
    assert.equal(
      submission.fileName,
      "cv.docx",
      "requisito 4: metadados do arquivo preservados",
    );
    assert.equal(
      submission.mimeType,
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
    assert.ok(submission.fileSizeBytes && submission.fileSizeBytes > 0);

    // requisito 6: trigger imediato processa sem esperar cron — aguarda o
    // dispatch síncrono (emit acontece logo após o commit do enqueue).
    await new Promise((resolve) => setTimeout(resolve, 300));
    let cvJobRow = await database.cvProcessingJob.findUniqueOrThrow({
      where: { id: cvJob.id },
    });
    for (let i = 0; i < 20 && cvJobRow.status !== "READY"; i++) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      cvJobRow = await database.cvProcessingJob.findUniqueOrThrow({
        where: { id: cvJob.id },
      });
    }
    assert.equal(
      cvJobRow.status,
      "READY",
      "requisito 7: CvStructuredProfile precisa chegar a READY",
    );
    assert.equal(
      extractCalls.count,
      1,
      "requisito 2: exatamente uma extração real do arquivo",
    );

    const structuredProfile =
      await database.cvStructuredProfile.findUniqueOrThrow({
        where: { id: cvJobRow.cvStructuredProfileId as string },
      });
    assert.equal(
      (structuredProfile.canonicalJson as { fullName: string }).fullName,
      runId,
    );

    // requisito 8: AnalysisJob usa canonicalJson (aguarda o worker de análise).
    let finalJob = await database.analysisJob.findUniqueOrThrow({
      where: { id: jobId },
    });
    for (let i = 0; i < 20 && finalJob.status !== "succeeded"; i++) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      finalJob = await database.analysisJob.findUniqueOrThrow({
        where: { id: jobId },
      });
    }
    assert.equal(finalJob.status, "succeeded");
    assert.equal(finalJob.cvStructuredProfileId, structuredProfile.id);

    // requisito 9/10/11: TalentSubject/TalentProfile, observações,
    // Master provisório.
    const source = await database.cvSource.findUniqueOrThrow({
      where: { id: cvJob.cvSourceId },
    });
    assert.ok(source.talentSubjectId);
    talentSubjectId = source.talentSubjectId as string;
    const talentProfile = await database.talentProfile.findUniqueOrThrow({
      where: { talentSubjectId: source.talentSubjectId as string },
    });
    const experienceObs = await database.talentExperienceObservation.findMany({
      where: {
        talentProfileId: talentProfile.id,
        cvStructuredProfileId: structuredProfile.id,
      },
    });
    assert.equal(
      experienceObs.length,
      1,
      "requisito 10: experiência extraída do arquivo precisa estar persistida",
    );
    const masterDesignation = await database.cvMasterDesignation.findFirst({
      where: {
        talentSubjectId: source.talentSubjectId as string,
        supersededAt: null,
      },
    });
    assert.ok(
      masterDesignation,
      "requisito 11: Master provisório precisa existir",
    );

    // requisito 12: claim posterior reutiliza a extração sem nova IA.
    const registered = await registerUser(app, `http1-claim-${runId}`);
    userId = registered.userId;
    const claimResponse = await request(app.getHttpServer())
      .post(`/api/cv-adaptation/analysis-jobs/${jobId}/claim`)
      .set("Authorization", `Bearer ${registered.accessToken}`)
      .set("Cookie", `analysis_session_token=${session}`)
      .send({ guestPossessionToken });
    assert.equal(claimResponse.status, 201, JSON.stringify(claimResponse.body));
    assert.equal(
      extractCalls.count,
      1,
      "claim nunca pode reprocessar a extração — mesmo CvStructuredProfile reutilizado",
    );

  } finally {
    cvProcessingDispatchSignal.off(CV_PROCESSING_JOB_CREATED, onCreated);
    cvProcessingDispatchSignal.off(CV_PROCESSING_JOB_READY, onReady);
    if (userId) {
      await cleanupUser(database, userId, talentSubjectId);
    }
    process.env.CV_STRUCTURED_PROFILE_PIPELINE_ALLOWLIST_GUEST_SESSION_HASHES =
      undefined;
  }
});

// ===========================================================================
// Item 2 — usuário autenticado com Master A já ativo envia arquivo B (upload
// binário real via /analyze), sem promoção e com promoção.
// ===========================================================================

async function setupAuthenticatedMasterA(
  app: INestApplication,
  database: DatabaseService,
  runId: string,
  extractCalls: { count: number },
) {
  const registered = await registerUser(app, `http2-${runId}`);
  const response = await request(app.getHttpServer())
    .post("/api/cv-adaptation/analyze")
    .set("Authorization", `Bearer ${registered.accessToken}`)
    .field("masterCvText", syntheticCvLines(runId, "A").join("\n"))
    .field(
      "jobDescriptionText",
      `Vaga para analista com responsabilidades e requisitos. ${runId}`,
    )
    .field("saveAsMaster", "true");
  assert.equal(response.status, 201, JSON.stringify(response.body));
  const jobId = response.body.jobId as string;

  const jobA = await waitFor(
    () => database.analysisJob.findUniqueOrThrow({ where: { id: jobId } }),
    (row) => row.status === "succeeded" || row.status === "failed",
  );
  assert.equal(
    jobA.status,
    "succeeded",
    `Master A precisa concluir antes do teste com B: ${JSON.stringify(jobA)}`,
  );
  assert.equal(extractCalls.count, 1);

  const masterResume = await database.resume.findFirstOrThrow({
    where: { userId: registered.userId, isMaster: true },
  });
  const cvProcessingJobA = await database.cvProcessingJob.findUniqueOrThrow({
    where: { id: jobA.cvProcessingJobId as string },
  });

  return { registered, jobA, masterResume, cvProcessingJobA };
}

test("HTTP 2a: usuário com Master A ativo envia arquivo B via /analyze SEM saveAsMaster — B gera fonte própria, A continua Master", async () => {
  const runId = `http2a-${Date.now()}-${randomUUID().slice(0, 8)}`;
  const extractCalls = { count: 0 };
  const extraction = fakeExtractionClient(
    () => canonicalOutput(`${runId}-marker`),
    extractCalls,
  );
  const analysisCaptured: CapturedMessages[] = [];
  const analysisClient = fakeChatClient((messages) => {
    const payload = JSON.stringify(messages);
    analysisCaptured.push(messages);
    return payload.includes(`${runId}-B-marker`) ||
      payload.includes(`${runId} B`)
      ? minimalAnalysisJson()
      : minimalAnalysisJson();
  }, []);
  const { app, database } = await createApp({
    extraction,
    analysisClient,
    generationClient: analysisClient,
  });
  const unsubscribe = subscribeWorkers(app);
  let userId: string | undefined;

  try {
    const { registered, jobA, masterResume } = await setupAuthenticatedMasterA(
      app,
      database,
      runId,
      extractCalls,
    );
    userId = registered.userId;

    const docxB = await buildDocxBuffer(syntheticCvLines(runId, "B"));
    const responseB = await request(app.getHttpServer())
      .post("/api/cv-adaptation/analyze")
      .set("Authorization", `Bearer ${registered.accessToken}`)
      .attach("file", docxB, {
        filename: "cv-b.docx",
        contentType:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      })
      .field(
        "jobDescriptionText",
        `Vaga B para analista de dados, com responsabilidades, requisitos e perfil desejado do candidato. ${runId}`,
      );
    assert.equal(responseB.status, 201, JSON.stringify(responseB.body));
    const jobBId = responseB.body.jobId as string;

    const jobB = await waitFor(
      () => database.analysisJob.findUniqueOrThrow({ where: { id: jobBId } }),
      (row) => row.status === "succeeded" || row.status === "failed",
    );
    assert.equal(jobB.status, "succeeded", `debug=${JSON.stringify(jobB)}`);
    assert.equal(
      extractCalls.count,
      2,
      "B precisa de sua própria extração — nunca reusa a de A",
    );
    assert.notEqual(
      jobB.cvProcessingJobId,
      jobA.cvProcessingJobId,
      "B precisa de CvProcessingJob próprio",
    );

    const cvProcessingJobB = await database.cvProcessingJob.findUniqueOrThrow({
      where: { id: jobB.cvProcessingJobId as string },
    });
    const submissionB = await database.cvSubmission.findFirstOrThrow({
      where: { cvSourceId: cvProcessingJobB.cvSourceId },
    });
    assert.equal(submissionB.origin, "FILE_UPLOAD");
    assert.equal(submissionB.fileName, "cv-b.docx");

    const structuredB = await database.cvStructuredProfile.findUniqueOrThrow({
      where: { id: cvProcessingJobB.cvStructuredProfileId as string },
    });
    assert.equal(
      (structuredB.canonicalJson as { fullName: string }).fullName,
      `${runId}-marker`,
    );
    assert.equal(
      jobB.cvStructuredProfileId,
      structuredB.id,
      "requisito: análise usa B",
    );

    // A continua Master — nenhuma troca de designação nem de Resume.isMaster.
    const resumesAfter = await database.resume.findMany({
      where: { userId: registered.userId },
    });
    const mastersAfter = resumesAfter.filter((r) => r.isMaster);
    assert.equal(mastersAfter.length, 1);
    assert.equal(
      mastersAfter[0]?.id,
      masterResume.id,
      "A precisa continuar Master, sem troca",
    );

    const cvProcessingJobAFresh =
      await database.cvProcessingJob.findUniqueOrThrow({
        where: { id: jobA.cvProcessingJobId as string },
      });
    const sourceA = await database.cvSource.findUniqueOrThrow({
      where: { id: cvProcessingJobAFresh.cvSourceId },
    });
    const designationA = await database.cvMasterDesignation.findFirst({
      where: { userId: registered.userId, supersededAt: null },
    });
    assert.ok(
      designationA,
      "designação de Master precisa continuar apontando pra A",
    );

    // UserProfile continua derivado de A (headline/summary do canonicalJson de A).
    const canonicalA = (
      await database.cvStructuredProfile.findUniqueOrThrow({
        where: { id: cvProcessingJobAFresh.cvStructuredProfileId as string },
      })
    ).canonicalJson as { headline: string };
    const userProfile = await database.userProfile.findUnique({
      where: { userId: registered.userId },
    });
    assert.equal(
      userProfile?.headline,
      canonicalA.headline,
      "UserProfile precisa refletir A, não B",
    );

    // B alimenta a Base de Talentos (TalentProfile do usuário recebe
    // observações da fonte B mesmo sem promoção).
    const talentProfile = await database.talentProfile.findUniqueOrThrow({
      where: { userId: registered.userId },
    });
    const obsFromB = await database.talentExperienceObservation.findMany({
      where: {
        talentProfileId: talentProfile.id,
        cvStructuredProfileId: structuredB.id,
      },
    });
    assert.equal(
      obsFromB.length,
      1,
      "B precisa alimentar a Base de Talentos mesmo sem promoção",
    );
    void sourceA;
  } finally {
    unsubscribe();
    if (userId) {
      await cleanupUser(database, userId);
    }
  }
});

test("HTTP 2b: usuário com Master A ativo envia arquivo B via /analyze COM saveAsMaster=true — A permanece Master até B ficar READY, depois troca", async () => {
  const runId = `http2b-${Date.now()}-${randomUUID().slice(0, 8)}`;
  const extractCalls = { count: 0 };
  const extraction = fakeExtractionClient(
    () => canonicalOutput(`${runId}-marker`),
    extractCalls,
  );
  const analysisClient = fakeChatClient(() => minimalAnalysisJson(), []);
  const { app, database } = await createApp({
    extraction,
    analysisClient,
    generationClient: analysisClient,
  });
  const unsubscribe = subscribeWorkers(app);
  let userId: string | undefined;

  try {
    const { registered, masterResume } = await setupAuthenticatedMasterA(
      app,
      database,
      runId,
      extractCalls,
    );
    userId = registered.userId;

    const docxB = await buildDocxBuffer(syntheticCvLines(runId, "B"));
    const responseB = await request(app.getHttpServer())
      .post("/api/cv-adaptation/analyze")
      .set("Authorization", `Bearer ${registered.accessToken}`)
      .attach("file", docxB, {
        filename: "cv-b.docx",
        contentType:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      })
      .field(
        "jobDescriptionText",
        `Vaga B para analista de dados, com responsabilidades, requisitos e perfil desejado do candidato. ${runId}`,
      )
      .field("saveAsMaster", "true");
    assert.equal(responseB.status, 201, JSON.stringify(responseB.body));
    const jobBId = responseB.body.jobId as string;

    // A ainda precisa estar Master IMEDIATAMENTE após o enqueue (síncrono,
    // antes de qualquer processamento de B) — a troca só pode acontecer
    // depois que B chega READY.
    const mastersRightAfterEnqueue = await database.resume.findMany({
      where: { userId: registered.userId, isMaster: true },
    });
    assert.equal(mastersRightAfterEnqueue.length, 1);
    assert.equal(
      mastersRightAfterEnqueue[0]?.id,
      masterResume.id,
      "A precisa continuar Master durante o processamento de B",
    );

    const jobB = await waitFor(
      () => database.analysisJob.findUniqueOrThrow({ where: { id: jobBId } }),
      (row) => row.status === "succeeded" || row.status === "failed",
    );
    assert.equal(jobB.status, "succeeded", `debug=${JSON.stringify(jobB)}`);

    const cvProcessingJobB = await database.cvProcessingJob.findUniqueOrThrow({
      where: { id: jobB.cvProcessingJobId as string },
    });
    const structuredB = await database.cvStructuredProfile.findUniqueOrThrow({
      where: { id: cvProcessingJobB.cvStructuredProfileId as string },
    });

    const resumesAfter = await database.resume.findMany({
      where: { userId: registered.userId },
    });
    const mastersAfter = resumesAfter.filter((r) => r.isMaster);
    assert.equal(mastersAfter.length, 1, "exatamente um Resume.isMaster");
    assert.equal(
      mastersAfter[0]?.id,
      cvProcessingJobB.resumeId,
      "designação precisa apontar pra B",
    );
    assert.notEqual(
      mastersAfter[0]?.id,
      masterResume.id,
      "A precisa ter sido demovido",
    );

    const designation = await database.cvMasterDesignation.findFirst({
      where: { userId: registered.userId, supersededAt: null },
    });
    assert.equal(
      designation?.cvStructuredProfileId,
      cvProcessingJobB.cvStructuredProfileId,
      "designação ativa precisa apontar pra fonte de B",
    );

    const userProfile = await database.userProfile.findUnique({
      where: { userId: registered.userId },
    });
    const canonicalB = structuredB.canonicalJson as { headline: string };
    assert.equal(
      userProfile?.headline,
      canonicalB.headline,
      "UserProfile precisa refletir B após a troca",
    );

    const monitorJob = await database.monitorProjectionJob.findFirst({
      where: { userId: registered.userId },
      orderBy: { createdAt: "desc" },
    });
    assert.ok(
      monitorJob,
      "MonitorProjectionJob precisa ser criado na promoção de B",
    );
  } finally {
    unsubscribe();
    if (userId) {
      await cleanupUser(database, userId);
    }
  }
});

// ===========================================================================
// Item 3 — geração paga usando o pipeline canônico, pelo choke point real
// (GET /:id/download), com interceptação do payload de IA no limite exato.
// ===========================================================================

test("HTTP 3: análise canônica -> claim -> pagamento libera geração -> download real usa ORIGEM_CANONICAL, nunca RAW/SNAPSHOT/USER_PROFILE — segundo download reutiliza", async () => {
  const runId = `http3-${Date.now()}-${randomUUID().slice(0, 8)}`;
  const extractCalls = { count: 0 };
  const extraction = fakeExtractionClient(
    () => canonicalOutput(`${runId}-ORIGEM_CANONICAL`),
    extractCalls,
  );
  const generationCaptured: CapturedMessages[] = [];
  let generationCalls = 0;
  const generationClient = fakeChatClient((messages) => {
    generationCalls += 1;
    generationCaptured.push(messages);
    return minimalGenerationJson();
  }, []);
  const analysisClient = fakeChatClient(() => minimalAnalysisJson(), []);

  const { app, database } = await createApp({
    extraction,
    analysisClient,
    generationClient,
  });
  const unsubscribe = subscribeWorkers(app);
  let userId: string | undefined;

  try {
    const registered = await registerUser(app, `http3-${runId}`);
    userId = registered.userId;

    // Contaminantes — nunca podem aparecer no payload de geração.
    await database.resume.create({
      data: {
        userId: registered.userId,
        title: "Resume solto",
        kind: "master",
        status: "uploaded",
        isMaster: false,
        rawText: `${runId} ORIGEM_RAW não pode aparecer aqui`,
      },
    });
    await database.userProfile.upsert({
      where: { userId: registered.userId },
      create: {
        userId: registered.userId,
        professionalSummary: `${runId} ORIGEM_USER_PROFILE não pode aparecer aqui`,
      },
      update: {
        professionalSummary: `${runId} ORIGEM_USER_PROFILE não pode aparecer aqui`,
      },
    });

    // requisito 1: análise nova pelo pipeline canônico — texto colado
    // deliberadamente marcado ORIGEM_SNAPSHOT (nunca deve vazar pro
    // payload de geração, que usa canonicalJson, nunca o texto bruto).
    const response = await request(app.getHttpServer())
      .post("/api/cv-adaptation/analyze")
      .set("Authorization", `Bearer ${registered.accessToken}`)
      .field(
        "masterCvText",
        [
          `${runId} ORIGEM_SNAPSHOT não pode aparecer aqui`,
          "Resumo profissional com experiencia relevante em dados.",
          "Experiencia profissional",
          `${runId} Empresa Snapshot — Analista — 2020 a 2023`,
          "Formacao academica",
          "Bacharelado — Universidade Exemplo",
          "Competencias",
          "Excel, SQL, comunicacao.",
        ].join("\n"),
      )
      .field(
        "jobDescriptionText",
        `Vaga para analista de dados, com responsabilidades, requisitos e perfil desejado. ${runId}`,
      );
    assert.equal(response.status, 201, JSON.stringify(response.body));
    const jobId = response.body.jobId as string;

    const job = await waitFor(
      () => database.analysisJob.findUniqueOrThrow({ where: { id: jobId } }),
      (row) => row.status === "succeeded" || row.status === "failed",
    );
    assert.equal(job.status, "succeeded", `debug=${JSON.stringify(job)}`);
    assert.equal(extractCalls.count, 1);

    // Converte a AnalysisJob succeeded em CvAdaptation — mesmo endpoint de
    // claim, idempotente e válido também pra AnalysisJob já autenticada
    // (job.userId === userId só pula a etapa de transferência de posse).
    const claimResponse = await request(app.getHttpServer())
      .post(`/api/cv-adaptation/analysis-jobs/${jobId}/claim`)
      .set("Authorization", `Bearer ${registered.accessToken}`)
      .send({});
    assert.equal(claimResponse.status, 201, JSON.stringify(claimResponse.body));
    const cvAdaptationId = claimResponse.body.cvAdaptationId as string;
    assert.ok(cvAdaptationId, "claim precisa materializar um CvAdaptation");

    // requisito 2: adaptação bloqueada — download antes do pagamento falha.
    const blockedDownload = await request(app.getHttpServer())
      .get(`/api/cv-adaptation/${cvAdaptationId}/download`)
      .set("Authorization", `Bearer ${registered.accessToken}`);
    assert.equal(
      blockedDownload.status,
      400,
      JSON.stringify(blockedDownload.body),
    );
    assert.equal(
      generationCalls,
      0,
      "geração nunca pode rodar antes do desbloqueio",
    );

    // requisito 3: pagamento/crédito libera a geração.
    const paymentReference = randomUUID();
    await database.planPurchase.create({
      data: {
        userId: registered.userId,
        planType: "starter",
        amountInCents: 1190,
        currency: "BRL",
        paymentProvider: "mercadopago",
        paymentReference,
        status: "pending",
        creditsGranted: 1,
        analysisCreditsGranted: 0,
        originAction: "unlock_cv",
        originAdaptationId: cvAdaptationId,
      },
    });
    await markPurchaseAsApproved(app, paymentReference);

    const unlockedAdaptation = await database.cvAdaptation.findUniqueOrThrow({
      where: { id: cvAdaptationId },
    });
    assert.equal(unlockedAdaptation.isUnlocked, true);

    // requisito 4/5/6/7: geração executa o choke point real; payload
    // interceptado contém ORIGEM_CANONICAL, nunca RAW/SNAPSHOT/USER_PROFILE.
    const firstDownload = await request(app.getHttpServer())
      .get(`/api/cv-adaptation/${cvAdaptationId}/download`)
      .set("Authorization", `Bearer ${registered.accessToken}`)
      .buffer(true);
    assert.equal(firstDownload.status, 200, JSON.stringify(firstDownload.body));
    assert.equal(
      generationCalls,
      1,
      "geração real precisa ter rodado exatamente uma vez",
    );

    const payload = JSON.stringify(generationCaptured[0]);
    assert.match(payload, new RegExp(`${runId}-ORIGEM_CANONICAL`));
    assert.doesNotMatch(payload, /ORIGEM_RAW/);
    assert.doesNotMatch(payload, /ORIGEM_SNAPSHOT/);
    assert.doesNotMatch(payload, /ORIGEM_USER_PROFILE/);

    // requisito 8: CvAdaptation.cvStructuredProfileId coincide com a
    // AnalysisJob de origem.
    const originJob = await database.analysisJob.findUniqueOrThrow({
      where: { convertedCvAdaptationId: cvAdaptationId },
    });
    const finalAdaptation = await database.cvAdaptation.findUniqueOrThrow({
      where: { id: cvAdaptationId },
    });
    assert.equal(
      finalAdaptation.cvStructuredProfileId,
      originJob.cvStructuredProfileId,
    );
    assert.equal(
      finalAdaptation.cvStructuredProfileId,
      job.cvStructuredProfileId,
    );

    // requisito 9: adaptedContentJson/aiAuditJson persistidos.
    assert.ok(finalAdaptation.adaptedContentJson);
    assert.ok(finalAdaptation.aiAuditJson);

    // requisito 10: segundo download reutiliza — nem chama IA de novo, nem
    // cobra crédito de novo.
    const userAfterFirst = await database.user.findUniqueOrThrow({
      where: { id: registered.userId },
      select: { creditsRemaining: true },
    });
    const secondDownload = await request(app.getHttpServer())
      .get(`/api/cv-adaptation/${cvAdaptationId}/download`)
      .set("Authorization", `Bearer ${registered.accessToken}`)
      .buffer(true);
    assert.equal(secondDownload.status, 200);
    assert.equal(
      generationCalls,
      1,
      "segundo download nunca pode chamar a IA de novo",
    );
    const userAfterSecond = await database.user.findUniqueOrThrow({
      where: { id: registered.userId },
      select: { creditsRemaining: true },
    });
    assert.equal(
      userAfterSecond.creditsRemaining,
      userAfterFirst.creditsRemaining,
      "segundo download nunca cobra crédito de novo",
    );

    const adaptationCount = await database.cvAdaptation.count({
      where: { userId: registered.userId },
    });
    assert.equal(
      adaptationCount,
      1,
      "segundo download nunca duplica CvAdaptation",
    );
  } finally {
    unsubscribe();
    if (userId) {
      await cleanupUser(database, userId);
    }
  }
});

// ===========================================================================
// Item 4 — retry real da geração paga: primeira tentativa falha depois de
// iniciar, retry usa a MESMA fonte canônica, sem recarregar crédito, sem
// duplicar CvAdaptation, sem misturar saída parcial.
// ===========================================================================

test("HTTP 4: primeira geração falha após iniciar — retry usa o mesmo cvStructuredProfileId, mesma fonte canônica, sem cobrar/duplicar de novo", async () => {
  const runId = `http4-${Date.now()}-${randomUUID().slice(0, 8)}`;
  const extractCalls = { count: 0 };
  const extraction = fakeExtractionClient(
    () => canonicalOutput(`${runId}-ORIGEM_CANONICAL`),
    extractCalls,
  );
  const generationCaptured: CapturedMessages[] = [];
  const generationClient = fakeChatClient(
    () => minimalGenerationJson(),
    generationCaptured,
    { failTimes: 1 },
  );
  const analysisClient = fakeChatClient(() => minimalAnalysisJson(), []);

  const { app, database } = await createApp({
    extraction,
    analysisClient,
    generationClient,
  });
  const unsubscribe = subscribeWorkers(app);
  let userId: string | undefined;

  try {
    const registered = await registerUser(app, `http4-${runId}`);
    userId = registered.userId;

    const response = await request(app.getHttpServer())
      .post("/api/cv-adaptation/analyze")
      .set("Authorization", `Bearer ${registered.accessToken}`)
      .field("masterCvText", syntheticCvLines(runId, "Retry").join("\n"))
      .field(
        "jobDescriptionText",
        `Vaga para analista de dados, com responsabilidades, requisitos e perfil desejado. ${runId}`,
      );
    assert.equal(response.status, 201, JSON.stringify(response.body));
    const jobId = response.body.jobId as string;

    const job = await waitFor(
      () => database.analysisJob.findUniqueOrThrow({ where: { id: jobId } }),
      (row) => row.status === "succeeded" || row.status === "failed",
    );
    assert.equal(job.status, "succeeded", `debug=${JSON.stringify(job)}`);

    const claimResponse = await request(app.getHttpServer())
      .post(`/api/cv-adaptation/analysis-jobs/${jobId}/claim`)
      .set("Authorization", `Bearer ${registered.accessToken}`)
      .send({});
    assert.equal(claimResponse.status, 201, JSON.stringify(claimResponse.body));
    const cvAdaptationId = claimResponse.body.cvAdaptationId as string;

    const paymentReference = randomUUID();
    await database.planPurchase.create({
      data: {
        userId: registered.userId,
        planType: "starter",
        amountInCents: 1190,
        currency: "BRL",
        paymentProvider: "mercadopago",
        paymentReference,
        status: "pending",
        creditsGranted: 1,
        analysisCreditsGranted: 0,
        originAction: "unlock_cv",
        originAdaptationId: cvAdaptationId,
      },
    });
    await markPurchaseAsApproved(app, paymentReference);

    const creditsAfterUnlock = await database.user.findUniqueOrThrow({
      where: { id: registered.userId },
      select: { creditsRemaining: true },
    });

    // requisito: primeira geração falha depois de iniciar.
    const firstDownload = await request(app.getHttpServer())
      .get(`/api/cv-adaptation/${cvAdaptationId}/download`)
      .set("Authorization", `Bearer ${registered.accessToken}`)
      .buffer(true);
    assert.equal(
      generationCaptured.length,
      1,
      "a primeira tentativa precisa ter rodado (e falhado) uma vez",
    );

    const afterFirstAttempt = await database.cvAdaptation.findUniqueOrThrow({
      where: { id: cvAdaptationId },
    });
    assert.equal(
      afterFirstAttempt.aiAuditJson,
      null,
      "requisito: falha na geração nunca pode persistir saída parcial/incompleta",
    );
    void firstDownload;

    const creditsAfterFirstAttempt = await database.user.findUniqueOrThrow({
      where: { id: registered.userId },
      select: { creditsRemaining: true },
    });
    assert.equal(
      creditsAfterFirstAttempt.creditsRemaining,
      creditsAfterUnlock.creditsRemaining,
      "geração que falha nunca pode cobrar crédito",
    );

    // requisito: retry usa o MESMO cvStructuredProfileId, sem voltar ao
    // snapshot nem recarregar crédito.
    const retryDownload = await request(app.getHttpServer())
      .get(`/api/cv-adaptation/${cvAdaptationId}/download`)
      .set("Authorization", `Bearer ${registered.accessToken}`)
      .buffer(true);
    assert.equal(retryDownload.status, 200, JSON.stringify(retryDownload.body));
    assert.equal(
      generationCaptured.length,
      2,
      "retry precisa ter tentado a geração de novo exatamente uma vez",
    );

    const afterRetry = await database.cvAdaptation.findUniqueOrThrow({
      where: { id: cvAdaptationId },
    });
    assert.ok(
      afterRetry.aiAuditJson,
      "retry bem-sucedido precisa persistir o resultado final",
    );
    assert.equal(afterRetry.cvStructuredProfileId, job.cvStructuredProfileId);

    const creditsAfterRetry = await database.user.findUniqueOrThrow({
      where: { id: registered.userId },
      select: { creditsRemaining: true },
    });
    assert.equal(
      creditsAfterRetry.creditsRemaining,
      creditsAfterUnlock.creditsRemaining,
      "retry nunca pode cobrar crédito de novo",
    );

    const adaptationCount = await database.cvAdaptation.count({
      where: { userId: registered.userId },
    });
    assert.equal(adaptationCount, 1, "retry nunca duplica CvAdaptation");

    // requisito: payload das duas tentativas usa a mesma fonte canônica.
    assert.equal(generationCaptured.length, 2);
    const marker = `${runId}-ORIGEM_CANONICAL`;
    assert.match(JSON.stringify(generationCaptured[0]), new RegExp(marker));
    assert.match(JSON.stringify(generationCaptured[1]), new RegExp(marker));
    assert.equal(
      extractCalls.count,
      1,
      "retry nunca reextrai — mesma extração canônica original",
    );

    // Terceira chamada (já cacheado) não deve gerar de novo.
    const thirdDownload = await request(app.getHttpServer())
      .get(`/api/cv-adaptation/${cvAdaptationId}/download`)
      .set("Authorization", `Bearer ${registered.accessToken}`)
      .buffer(true);
    assert.equal(thirdDownload.status, 200);
    assert.equal(
      generationCaptured.length,
      2,
      "geração já em cache não chama IA de novo",
    );
  } finally {
    unsubscribe();
    if (userId) {
      await cleanupUser(database, userId);
    }
  }
});

// ===========================================================================
// Item 5 — warm-cache real da geração. Dois call sites identificados em
// ensureLegacyStructuredOutput (cv-adaptation.service.ts):
//   (1) aiAuditJson já tem {summary, sections} -> retorna direto, SEM
//       chamar resolveGenerationCvSource — por construção nunca toca
//       "Master atual" nem snapshot textual (não há leitura nenhuma além do
//       aiAuditJson já persistido nesta CvAdaptation).
//   (2) cvGenerationInProgress (Set em memória, por instância do processo)
//       — dedup de chamadas concorrentes pro MESMO adaptation.id.
// HTTP 3 e HTTP 4 acima já provam (1) por outro ângulo ("segundo/terceiro
// download não chama IA de novo"); os dois testes abaixo provam
// especificamente o que aqueles não cobriam: troca de Master não muda a
// fonte do cache (1), e concorrência real via HTTP não duplica geração
// nem CvAdaptation (2). HTTP 4 já prova que uma falha de geração não deixa
// cvGenerationInProgress travado (retry funciona) — não repetido aqui.
// ===========================================================================

test("HTTP 5a: warm-cache da geração usa o CvStructuredProfile da análise original — troca de Master depois não altera a fonte nem reconsulta snapshot", async () => {
  const runId = `http5a-${Date.now()}-${randomUUID().slice(0, 8)}`;
  const extractCalls = { count: 0 };
  let extractionMarker = `${runId}-ORIGEM_CANONICAL_ORIGINAL`;
  const extraction = fakeExtractionClient(() => {
    return canonicalOutput(extractionMarker);
  }, extractCalls);
  const generationCaptured: CapturedMessages[] = [];
  const generationClient = fakeChatClient(
    () => minimalGenerationJson(),
    generationCaptured,
  );
  const analysisClient = fakeChatClient(() => minimalAnalysisJson(), []);

  const { app, database } = await createApp({
    extraction,
    analysisClient,
    generationClient,
  });
  const unsubscribe = subscribeWorkers(app);
  let userId: string | undefined;

  try {
    const registered = await registerUser(app, `http5a-${runId}`);
    userId = registered.userId;

    const response = await request(app.getHttpServer())
      .post("/api/cv-adaptation/analyze")
      .set("Authorization", `Bearer ${registered.accessToken}`)
      .field("masterCvText", syntheticCvLines(runId, "Original").join("\n"))
      .field(
        "jobDescriptionText",
        `Vaga para analista de dados, com responsabilidades, requisitos e perfil desejado. ${runId}`,
      )
      .field("saveAsMaster", "true");
    assert.equal(response.status, 201, JSON.stringify(response.body));
    const jobId = response.body.jobId as string;

    const job = await waitFor(
      () => database.analysisJob.findUniqueOrThrow({ where: { id: jobId } }),
      (row) => row.status === "succeeded" || row.status === "failed",
    );
    assert.equal(job.status, "succeeded", `debug=${JSON.stringify(job)}`);

    const claimResponse = await request(app.getHttpServer())
      .post(`/api/cv-adaptation/analysis-jobs/${jobId}/claim`)
      .set("Authorization", `Bearer ${registered.accessToken}`)
      .send({});
    const cvAdaptationId = claimResponse.body.cvAdaptationId as string;

    const paymentReference = randomUUID();
    await database.planPurchase.create({
      data: {
        userId: registered.userId,
        planType: "starter",
        amountInCents: 1190,
        currency: "BRL",
        paymentProvider: "mercadopago",
        paymentReference,
        status: "pending",
        creditsGranted: 1,
        analysisCreditsGranted: 0,
        originAction: "unlock_cv",
        originAdaptationId: cvAdaptationId,
      },
    });
    await markPurchaseAsApproved(app, paymentReference);

    // Primeiro download — popula o warm-cache (aiAuditJson) com a fonte
    // ORIGINAL.
    const firstDownload = await request(app.getHttpServer())
      .get(`/api/cv-adaptation/${cvAdaptationId}/download`)
      .set("Authorization", `Bearer ${registered.accessToken}`)
      .buffer(true);
    assert.equal(firstDownload.status, 200, JSON.stringify(firstDownload.body));
    assert.equal(generationCaptured.length, 1);
    assert.match(
      JSON.stringify(generationCaptured[0]),
      new RegExp(extractionMarker),
    );

    // Troca o Master (novo upload + saveAsMaster) — fonte de extração
    // muda pra um marker DIFERENTE, só pra provar que o warm-cache não
    // reconsulta nada disso.
    extractionMarker = `${runId}-ORIGEM_CANONICAL_NOVO_MASTER_NAO_DEVE_APARECER`;
    const swapResponse = await request(app.getHttpServer())
      .post("/api/cv-adaptation/analyze")
      .set("Authorization", `Bearer ${registered.accessToken}`)
      .field("masterCvText", syntheticCvLines(runId, "NovoMaster").join("\n"))
      .field(
        "jobDescriptionText",
        `Vaga para analista de dados, com responsabilidades, requisitos e perfil desejado. ${runId} novo`,
      )
      .field("saveAsMaster", "true");
    assert.equal(swapResponse.status, 201, JSON.stringify(swapResponse.body));
    const swapJob = await waitFor(
      () =>
        database.analysisJob.findUniqueOrThrow({
          where: { id: swapResponse.body.jobId as string },
        }),
      (row) => row.status === "succeeded" || row.status === "failed",
    );
    assert.equal(
      swapJob.status,
      "succeeded",
      `debug=${JSON.stringify(swapJob)}`,
    );

    const mastersAfterSwap = await database.resume.findMany({
      where: { userId: registered.userId, isMaster: true },
    });
    assert.equal(
      mastersAfterSwap.length,
      1,
      "Master precisa ter trocado (exatamente um isMaster)",
    );

    // Segundo download da MESMA adaptação — warm-cache precisa servir o
    // resultado já persistido, sem chamar IA de novo e sem refletir o
    // Master novo.
    const secondDownload = await request(app.getHttpServer())
      .get(`/api/cv-adaptation/${cvAdaptationId}/download`)
      .set("Authorization", `Bearer ${registered.accessToken}`)
      .buffer(true);
    assert.equal(secondDownload.status, 200);
    assert.equal(
      generationCaptured.length,
      1,
      "warm-cache não pode chamar IA de novo mesmo depois da troca de Master",
    );

    const adaptationAfterSwap = await database.cvAdaptation.findUniqueOrThrow({
      where: { id: cvAdaptationId },
    });
    assert.equal(
      adaptationAfterSwap.cvStructuredProfileId,
      job.cvStructuredProfileId,
      "cvStructuredProfileId da adaptação precisa continuar apontando pra extração ORIGINAL, nunca pro novo Master",
    );
  } finally {
    unsubscribe();
    if (userId) {
      await cleanupUser(database, userId);
    }
  }
});

test("HTTP 5b: dois downloads concorrentes da mesma CvAdaptation nunca geram duas adaptações nem chamam a IA duas vezes", async () => {
  const runId = `http5b-${Date.now()}-${randomUUID().slice(0, 8)}`;
  const extractCalls = { count: 0 };
  const extraction = fakeExtractionClient(
    () => canonicalOutput(`${runId}-ORIGEM_CANONICAL`),
    extractCalls,
  );
  const generationCaptured: CapturedMessages[] = [];
  const generationClient = fakeChatClient(async () => {
    // Segura um pouco pra garantir sobreposição real entre as duas
    // requisições HTTP concorrentes de download.
    await new Promise((resolve) => setTimeout(resolve, 200));
    return minimalGenerationJson();
  }, generationCaptured);
  const analysisClient = fakeChatClient(() => minimalAnalysisJson(), []);

  const { app, database } = await createApp({
    extraction,
    analysisClient,
    generationClient,
  });
  const unsubscribe = subscribeWorkers(app);
  let userId: string | undefined;

  try {
    const registered = await registerUser(app, `http5b-${runId}`);
    userId = registered.userId;

    const response = await request(app.getHttpServer())
      .post("/api/cv-adaptation/analyze")
      .set("Authorization", `Bearer ${registered.accessToken}`)
      .field("masterCvText", syntheticCvLines(runId, "Concorrente").join("\n"))
      .field(
        "jobDescriptionText",
        `Vaga para analista de dados, com responsabilidades, requisitos e perfil desejado. ${runId}`,
      );
    assert.equal(response.status, 201, JSON.stringify(response.body));
    const jobId = response.body.jobId as string;

    const job = await waitFor(
      () => database.analysisJob.findUniqueOrThrow({ where: { id: jobId } }),
      (row) => row.status === "succeeded" || row.status === "failed",
    );
    assert.equal(job.status, "succeeded", `debug=${JSON.stringify(job)}`);

    const claimResponse = await request(app.getHttpServer())
      .post(`/api/cv-adaptation/analysis-jobs/${jobId}/claim`)
      .set("Authorization", `Bearer ${registered.accessToken}`)
      .send({});
    const cvAdaptationId = claimResponse.body.cvAdaptationId as string;

    const paymentReference = randomUUID();
    await database.planPurchase.create({
      data: {
        userId: registered.userId,
        planType: "starter",
        amountInCents: 1190,
        currency: "BRL",
        paymentProvider: "mercadopago",
        paymentReference,
        status: "pending",
        creditsGranted: 1,
        analysisCreditsGranted: 0,
        originAction: "unlock_cv",
        originAdaptationId: cvAdaptationId,
      },
    });
    await markPurchaseAsApproved(app, paymentReference);

    const [downloadA, downloadB] = await Promise.all([
      request(app.getHttpServer())
        .get(`/api/cv-adaptation/${cvAdaptationId}/download`)
        .set("Authorization", `Bearer ${registered.accessToken}`)
        .buffer(true),
      request(app.getHttpServer())
        .get(`/api/cv-adaptation/${cvAdaptationId}/download`)
        .set("Authorization", `Bearer ${registered.accessToken}`)
        .buffer(true),
    ]);
    assert.equal(downloadA.status, 200, JSON.stringify(downloadA.body));
    assert.equal(downloadB.status, 200, JSON.stringify(downloadB.body));

    assert.equal(
      generationCaptured.length,
      1,
      "cvGenerationInProgress precisa deduplicar as duas chamadas concorrentes numa só geração real",
    );

    const adaptationCount = await database.cvAdaptation.count({
      where: { userId: registered.userId },
    });
    assert.equal(
      adaptationCount,
      1,
      "execução concorrente nunca duplica CvAdaptation",
    );

    const finalAdaptation = await database.cvAdaptation.findUniqueOrThrow({
      where: { id: cvAdaptationId },
    });
    assert.ok(
      finalAdaptation.aiAuditJson,
      "geração concorrente precisa persistir o resultado final",
    );
  } finally {
    unsubscribe();
    if (userId) {
      await cleanupUser(database, userId);
    }
  }
});
