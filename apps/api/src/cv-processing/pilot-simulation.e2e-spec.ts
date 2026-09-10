// Fase 3B — piloto interno (docs/specs/2026-09-04-cv-canonical-profile-pipeline-plan.md,
// docs/specs/2026-09-05-cv-canonical-profile-pipeline-deploy-escuro.md).
//
// Simulação LOCAL completa e realista do piloto: sobe o AppModule real
// (Nest.js completo, HTTP real via supertest, Postgres real — earlycv_test)
// com a flag global DESLIGADA (nunca setamos
// CV_STRUCTURED_PROFILE_PIPELINE_ENABLED aqui) e uma única conta de teste
// promovida a internalRole "admin" — exatamente a configuração que a Fase
// 3A já validou como segura para o deploy real (deploy-escuro.md, item 5).
// Todos os 10 cenários exigidos pelo piloto são exercitados via requisições
// HTTP reais contra o processo Nest local (supertest), nunca chamando
// serviços internos diretamente, exceto para (a) avançar os workers
// (CvProcessingWorker/CvAnalysisWorker rodam via @Cron, desligado em
// NODE_ENV=test — processPendingBatch() é chamado manualmente para tornar o
// piloto determinístico em vez de esperar os 15s reais de cron) e (b)
// inspecionar invariantes de banco ao final de cada cenário.
//
// IA: CvStructuredProfileExtractionService não tem um modo SKIP_AI embutido
// (diferente do caminho legado /cv-adaptation-ai.service.ts) — ele aceita
// um ExtractionClient via @Optional() no construtor, e é assim que os specs
// de Fase 2C/2D/2G já o substituem por um fake determinístico. Fazemos o
// mesmo aqui via overrideProvider, para nunca fazer uma chamada real (paga)
// à OpenAI durante o piloto — decisão documentada no relatório final, não é
// uma lacuna de segurança (o storage também é substituído por um fake em
// memória, mesmo padrão de todo e2e-spec existente do projeto).
//
// Não roda automaticamente na suíte de CI — arquivo mantido para reexecução
// manual do piloto (node --test, mesmo runner dos demais e2e-spec), não
// como parte permanente de `npm run test`.
import "reflect-metadata";

import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { test } from "node:test";

import { type INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { Document, Packer, Paragraph, TextRun } from "docx";
import request from "supertest";

import { requestContextMiddleware } from "../analysis-protection/request-context.middleware";
import { AppModule } from "../app.module";
import { DatabaseService } from "../database/database.service";
import { StorageService } from "../storage/storage.service";
import type { MasterCvCanonicalExtractionOutput } from "../master-cv-canonical-extraction/master-cv-canonical-extraction.types";
import { CvProcessingWorker } from "./cv-processing.worker";
import { CvProcessingJobService } from "./cv-processing-job.service";
import { CvStructuredProfileExtractionService } from "./cv-structured-profile-extraction.service";
import { CvAnalysisWorker } from "../cv-adaptation/cv-analysis.worker";

const JOB_DESCRIPTION =
  "Vaga para analista pleno com responsabilidades de acompanhamento de indicadores, requisitos de experiencia previa, habilidades tecnicas em dados e colaboracao direta com produto e engenharia.";

// ---------------------------------------------------------------------------
// Métricas coletadas ao longo do piloto — impressas em console.table() ao
// final (seção "Relatório") e usadas para montar o relatório final entregue
// ao usuário.
// ---------------------------------------------------------------------------
type ScenarioMetric = {
  scenario: string;
  httpMs: number | null;
  cvProcessingMs: number | null;
  analysisMs: number | null;
  finalStatus: string;
  notes: string;
};
const metrics: ScenarioMetric[] = [];
const findings: string[] = [];

function record(metric: ScenarioMetric) {
  metrics.push(metric);
}

// ---------------------------------------------------------------------------
// Fake de extração (IA) — controlável por texto (permite forçar falha uma
// vez para o cenário 7, "falha e retry").
// ---------------------------------------------------------------------------
class ControllableExtractionClient {
  calls = 0;
  private readonly failOnceForMarkers = new Set<string>();

  failOnceWhenTextContains(marker: string) {
    this.failOnceForMarkers.add(marker);
  }

  async extract(input: {
    text: string;
  }): Promise<MasterCvCanonicalExtractionOutput> {
    this.calls += 1;
    for (const marker of this.failOnceForMarkers) {
      if (input.text.includes(marker)) {
        this.failOnceForMarkers.delete(marker);
        throw new Error(`falha simulada de extração (marcador: ${marker})`);
      }
    }
    const nameMatch = input.text.split("\n")[0] ?? "Candidato Piloto";
    return {
      canonicalProfile: {
        fullName: nameMatch,
        headline: "Analista",
        email: null,
        phone: null,
        linkedinUrl: null,
        location: { city: "São Paulo", state: "SP", country: "Brasil" },
        professionalSummary: "Resumo profissional gerado no piloto interno.",
        experiences: [
          {
            role: "Analista",
            company: "Empresa Piloto",
            location: "São Paulo",
            startDate: "2020",
            endDate: "2023",
            bullets: ["Atuou com indicadores e dados."],
            technologies: ["SQL"],
          },
        ],
        education: [
          {
            institution: "Universidade Piloto",
            degree: "Bacharelado",
            fieldOfStudy: "Ciência da Computação",
            startDate: "2015",
            endDate: "2019",
          },
        ],
        skills: ["SQL", "Excel", "Comunicação"],
        languages: [{ language: "Inglês", level: "Intermediário" }],
        certifications: [
          { name: "Certificação Piloto", issuer: "Instituto X", year: "2021" },
        ],
      },
      extractionCoverage: {
        identifiedFields: ["fullName", "skills"],
        missingFields: [],
        fieldStatus: {},
      },
      confidence: {},
      evidence: {},
    };
  }
}

class FakeStorage {
  private readonly objects = new Map<string, Buffer>();
  async putObject(key: string, body: Buffer) {
    this.objects.set(key, body);
    return `https://mock-storage.local/${key}`;
  }
  async getObject(key: string) {
    const obj = this.objects.get(key);
    if (!obj) {
      const error = new Error(`NoSuchKey: ${key}`) as Error & { name: string };
      error.name = "NoSuchKey";
      throw error;
    }
    return obj;
  }
  async deleteObject() {
    return;
  }
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

function buildCvText(name: string, marker: string): string {
  return [
    name,
    "Resumo",
    `Profissional com experiência em ${marker}, formação superior concluída em 2020 e boas habilidades de comunicação.`,
    "Experiência",
    `2020 - 2023 | Analista - ${marker}`,
    "Formação",
    "Bacharelado em Administração - Universidade Piloto",
  ].join("\n");
}

async function createApp(extractionClient: ControllableExtractionClient) {
  // Confirmação explícita, dentro do próprio piloto: a flag global do
  // pipeline NUNCA é setada aqui — exatamente a configuração de produção
  // real hoje (deploy-escuro.md item 3/4). A ativação, quando existir para
  // a conta de teste, vem só de internalRole=admin (ver promoteToAdmin).
  delete process.env.CV_STRUCTURED_PROFILE_PIPELINE_ENABLED;
  delete process.env.CV_STRUCTURED_PROFILE_PIPELINE_ALLOWLIST_USER_IDS;
  if (
    process.env.NODE_ENV === "test" &&
    !process.env.SKIP_TURNSTILE_VERIFICATION
  ) {
    process.env.SKIP_TURNSTILE_VERIFICATION = "true";
  }

  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(StorageService)
    .useValue(new FakeStorage())
    .overrideProvider(CvStructuredProfileExtractionService)
    .useValue(extractionClient)
    .compile();

  const app: INestApplication = moduleRef.createNestApplication();
  app.use(requestContextMiddleware);
  app.setGlobalPrefix("api");
  app.useGlobalPipes(
    new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }),
  );
  await app.init();

  return {
    app,
    database: app.get(DatabaseService),
    cvProcessingWorker: app.get(CvProcessingWorker),
    analysisWorker: app.get(CvAnalysisWorker),
    jobService: app.get(CvProcessingJobService),
  };
}

async function registerUser(app: INestApplication, prefix: string) {
  const email = `${prefix}+${randomUUID()}@earlycv.dev`;
  const response = await request(app.getHttpServer())
    .post("/api/auth/register")
    .send({ email, password: "Super-secret-123", name: `${prefix} User` });
  assert.equal(response.status, 201, JSON.stringify(response.body));
  return {
    accessToken: response.body.accessToken as string,
    userId: response.body.user.id as string,
    email,
  };
}

async function promoteToAdmin(database: DatabaseService, userId: string) {
  await database.user.update({
    where: { id: userId },
    data: { internalRole: "admin", isStaff: true },
  });
}

// IMPORTANTE: earlycv_test é um banco compartilhado por TODA a suíte de
// specs desta feature ao longo das fases — já acumula centenas de
// CvProcessingJob PENDING de execuções anteriores (achado documentado em
// deploy-escuro.md, "operacional, não um bug"). worker.processPendingBatch()
// varre PENDING globalmente (sem filtro por dono), então usá-lo aqui pegaria
// jobs antigos alheios em vez do job que este cenário acabou de criar. Por
// isso processamos sempre um job ESPECÍFICO por id (mesmo padrão de
// cv-analysis-pipeline.e2e-spec.ts#processOneCvJob) — nunca a varredura em
// lote — evitando qualquer interferência com o restante do banco de teste.
async function processCvJobById(
  jobService: CvProcessingJobService,
  worker: CvProcessingWorker,
  jobId: string,
) {
  const start = Date.now();
  const claimed = await jobService.claimOne(jobId, `pilot-worker-${randomUUID()}`);
  assert.ok(claimed, `CvProcessingJob ${jobId} deveria estar PENDING e reivindicável`);
  await (
    worker as unknown as { processJob: (job: typeof claimed) => Promise<void> }
  ).processJob(claimed);
  return { ms: Date.now() - start };
}

async function processAnalysisJobById(
  database: DatabaseService,
  worker: CvAnalysisWorker,
  jobId: string,
) {
  const start = Date.now();
  const before = await database.analysisJob.findUniqueOrThrow({
    where: { id: jobId },
  });
  assert.ok(
    before.cvProcessingJobId,
    `AnalysisJob ${jobId} sem cvProcessingJob associado`,
  );
  const cvProcessingJob = await database.cvProcessingJob.findUniqueOrThrow({
    where: { id: before.cvProcessingJobId },
  });
  const claimed = await (
    worker as unknown as {
      claim: (id: string) => Promise<{ id: string } | null>;
    }
  ).claim(jobId);
  assert.ok(claimed, `AnalysisJob ${jobId} deveria estar pending e reivindicável`);
  await (
    worker as unknown as {
      processReadyJob: (
        job: unknown,
        cvProcessingJob: { cvStructuredProfileId: string | null },
      ) => Promise<void>;
    }
  ).processReadyJob(claimed, {
    cvStructuredProfileId: cvProcessingJob.cvStructuredProfileId,
  });
  return { ms: Date.now() - start };
}

async function timedHttp<T>(fn: () => Promise<T>): Promise<{ ms: number; result: T }> {
  const start = Date.now();
  const result = await fn();
  return { ms: Date.now() - start, result };
}

test("Fase 3B — piloto interno: 10 cenários end-to-end via HTTP real (admin/allowlist, flag global desligada)", async (t) => {
  const extractionClient = new ControllableExtractionClient();
  const { app, database, cvProcessingWorker, analysisWorker, jobService } =
    await createApp(extractionClient);

  try {
    const admin = await registerUser(app, "pilot-admin");
    await promoteToAdmin(database, admin.userId);
    const authHeader = `Bearer ${admin.accessToken}`;

    // -------------------------------------------------------------------
    // 0. Confirma a config real do piloto: flag global ausente/false, sem
    //    allowlist — só o internalRole=admin ativa o pipeline pra esta
    //    conta (cv-processing-flag-resolver.service.ts).
    // -------------------------------------------------------------------
    assert.notEqual(
      process.env.CV_STRUCTURED_PROFILE_PIPELINE_ENABLED,
      "true",
    );
    assert.ok(!process.env.CV_STRUCTURED_PROFILE_PIPELINE_ALLOWLIST_USER_IDS);

    // -------------------------------------------------------------------
    // Cenário 1a + 2: primeiro Master do usuário, via TEXTO COLADO.
    // -------------------------------------------------------------------
    const textA = buildCvText("Fulano Piloto Texto", "dados");
    const { ms: httpMsA, result: resA } = await timedHttp(() =>
      request(app.getHttpServer())
        .post("/api/resumes")
        .set("Authorization", authHeader)
        .field("title", "CV Master (texto colado)")
        .field("rawText", textA),
    );
    assert.equal(resA.status, 201, JSON.stringify(resA.body));
    assert.equal(resA.body.isMaster, true);

    let jobsForUser = await database.cvProcessingJob.findMany({
      where: { cvSource: { userId: admin.userId } },
      orderBy: { createdAt: "asc" },
    });
    assert.equal(
      jobsForUser.length,
      1,
      "upload de texto deveria criar exatamente 1 CvProcessingJob",
    );
    assert.equal(jobsForUser[0]?.masterIntent, "PROMOTE_IF_FIRST");

    const cvJobABefore = await request(app.getHttpServer())
      .get(`/api/cv-processing-jobs/${jobsForUser[0]?.id}`)
      .set("Authorization", authHeader);
    assert.equal(cvJobABefore.body.status, "PENDING");

    const t0 = Date.now();
    const batchA = await processCvJobById(
      jobService,
      cvProcessingWorker,
      jobsForUser[0]!.id,
    );
    const cvJobAAfter = await request(app.getHttpServer())
      .get(`/api/cv-processing-jobs/${jobsForUser[0]?.id}`)
      .set("Authorization", authHeader);
    assert.equal(cvJobAAfter.body.status, "READY");
    const pollDeltaA = Date.now() - t0;

    record({
      scenario: "1a/2 — primeiro Master via texto colado",
      httpMs: httpMsA,
      cvProcessingMs: batchA.ms,
      analysisMs: null,
      finalStatus: cvJobAAfter.body.status,
      notes: `polling PENDING->READY (ciclo forçado, não os 15s de cron reais): ${pollDeltaA}ms`,
    });

    const designationA = await database.cvMasterDesignation.findFirst({
      where: { userId: admin.userId, supersededAt: null },
    });
    assert.ok(designationA, "Master deveria ter sido promovido (cenário 1a/2)");
    const userProfileA = await database.userProfile.findUnique({
      where: { userId: admin.userId },
    });
    assert.equal(userProfileA?.fullName, "Fulano Piloto Texto");

    const talentProfileA = await database.talentProfile.findUnique({
      where: { userId: admin.userId },
    });
    assert.ok(talentProfileA, "TalentProfile deveria existir após o processamento");
    const eduObsA = await database.talentEducationObservation.count({
      where: { talentProfileId: talentProfileA!.id },
    });
    const compObsA = await database.talentCompetencyObservation.count({
      where: { talentProfileId: talentProfileA!.id },
    });
    assert.ok(eduObsA > 0 && compObsA > 0, "Base de Talentos deveria ter observações após o cenário 1a");

    // -------------------------------------------------------------------
    // Cenário 1b + 3: substituição do Master, via ARQUIVO (.docx real).
    // -------------------------------------------------------------------
    const docxBuffer = await buildDocxBuffer([
      "Fulano Piloto Arquivo",
      "Resumo",
      "Profissional com experiência em produto, formação superior concluída em 2019 e habilidades analíticas.",
      "Experiência",
      "2019 - 2023 | Product Analyst - produto",
      "Formação",
      "Bacharelado em Engenharia - Universidade Piloto",
    ]);
    const { ms: httpMsB, result: resB } = await timedHttp(() =>
      request(app.getHttpServer())
        .post("/api/resumes")
        .set("Authorization", authHeader)
        .field("title", "CV Master (arquivo)")
        .field("isPrimary", "true")
        .field("turnstileToken", "pilot-test-token")
        .attach("file", docxBuffer, {
          filename: "cv-master.docx",
          contentType:
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        }),
    );
    assert.equal(resB.status, 201, JSON.stringify(resB.body));

    jobsForUser = await database.cvProcessingJob.findMany({
      where: { cvSource: { userId: admin.userId } },
      orderBy: { createdAt: "asc" },
    });
    assert.equal(
      jobsForUser.length,
      2,
      "upload de arquivo deveria criar exatamente +1 CvProcessingJob (total 2)",
    );
    const jobB = jobsForUser[1]!;
    assert.equal(
      jobB.masterIntent,
      "PROMOTE_EXPLICIT",
      "upload com isPrimary=true sobre Master já existente deveria ser PROMOTE_EXPLICIT",
    );

    const batchB = await processCvJobById(jobService, cvProcessingWorker, jobB.id);
    const cvJobBAfter = await database.cvProcessingJob.findUniqueOrThrow({
      where: { id: jobB.id },
    });
    assert.equal(cvJobBAfter.status, "READY");

    const designationsAfterB = await database.cvMasterDesignation.findMany({
      where: { userId: admin.userId, supersededAt: null },
    });
    assert.equal(
      designationsAfterB.length,
      1,
      "exatamente uma CvMasterDesignation ativa após a substituição",
    );
    assert.notEqual(designationsAfterB[0]?.id, designationA?.id);

    const userProfileB = await database.userProfile.findUnique({
      where: { userId: admin.userId },
    });
    assert.equal(userProfileB?.fullName, "Fulano Piloto Arquivo");

    record({
      scenario: "1b/3 — substituição do Master via arquivo (.docx)",
      httpMs: httpMsB,
      cvProcessingMs: batchB.ms,
      analysisMs: null,
      finalStatus: cvJobBAfter.status,
      notes: "docx real gerado em memória (pacote docx), extraído via mammoth",
    });

    // Achado: upload de Master via POST /resumes (create()) nunca preenche
    // CvProcessingJob.resumeId — resumes.service.ts#create() chama
    // cvProcessingEntrypoint.enqueueFromUserText() sem esse parâmetro
    // (diferente de #setPrimaryCanonical(), que sempre o preenche). Como
    // resultado, a CvMasterDesignation criada por um upload direto fica
    // com resumeId=null, mesmo com Resume.isMaster=true já setado
    // sincronamente na mesma requisição (create() flipa isMaster na
    // própria transação, independente da promoção canônica assíncrona).
    if (!designationsAfterB[0]?.resumeId) {
      findings.push(
        "ACHADO: upload de Master via POST /resumes (create()) nunca " +
          "preenche CvMasterDesignation.resumeId (fica null) — só " +
          "POST /resumes/:id/set-primary faz essa ligação (cv-processing-" +
          "entrypoint.service.ts#enqueueFromUserText só recebe resumeId a " +
          "partir de resumes.service.ts#setPrimaryCanonical(), nunca de " +
          "#create()). A designação continua funcionalmente correta " +
          "(aponta para um CvStructuredProfile READY válido), mas a FK " +
          "reversa Resume<->designação fica incompleta para todo Master " +
          "promovido diretamente no upload. NÃO CORRIGIDO nesta fase — " +
          "reportado como achado real, não um bug introduzido por este piloto.",
      );
    }

    // -------------------------------------------------------------------
    // Cenário 4: inputMode "profile" — reusa o Master atual, sem novo texto.
    // -------------------------------------------------------------------
    const extractCallsBeforeProfile = extractionClient.calls;
    const { ms: httpMsProfile, result: resProfile } = await timedHttp(() =>
      request(app.getHttpServer())
        .post("/api/cv-adaptation/analyze")
        .set("Authorization", authHeader)
        .field("jobDescriptionText", JOB_DESCRIPTION)
        .field("inputMode", "profile"),
    );
    assert.equal(resProfile.status, 201, JSON.stringify(resProfile.body));
    const profileAnalysisJobId = resProfile.body.jobId as string;
    const profileAnalysisRow = await database.analysisJob.findUniqueOrThrow({
      where: { id: profileAnalysisJobId },
    });
    assert.equal(
      profileAnalysisRow.cvProcessingJobId,
      jobB.id,
      "inputMode profile deveria reusar o CvProcessingJob do Master atual (dedup)",
    );

    const analysisProfileStart = Date.now();
    await processAnalysisJobById(database, analysisWorker, profileAnalysisJobId);
    const analysisProfileFinal = await database.analysisJob.findUniqueOrThrow({
      where: { id: profileAnalysisJobId },
    });
    const analysisProfileMs = Date.now() - analysisProfileStart;
    assert.equal(analysisProfileFinal.status, "succeeded");
    assert.equal(
      extractionClient.calls,
      extractCallsBeforeProfile,
      "inputMode profile não deveria disparar nenhuma extração nova",
    );

    record({
      scenario: "4 — inputMode profile (reusa Master, sem extração nova)",
      httpMs: httpMsProfile,
      cvProcessingMs: 0,
      analysisMs: analysisProfileMs,
      finalStatus: analysisProfileFinal.status,
      notes: "extractionClient.calls inalterado — confirma reuso",
    });

    // -------------------------------------------------------------------
    // Cenário 5: CV diferente do Master, SEM promoção (masterIntent NONE).
    // -------------------------------------------------------------------
    const textDiff = buildCvText("Candidato Diferente Sem Promocao", "marketing");
    const { ms: httpMsDiff, result: resDiff } = await timedHttp(() =>
      request(app.getHttpServer())
        .post("/api/cv-adaptation/analyze")
        .set("Authorization", authHeader)
        .field("jobDescriptionText", JOB_DESCRIPTION)
        .field("masterCvText", textDiff),
    );
    assert.equal(resDiff.status, 201, JSON.stringify(resDiff.body));
    const diffAnalysisJobId = resDiff.body.jobId as string;
    const diffAnalysisRow = await database.analysisJob.findUniqueOrThrow({
      where: { id: diffAnalysisJobId },
    });
    const diffCvJob = await database.cvProcessingJob.findUniqueOrThrow({
      where: { id: diffAnalysisRow.cvProcessingJobId as string },
    });
    assert.equal(diffCvJob.masterIntent, "NONE");

    const batchDiff = await processCvJobById(jobService, cvProcessingWorker, diffCvJob.id);
    const analysisDiffStart = Date.now();
    await processAnalysisJobById(database, analysisWorker, diffAnalysisJobId);
    const analysisDiffMs = Date.now() - analysisDiffStart;
    const diffAnalysisFinal = await database.analysisJob.findUniqueOrThrow({
      where: { id: diffAnalysisJobId },
    });
    assert.equal(diffAnalysisFinal.status, "succeeded");

    const designationsAfterDiff = await database.cvMasterDesignation.findMany({
      where: { userId: admin.userId, supersededAt: null },
    });
    assert.equal(designationsAfterDiff.length, 1);
    assert.equal(
      designationsAfterDiff[0]?.id,
      designationsAfterB[0]?.id,
      "Master não deveria ter mudado (masterIntent NONE)",
    );

    record({
      scenario: "5 — CV diferente do Master, sem promoção (NONE)",
      httpMs: httpMsDiff,
      cvProcessingMs: batchDiff.ms,
      analysisMs: analysisDiffMs,
      finalStatus: diffAnalysisFinal.status,
      notes: "Master permanece inalterado (confirmado)",
    });

    // -------------------------------------------------------------------
    // Cenário 6: análise com promoção EXPLÍCITA (saveAsMaster: true) via
    // /cv-adaptation/analyze — caminho DISTINTO de /resumes (sem Resume
    // associado ao CvProcessingJob resultante: ver nota nos findings).
    // -------------------------------------------------------------------
    const textExplicit = buildCvText("Candidato Promovido Explicito", "produto");
    const { ms: httpMsExplicit, result: resExplicit } = await timedHttp(() =>
      request(app.getHttpServer())
        .post("/api/cv-adaptation/analyze")
        .set("Authorization", authHeader)
        .field("jobDescriptionText", JOB_DESCRIPTION)
        .field("masterCvText", textExplicit)
        .field("saveAsMaster", "true"),
    );
    assert.equal(resExplicit.status, 201, JSON.stringify(resExplicit.body));
    const explicitAnalysisRow = await database.analysisJob.findUniqueOrThrow({
      where: { id: resExplicit.body.jobId as string },
    });
    const explicitCvJob = await database.cvProcessingJob.findUniqueOrThrow({
      where: { id: explicitAnalysisRow.cvProcessingJobId as string },
    });
    assert.equal(explicitCvJob.masterIntent, "PROMOTE_EXPLICIT");

    const batchExplicit = await processCvJobById(
      jobService,
      cvProcessingWorker,
      explicitCvJob.id,
    );
    const analysisExplicitStart = Date.now();
    await processAnalysisJobById(database, analysisWorker, explicitAnalysisRow.id);
    const analysisExplicitMs = Date.now() - analysisExplicitStart;
    const explicitAnalysisFinal = await database.analysisJob.findUniqueOrThrow({
      where: { id: explicitAnalysisRow.id },
    });
    assert.equal(explicitAnalysisFinal.status, "succeeded");

    const designationsAfterExplicit = await database.cvMasterDesignation.findMany(
      { where: { userId: admin.userId, supersededAt: null } },
    );
    assert.equal(designationsAfterExplicit.length, 1);
    assert.notEqual(designationsAfterExplicit[0]?.id, designationsAfterB[0]?.id);

    // Finding: o Resume que era Master (upload B, arquivo .docx) — o que
    // aconteceu com Resume.isMaster agora que a designação ativa mudou para
    // um CvProcessingJob SEM resumeId (veio de masterCvText solto, não de
    // masterResumeId)? syncResumeIsMaster só acontece quando job.resumeId
    // está preenchido (cv-processing.worker.ts) — aqui não está.
    const resumeBRow = await database.resume.findUnique({
      where: { id: resB.body.id as string },
    });
    if (resumeBRow?.isMaster) {
      findings.push(
        "DIVERGÊNCIA CONFIRMADA: após uma promoção explícita via " +
          "POST /cv-adaptation/analyze (saveAsMaster=true, sem masterResumeId), " +
          "a CvMasterDesignation ativa passa a apontar para um CvStructuredProfile " +
          "sem Resume associado (job.resumeId nulo), mas o Resume anterior " +
          "(upload de arquivo, cenário 1b/3) permanece com isMaster=true no banco — " +
          "syncResumeIsMaster só roda quando o CvProcessingJob carrega resumeId " +
          "(cv-processing.worker.ts), o que nunca acontece neste caminho. " +
          "Isso quebra a invariante 'exatamente um Resume.isMaster e ele aponta " +
          "para o mesmo CV da designação ativa' pedida no piloto — a UI de " +
          "'Meu CV' (baseada em Resume) ficaria mostrando um CV que não é mais " +
          "o Master real do sistema (CvMasterDesignation). NÃO CORRIGIDO nesta " +
          "fase (fora do escopo do piloto) — reportado como achado real.",
      );
    } else {
      findings.push(
        "Confirmado: promoção explícita via /cv-adaptation/analyze (sem " +
          "masterResumeId) NÃO mantém Resume.isMaster desatualizado — investigar " +
          "se algum outro caminho já demove o Resume anterior nesse fluxo.",
      );
    }

    record({
      scenario: "6 — promoção explícita via análise (saveAsMaster=true)",
      httpMs: httpMsExplicit,
      cvProcessingMs: batchExplicit.ms,
      analysisMs: analysisExplicitMs,
      finalStatus: explicitAnalysisFinal.status,
      notes: "ver findings[] para divergência Resume.isMaster x CvMasterDesignation",
    });

    // -------------------------------------------------------------------
    // Cenário 7: falha e retry — extração falha na 1a tentativa (mock
    // forçado), MAX_CV_PROCESSING_ATTEMPTS permite retry automático
    // (attempts < 3 -> volta a PENDING sozinho), sem duplicar.
    // -------------------------------------------------------------------
    const RETRY_MARKER = "MARCADOR_FALHA_PILOTO_7";
    const textRetry = buildCvText(`Candidato Retry ${RETRY_MARKER}`, "operacoes");
    extractionClient.failOnceWhenTextContains(RETRY_MARKER);

    const { ms: httpMsRetry, result: resRetry } = await timedHttp(() =>
      request(app.getHttpServer())
        .post("/api/cv-adaptation/analyze")
        .set("Authorization", authHeader)
        .field("jobDescriptionText", JOB_DESCRIPTION)
        .field("masterCvText", textRetry),
    );
    assert.equal(resRetry.status, 201, JSON.stringify(resRetry.body));
    const retryAnalysisRow = await database.analysisJob.findUniqueOrThrow({
      where: { id: resRetry.body.jobId as string },
    });
    const retryCvJobId = retryAnalysisRow.cvProcessingJobId as string;

    // 1a tentativa: extração falha (mock), job volta a PENDING sozinho
    // (attempts=1 < MAX_CV_PROCESSING_ATTEMPTS=3 -> markFailed reagenda).
    const retryBatch1 = await processCvJobById(jobService, cvProcessingWorker, retryCvJobId);
    const retryJobAfterFail = await database.cvProcessingJob.findUniqueOrThrow({
      where: { id: retryCvJobId },
    });
    assert.equal(
      retryJobAfterFail.status,
      "PENDING",
      "1 tentativa falha, attempts < máximo, deveria voltar a PENDING (retry automático)",
    );
    assert.equal(retryJobAfterFail.attempts, 1);
    assert.match(retryJobAfterFail.lastError ?? "", /falha simulada de extração/);

    // 2a tentativa (retry): extração agora sucede.
    const retryBatch2 = await processCvJobById(jobService, cvProcessingWorker, retryCvJobId);
    const retryJobAfterRetry = await database.cvProcessingJob.findUniqueOrThrow({
      where: { id: retryCvJobId },
    });
    assert.equal(retryJobAfterRetry.status, "READY");

    // Sem duplicação: só 1 CvProcessingJob e 1 CvStructuredProfile para
    // este cvSourceId.
    const cvJobsForSource = await database.cvProcessingJob.count({
      where: { cvSourceId: retryJobAfterRetry.cvSourceId },
    });
    const structuredProfilesForSource =
      await database.cvStructuredProfile.count({
        where: { cvSourceId: retryJobAfterRetry.cvSourceId },
      });
    assert.equal(cvJobsForSource, 1, "retry não deveria duplicar CvProcessingJob");
    assert.equal(
      structuredProfilesForSource,
      1,
      "retry não deveria duplicar CvStructuredProfile",
    );

    const analysisRetryStart = Date.now();
    await processAnalysisJobById(database, analysisWorker, retryAnalysisRow.id);
    const analysisRetryMs = Date.now() - analysisRetryStart;
    const retryAnalysisFinal = await database.analysisJob.findUniqueOrThrow({
      where: { id: retryAnalysisRow.id },
    });
    assert.equal(retryAnalysisFinal.status, "succeeded");

    record({
      scenario: "7 — falha e retry (extração falha 1x, recupera sem duplicar)",
      httpMs: httpMsRetry,
      cvProcessingMs: retryBatch1.ms + retryBatch2.ms,
      analysisMs: analysisRetryMs,
      finalStatus: retryAnalysisFinal.status,
      notes: `1ª tentativa falhou (${retryBatch1.ms}ms), 2ª (retry) sucedeu (${retryBatch2.ms}ms) — 0 duplicatas`,
    });

    // -------------------------------------------------------------------
    // Cenário 8: polling dedicado — ciclo PENDING/PROCESSING -> READY /
    // succeeded, medindo tempo real de wall-clock do polling (HTTP) em
    // paralelo ao avanço do worker.
    // -------------------------------------------------------------------
    const textPolling = buildCvText("Candidato Polling Dedicado", "logistica");
    const resPolling = await request(app.getHttpServer())
      .post("/api/cv-adaptation/analyze")
      .set("Authorization", authHeader)
      .field("jobDescriptionText", JOB_DESCRIPTION)
      .field("masterCvText", textPolling);
    assert.equal(resPolling.status, 201, JSON.stringify(resPolling.body));
    const pollingJobId = resPolling.body.jobId as string;
    const pollingAnalysisRow = await database.analysisJob.findUniqueOrThrow({
      where: { id: pollingJobId },
    });
    const pollingCvJobId = pollingAnalysisRow.cvProcessingJobId as string;

    const pollStart = Date.now();
    let pollCount = 0;
    let lastStatus = "pending";
    // Dispara o worker "em paralelo" (chamada única, já que não há cron
    // real em NODE_ENV=test) enquanto o polling HTTP roda em loop curto,
    // igual ao comportamento real do frontend.
    const workerPromise = (async () => {
      await processCvJobById(jobService, cvProcessingWorker, pollingCvJobId);
      await processAnalysisJobById(database, analysisWorker, pollingJobId);
    })();
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      pollCount += 1;
      const pollRes = await request(app.getHttpServer())
        .get(`/api/cv-adaptation/analysis-jobs/${pollingJobId}`)
        .set("Authorization", authHeader);
      lastStatus = pollRes.body.status;
      if (lastStatus === "succeeded" || lastStatus === "failed") break;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    await workerPromise;
    const pollTotalMs = Date.now() - pollStart;

    record({
      scenario: "8 — polling GET /cv-adaptation/analysis-jobs/:id",
      httpMs: null,
      cvProcessingMs: null,
      analysisMs: pollTotalMs,
      finalStatus: lastStatus,
      notes: `${pollCount} requisições de polling até status final (worker acionado manualmente, não via cron real de 15s)`,
    });
    assert.equal(lastStatus, "succeeded");

    // -------------------------------------------------------------------
    // Cenário 9: exclusão do Master.
    //
    // Finding intermediário descoberto ao montar este cenário: um upload
    // de Master via POST /resumes (isPrimary=true, caminho create()) NUNCA
    // preenche CvProcessingJob.resumeId nem Resume.cvSourceId —
    // resumes.service.ts#create() chama
    // cvProcessingEntrypoint.enqueueFromUserText() sem o parâmetro
    // resumeId (diferente de #setPrimaryCanonical(), que sempre o
    // preenche). Resultado observado: a CvMasterDesignation criada por um
    // upload direto fica com resumeId=null para sempre, mesmo com
    // Resume.isMaster=true no mesmo Resume (o flip de isMaster acontece
    // síncrono, na transação de create(), independente da promoção
    // canônica) — só é reconciliada mais tarde se o usuário chamar
    // set-primary sobre esse mesmo Resume. Registrado abaixo como achado;
    // para montar um cenário 9 realista de "Master ligado a um Resume",
    // usamos o caminho que de fato liga os dois: cria o Resume como NÃO
    // master, depois chama POST /resumes/:id/set-primary explicitamente
    // (mesmo endpoint pedido no enunciado do piloto para o cenário 3).
    // -------------------------------------------------------------------
    const textFinalMaster = buildCvText("Candidato Master Final Antes Delete", "financas");
    const resFinalMasterDraft = await request(app.getHttpServer())
      .post("/api/resumes")
      .set("Authorization", authHeader)
      .field("title", "CV Master (antes da exclusão)")
      .field("isPrimary", "false")
      .field("rawText", textFinalMaster);
    assert.equal(
      resFinalMasterDraft.status,
      201,
      JSON.stringify(resFinalMasterDraft.body),
    );
    const finalMasterResumeId = resFinalMasterDraft.body.id as string;

    const { result: setPrimaryRes } = await timedHttp(() =>
      request(app.getHttpServer())
        .post(`/api/resumes/${finalMasterResumeId}/set-primary`)
        .set("Authorization", authHeader),
    );
    assert.equal(setPrimaryRes.status, 200, JSON.stringify(setPrimaryRes.body));
    const pendingSetPrimaryJobId = setPrimaryRes.body.cvProcessingJobId as string;
    assert.ok(pendingSetPrimaryJobId, "set-primary deveria enfileirar um CvProcessingJob (Resume novo, sem extração pronta)");

    await processCvJobById(jobService, cvProcessingWorker, pendingSetPrimaryJobId);

    const designationBeforeDelete = await database.cvMasterDesignation.findFirst(
      { where: { userId: admin.userId, supersededAt: null } },
    );
    assert.equal(designationBeforeDelete?.resumeId, finalMasterResumeId);
    const userProfileBeforeDelete = await database.userProfile.findUnique({
      where: { userId: admin.userId },
    });
    assert.equal(userProfileBeforeDelete?.fullName, "Candidato Master Final Antes Delete");

    const { ms: deleteMs, result: deleteRes } = await timedHttp(() =>
      request(app.getHttpServer())
        .delete(`/api/resumes/${finalMasterResumeId}`)
        .set("Authorization", authHeader),
    );
    assert.equal(deleteRes.status, 200, JSON.stringify(deleteRes.body));

    const designationAfterDelete = await database.cvMasterDesignation.findFirst(
      { where: { userId: admin.userId, supersededAt: null } },
    );
    const userProfileAfterDelete = await database.userProfile.findUnique({
      where: { userId: admin.userId },
    });
    const remainingMasterResumes = await database.resume.count({
      where: { userId: admin.userId, isMaster: true },
    });

    if (designationAfterDelete) {
      findings.push(
        "Cenário 9 (exclusão de Master): a CvMasterDesignation permanece " +
          `ATIVA (supersededAt=null, id=${designationAfterDelete.id}) após o ` +
          "DELETE do Resume que a originou — resumeId é apenas SetNull pela FK " +
          "(schema.prisma, CvMasterDesignation.resume onDelete: SetNull), " +
          "nenhum código em resumes.service.ts#remove() chama o serviço de " +
          "promoção para supersedê-la explicitamente. UserProfile permanece " +
          `intacto (fullName='${userProfileAfterDelete?.fullName}') — 'preferências ` +
          "preservadas' se confirma, mas 'designação supersedida' (texto do " +
          "prompt do piloto, citando seção 6 de uma revisão anterior do plano " +
          "que não está mais neste repositório) NÃO se confirma: a designação " +
          "fica órfã (ativa, sem Resume, mas com CvStructuredProfile ainda " +
          "válido) em vez de superseded. Nenhuma promoção automática de outro " +
          "CV acontece (confirmado — isso está correto). NÃO CORRIGIDO nesta " +
          "fase — reportado como achado real, pendente de decisão de produto " +
          "(a designação órfã ainda é factualmente utilizável, já que aponta " +
          "para um CvStructuredProfile READY, então não é um estado quebrado, " +
          "mas diverge do texto do plano).",
      );
    } else {
      findings.push(
        "Cenário 9: confirmado — o DELETE do Resume Master supersede a " +
          "CvMasterDesignation ativa (nenhuma fica ativa após a exclusão), " +
          "preferências (UserProfile) preservadas, sem promoção automática.",
      );
    }
    assert.equal(
      remainingMasterResumes,
      0,
      "nenhum outro Resume deveria ter sido promovido automaticamente",
    );

    record({
      scenario: "9 — exclusão do Master (Resume)",
      httpMs: deleteMs,
      cvProcessingMs: null,
      analysisMs: null,
      finalStatus: deleteRes.status === 200 ? "ok" : "erro",
      notes: "ver findings[] para o comportamento real observado da designação",
    });

    // -------------------------------------------------------------------
    // Cenário 10: claim guest -> conta. Confirma, com evidência real (não
    // apenas leitura de código), que guest nunca é elegível ao pipeline
    // novo nesta configuração (flag global desligada) — logo o claim
    // granular (ClaimSourceGrant) não tem CvProcessingJob de guest real
    // para reivindicar neste piloto.
    // -------------------------------------------------------------------
    const cvProcessingJobsBeforeGuest = await database.cvProcessingJob.count();
    const guestResText = buildCvText("Visitante Piloto Sem Pipeline Novo", "vendas");
    const guestRes = await request(app.getHttpServer())
      .post("/api/cv-adaptation/analyze-guest")
      .field("jobDescriptionText", JOB_DESCRIPTION)
      .field("masterCvText", guestResText);
    assert.equal(guestRes.status, 201, JSON.stringify(guestRes.body));
    const guestJobId = guestRes.body.jobId as string;
    const guestAnalysisRow = await database.analysisJob.findUniqueOrThrow({
      where: { id: guestJobId },
    });
    const cvProcessingJobsAfterGuest = await database.cvProcessingJob.count();

    // O caminho legado processa a análise de visitante em background
    // (fire-and-forget, .catch apenas loga — comportamento legado
    // preexistente, fora do escopo desta feature). Espera o job legado
    // terminar antes do app.close() do finally, só para não deixar uma
    // Promise solta gerando um log de erro cosmético (engine desconectada)
    // depois do teste já ter passado — não afeta nenhuma asserção acima.
    {
      const deadline = Date.now() + 5000;
      let row = guestAnalysisRow;
      while (
        (row.status === "processing" || row.status === "pending") &&
        Date.now() < deadline
      ) {
        await new Promise((resolve) => setTimeout(resolve, 25));
        row = await database.analysisJob.findUniqueOrThrow({
          where: { id: guestJobId },
        });
      }
    }

    assert.equal(
      guestAnalysisRow.cvProcessingJobId,
      null,
      "guest, com a flag global desligada, nunca deveria tocar o pipeline novo",
    );
    assert.equal(
      cvProcessingJobsAfterGuest,
      cvProcessingJobsBeforeGuest,
      "análise de visitante não deveria criar nenhum CvProcessingJob nesta configuração",
    );

    findings.push(
      "Cenário 10 (claim guest -> conta): NÃO EXERCITADO de ponta a ponta via " +
        "HTTP real neste piloto. Confirmado com evidência de banco (não só " +
        "leitura de código): uma análise de visitante real, na configuração " +
        "exata do piloto (flag global desligada, guest sem internalRole/" +
        "allowlist possível — guestSessionHash não é aceito como allowlist " +
        "nesta fase), gera um AnalysisJob com cvProcessingJobId=null — ou " +
        "seja, nunca produz um CvSource/CvProcessingJob no pipeline novo para " +
        "o ClaimSourceGrantService reivindicar. cv-processing-flag-resolver." +
        "service.ts#isEnabledFor retorna false sempre que context.userId está " +
        "ausente, quando a flag global está desligada (comentário no próprio " +
        "arquivo confirma: decisão deliberada, 'Guest permanece SEMPRE no " +
        "legado nesta fase'). O mecanismo de claim granular em si (Claim" +
        "SourceGrantService) já está coberto e validado por " +
        "claim-guest-analysis-job-canonical.e2e-spec.ts e claim-source-grant." +
        "service.spec.ts (Fase 2E), usando fixtures inseridas diretamente no " +
        "banco para simular um guest que passou pelo pipeline novo — mas isso " +
        "não é o mesmo que exercitar o fluxo real neste piloto. O que falta " +
        "para testar isso de ponta a ponta no piloto: um mecanismo específico " +
        "de ativação para guest (ex.: allowlist por guestSessionHash), que o " +
        "próprio cv-processing-flag-resolver.service.ts já reserva no tipo " +
        "CvStructuredProfilePipelineContext#guestSessionHash mas explicitamente " +
        "não implementa nesta fase ('decisão adiada para quando isso acontecer').",
    );

    record({
      scenario: "10 — claim guest→conta",
      httpMs: null,
      cvProcessingMs: null,
      analysisMs: null,
      finalStatus: "não exercitado (guest nunca elegível nesta config)",
      notes: "ver findings[] para justificativa completa com evidência",
    });

    // -------------------------------------------------------------------
    // Consolidado final: contagem de jobs por estado, duplicações.
    // -------------------------------------------------------------------
    const allCvJobsForUser = await database.cvProcessingJob.findMany({
      where: { cvSource: { userId: admin.userId } },
    });
    const statusCounts = allCvJobsForUser.reduce<Record<string, number>>(
      (acc, job) => {
        acc[job.status] = (acc[job.status] ?? 0) + 1;
        return acc;
      },
      {},
    );
    findings.push(
      `Consolidado CvProcessingJob (usuário admin do piloto): ${JSON.stringify(statusCounts)} — total ${allCvJobsForUser.length}`,
    );
    const pendingOrProcessing = allCvJobsForUser.filter(
      (j) => j.status === "PENDING" || j.status === "PROCESSING",
    );
    assert.equal(
      pendingOrProcessing.length,
      0,
      "nenhum CvProcessingJob deveria sobrar pending/processing ao final do piloto",
    );

    const allAnalysisJobsForUser = await database.analysisJob.findMany({
      where: { userId: admin.userId },
    });
    const analysisStatusCounts = allAnalysisJobsForUser.reduce<
      Record<string, number>
    >((acc, job) => {
      acc[job.status] = (acc[job.status] ?? 0) + 1;
      return acc;
    }, {});
    findings.push(
      `Consolidado AnalysisJob (usuário admin do piloto): ${JSON.stringify(analysisStatusCounts)} — total ${allAnalysisJobsForUser.length}`,
    );

    findings.push(
      `Chamadas reais ao ExtractionClient (fake/mock, nunca OpenAI real): ${extractionClient.calls}. ` +
        "Custo de IA real: N/A — CvStructuredProfileExtractionService foi substituído por um fake " +
        "determinístico via overrideProvider (mesmo padrão de StorageService nos demais e2e-spec do " +
        "projeto), para nunca gerar chamadas pagas à OpenAI durante o piloto.",
    );

    console.log("\n=== PILOTO INTERNO — Fase 3B: métricas por cenário ===");
    console.table(metrics);
    console.log("\n=== PILOTO INTERNO — achados/findings ===");
    for (const finding of findings) {
      console.log(`- ${finding}`);
    }

    t.diagnostic(JSON.stringify({ metrics, findings }, null, 2));
  } finally {
    await app.close();
  }
});
