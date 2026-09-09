// Fase 3C, item 6/8 (docs/specs/2026-09-04-cv-canonical-profile-pipeline-plan.md,
// "6. Pilotar guest e claim" / "8. Encerramento — repetir os 10 cenários do
// piloto original") — piloto guest→conta, PRATICÁVEL porque
// CV_STRUCTURED_PROFILE_PIPELINE_ENABLED=true liga o pipeline novo para
// guest pelo mesmo master switch do usuário autenticado (sem allowlist
// dedicada — cv-processing-flag-resolver.service.ts). O piloto anterior
// (Fase 3B,
// docs/specs/2026-09-05-cv-canonical-profile-pipeline-piloto-interno-fase3b.md,
// achado 4) confirmou com evidência real que o claim guest→conta NÃO era
// exercitável nesta configuração — este arquivo fecha exatamente essa
// lacuna.
//
// Mesmo padrão dos specs de piloto anteriores: AppModule completo via
// Test.createTestingModule + supertest (HTTP real), Postgres real
// (earlycv_test), StorageService fake em memória,
// CvStructuredProfileExtractionService substituído por um fake
// determinístico (nunca chamada real/paga à OpenAI). CvProcessingWorker/
// CvAnalysisWorker são acionados manualmente por jobId específico (nunca
// processPendingBatch(), que varreria o acúmulo de jobs de execuções
// anteriores documentado no piloto 3B).
//
// Cobre os 10 sub-itens pedidos no item 6:
//  1. Guest (flag global ligada) faz a 1a análise.
//  2. Cria TalentSubject (+ TalentSubjectSessionSignal).
//  3. Cria Master provisório (PROMOTE_IF_FIRST).
//  4. Persiste observações na Base de Talentos.
//  5. "Usuário cria conta" (registro real).
//  6. Claim cria ClaimSourceGrant.
//  7. Claim cria/reutiliza Resume corretamente.
//  8. Claim promove Master pro usuário (ele não tinha nenhum).
//  9. Preserva o Master do usuário SE ele já tinha um (2o guest, mesmo
//     usuário, já com Master ativo do passo 8).
//  10. Retry do claim não duplica nada (idempotência do serviço).
import "reflect-metadata";

import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { test } from "node:test";

import { type INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";

import { requestContextMiddleware } from "../analysis-protection/request-context.middleware";
import { AppModule } from "../app.module";
import { CvAnalysisWorker } from "../cv-adaptation/cv-analysis.worker";
import { DatabaseService } from "../database/database.service";
import type { MasterCvCanonicalExtractionOutput } from "../master-cv-canonical-extraction/master-cv-canonical-extraction.types";
import { StorageService } from "../storage/storage.service";
import { ClaimSourceGrantService } from "./claim-source-grant.service";
import { CvProcessingWorker } from "./cv-processing.worker";
import { CvProcessingJobService } from "./cv-processing-job.service";
import { CvStructuredProfileExtractionService } from "./cv-structured-profile-extraction.service";

const JOB_DESCRIPTION =
  "Vaga para analista pleno com responsabilidades de acompanhamento de indicadores, requisitos de experiencia previa, habilidades tecnicas em dados e colaboracao direta com produto e engenharia.";

const findings: string[] = [];

class FakeExtractionClient {
  calls = 0;
  async extract(input: {
    text: string;
  }): Promise<MasterCvCanonicalExtractionOutput> {
    this.calls += 1;
    const nameLine = input.text.split("\n")[0] ?? "Visitante Piloto";
    return {
      canonicalProfile: {
        fullName: nameLine,
        headline: "Analista",
        email: null,
        phone: null,
        linkedinUrl: null,
        location: { city: "São Paulo", state: "SP", country: "Brasil" },
        professionalSummary: "Resumo gerado no piloto guest→claim (Fase 3C).",
        experiences: [
          {
            role: "Analista",
            company: "Empresa Piloto Guest",
            location: "São Paulo",
            startDate: "2021",
            endDate: "2023",
            bullets: ["Atuou com dados e indicadores."],
            technologies: ["SQL"],
          },
        ],
        education: [
          {
            institution: "Universidade Piloto Guest",
            degree: "Bacharelado",
            fieldOfStudy: "Administração",
            startDate: "2016",
            endDate: "2020",
          },
        ],
        skills: ["SQL", "Excel"],
        languages: [],
        certifications: [],
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

function buildCvText(name: string, marker: string): string {
  return [
    name,
    "Resumo",
    `Profissional com experiência em ${marker}, formação superior concluída em 2020.`,
    "Experiência",
    `2021 - 2023 | Analista - ${marker}`,
    "Formação",
    "Bacharelado em Administração - Universidade Piloto Guest",
  ].join("\n");
}

// Mesmo hash que hashGuestSessionToken() (cv-adaptation.service.ts) produz
// a partir do cookie analysis_session_token — precisamos calculá-lo aqui
// só para conferir depois que AnalysisJob.guestSessionHash bate com o
// valor esperado (identidade de sessão, não mais usado para gate de flag).
function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

async function createApp() {
  delete process.env.CV_STRUCTURED_PROFILE_PIPELINE_ENABLED;
  delete process.env.CV_STRUCTURED_PROFILE_PIPELINE_ALLOWLIST_USER_IDS;
  if (
    process.env.NODE_ENV === "test" &&
    !process.env.SKIP_TURNSTILE_VERIFICATION
  ) {
    process.env.SKIP_TURNSTILE_VERIFICATION = "true";
  }

  const extractionClient = new FakeExtractionClient();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(StorageService)
    .useValue(new FakeStorage())
    .overrideProvider(CvStructuredProfileExtractionService)
    .useValue(extractionClient)
    .compile();

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

  return {
    app,
    extractionClient,
    database: app.get(DatabaseService),
    cvProcessingWorker: app.get(CvProcessingWorker),
    analysisWorker: app.get(CvAnalysisWorker),
    jobService: app.get(CvProcessingJobService),
    claimSourceGrantService: app.get(ClaimSourceGrantService),
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

async function processCvJobById(
  jobService: CvProcessingJobService,
  worker: CvProcessingWorker,
  jobId: string,
) {
  const claimed = await jobService.claimOne(
    jobId,
    `guest-claim-pilot-worker-${randomUUID()}`,
  );
  assert.ok(claimed, `CvProcessingJob ${jobId} deveria estar PENDING`);
  await (
    worker as unknown as { processJob: (job: typeof claimed) => Promise<void> }
  ).processJob(claimed);
}

async function processAnalysisJobById(
  database: DatabaseService,
  worker: CvAnalysisWorker,
  jobId: string,
) {
  const before = await database.analysisJob.findUniqueOrThrow({
    where: { id: jobId },
  });
  assert.ok(
    before.cvProcessingJobId,
    `AnalysisJob ${jobId} sem cvProcessingJob`,
  );
  const cvProcessingJob = await database.cvProcessingJob.findUniqueOrThrow({
    where: { id: before.cvProcessingJobId },
  });
  const claimed = await (
    worker as unknown as {
      claim: (id: string) => Promise<{ id: string } | null>;
    }
  ).claim(jobId);
  assert.ok(claimed, `AnalysisJob ${jobId} deveria estar pending`);
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
}

// Executa a análise de guest completa (envio + processamento CvProcessingJob
// + processamento AnalysisJob) para uma sessão específica, com a flag
// global ligada (único jeito de ligar o pipeline novo para guest). Devolve
// tudo que os sub-cenários seguintes precisam.
async function runGuestAnalysisToSucceeded(
  ctx: Awaited<ReturnType<typeof createApp>>,
  sessionToken: string,
  candidateName: string,
  marker: string,
) {
  const guestSessionHash = hashSessionToken(sessionToken);

  process.env.CV_STRUCTURED_PROFILE_PIPELINE_ENABLED = "true";

  const text = buildCvText(candidateName, marker);
  const res = await request(ctx.app.getHttpServer())
    .post("/api/cv-adaptation/analyze-guest")
    .set("Cookie", `analysis_session_token=${sessionToken}`)
    .field("jobDescriptionText", JOB_DESCRIPTION)
    .field("masterCvText", text);
  assert.equal(res.status, 201, JSON.stringify(res.body));

  const jobId = res.body.jobId as string;
  const guestPossessionToken = res.body.guestPossessionToken as string;
  assert.ok(guestPossessionToken, "guest deveria receber um token de posse");

  const analysisRow = await ctx.database.analysisJob.findUniqueOrThrow({
    where: { id: jobId },
  });

  // Sub-item 1: guest (com a flag global ligada) fez a primeira análise, e
  // ela de fato entrou no pipeline novo — prova que o mecanismo de
  // ativação de guest funciona de ponta a ponta (não é só uma função pura
  // testada isoladamente).
  assert.ok(
    analysisRow.cvProcessingJobId,
    "com a flag global ligada, a análise de guest deveria ter entrado no pipeline novo (cvProcessingJobId preenchido)",
  );
  assert.equal(analysisRow.guestSessionHash, guestSessionHash);

  // Sub-item 2: TalentSubjectSessionSignal aponta pro TalentSubject certo.
  const signal =
    await ctx.database.talentSubjectSessionSignal.findUniqueOrThrow({
      where: { guestSessionHash },
    });
  const talentSubjectId = signal.talentSubjectId;
  const cvProcessingJobId = analysisRow.cvProcessingJobId;
  assert.ok(cvProcessingJobId);

  await processCvJobById(
    ctx.jobService,
    ctx.cvProcessingWorker,
    cvProcessingJobId,
  );

  // Sub-item 3: Master provisório (PROMOTE_IF_FIRST) criado para o
  // TalentSubject do guest.
  const guestDesignation =
    await ctx.database.cvMasterDesignation.findFirstOrThrow({
      where: { talentSubjectId, supersededAt: null },
    });
  assert.equal(guestDesignation.promotedReason, "FIRST_EVER");
  assert.equal(guestDesignation.ownerType, "GUEST");

  // Sub-item 4: observações persistidas na Base de Talentos.
  const talentProfile = await ctx.database.talentProfile.findUniqueOrThrow({
    where: { talentSubjectId },
  });
  const eduCount = await ctx.database.talentEducationObservation.count({
    where: { talentProfileId: talentProfile.id },
  });
  const compCount = await ctx.database.talentCompetencyObservation.count({
    where: { talentProfileId: talentProfile.id },
  });
  assert.ok(
    eduCount > 0 && compCount > 0,
    "Base de Talentos deveria ter observações após a 1a análise do guest",
  );

  await processAnalysisJobById(ctx.database, ctx.analysisWorker, jobId);
  const finalAnalysis = await ctx.database.analysisJob.findUniqueOrThrow({
    where: { id: jobId },
  });
  assert.equal(finalAnalysis.status, "succeeded");

  return {
    jobId,
    guestPossessionToken,
    guestSessionHash,
    talentSubjectId,
    talentProfileId: talentProfile.id,
    cvProcessingJobId,
    guestDesignationId: guestDesignation.id,
  };
}

test("Fase 3C, item 6/8 — claim guest→conta, ponta a ponta via HTTP real (flag global)", async (t) => {
  const ctx = await createApp();

  try {
    // ---------------------------------------------------------------------
    // Guest #1: primeira análise, vira Master provisório do TalentSubject.
    // ---------------------------------------------------------------------
    const sessionTokenA = `guest-session-a-${randomUUID()}`;
    const guestA = await runGuestAnalysisToSucceeded(
      ctx,
      sessionTokenA,
      "Visitante Piloto Um",
      "dados",
    );

    // ---------------------------------------------------------------------
    // Sub-item 5: "usuário cria conta" — registro real. Precisa estar
    // elegível ao pipeline novo (via admin, mesmo mecanismo já validado na
    // Fase 3) para que claimGuestAnalysisJob rode o ClaimSourceGrantService
    // (isPipelineEnabledFor({ userId }) — checagem SEPARADA da allowlist de
    // guest, ver cv-adaptation.service.ts#claimGuestAnalysisJob).
    // ---------------------------------------------------------------------
    const newUser = await registerUser(ctx.app, "claim-pilot-user");
    await promoteToAdmin(ctx.database, newUser.userId);
    const authHeader = `Bearer ${newUser.accessToken}`;

    const userHasMasterBefore =
      await ctx.database.cvMasterDesignation.findFirst({
        where: { userId: newUser.userId, supersededAt: null },
      });
    assert.equal(
      userHasMasterBefore,
      null,
      "usuário novo não deveria ter Master ainda",
    );

    // ---------------------------------------------------------------------
    // Sub-itens 6-8: claim via POST /cv-adaptation/analysis-jobs/:id/claim.
    // ---------------------------------------------------------------------
    const claimRes = await request(ctx.app.getHttpServer())
      .post(`/api/cv-adaptation/analysis-jobs/${guestA.jobId}/claim`)
      .set("Authorization", authHeader)
      .set("Cookie", `analysis_session_token=${sessionTokenA}`)
      .send({ guestPossessionToken: guestA.guestPossessionToken });
    assert.equal(claimRes.status, 201, JSON.stringify(claimRes.body));
    assert.equal(claimRes.body.status, "succeeded");
    assert.ok(claimRes.body.cvAdaptationId);

    // Sub-item 6: ClaimSourceGrant criado.
    const cvProcessingJobA =
      await ctx.database.cvProcessingJob.findUniqueOrThrow({
        where: { id: guestA.cvProcessingJobId },
      });
    const grant = await ctx.database.claimSourceGrant.findUniqueOrThrow({
      where: {
        cvSourceId_userId: {
          cvSourceId: cvProcessingJobA.cvSourceId,
          userId: newUser.userId,
        },
      },
    });
    assert.equal(grant.provenByAnalysisJobId, guestA.jobId);

    // Sub-item 7: Resume criado/reutilizado corretamente — aponta pra fonte
    // à qual o usuário tem acesso válido (via grant), CvSubmission origin
    // CLAIM, CvSource NUNCA transferido (continua GUEST/talentSubjectId).
    const resumeAfterClaim = await ctx.database.resume.findFirstOrThrow({
      where: {
        userId: newUser.userId,
        cvSourceId: cvProcessingJobA.cvSourceId,
      },
    });
    const cvSourceAfterClaim = await ctx.database.cvSource.findUniqueOrThrow({
      where: { id: cvProcessingJobA.cvSourceId },
    });
    assert.equal(
      cvSourceAfterClaim.ownerType,
      "GUEST",
      "CvSource nunca deveria mudar de dono, mesmo depois do claim",
    );
    assert.equal(cvSourceAfterClaim.talentSubjectId, guestA.talentSubjectId);
    const resumeSubmissionId = resumeAfterClaim.cvSubmissionId;
    assert.ok(resumeSubmissionId);
    const submissionAfterClaim =
      await ctx.database.cvSubmission.findUniqueOrThrow({
        where: { id: resumeSubmissionId },
      });
    assert.equal(submissionAfterClaim.origin, "CLAIM");

    // Sub-item 8: Master promovido pro usuário, já que ele não tinha
    // nenhum antes do claim.
    const userDesignationAfterClaim =
      await ctx.database.cvMasterDesignation.findFirstOrThrow({
        where: { userId: newUser.userId, supersededAt: null },
      });
    assert.equal(
      userDesignationAfterClaim.cvStructuredProfileId,
      cvProcessingJobA.cvStructuredProfileId,
    );
    assert.equal(userDesignationAfterClaim.resumeId, resumeAfterClaim.id);
    assert.equal(
      resumeAfterClaim.isMaster,
      true,
      "Resume deveria ter isMaster=true de forma atômica com a designação (correção Fase 3C item 1/5)",
    );

    // A designação PROVISÓRIA do guest é encerrada (supersededAt
    // preenchido) no MESMO commit que promove a designação do usuário —
    // achado real de auditoria de claim: antes desta correção, as duas
    // ficavam ativas ao mesmo tempo (CvMasterPromotionService só enxerga/
    // supersede designações do MESMO dono — userId OU talentSubjectId,
    // nunca os dois — então promover o usuário nunca supersedia sozinho a
    // designação guest de origem). Só uma designação deve estar ativa ao
    // final do claim, para o mesmo perfil estruturado.
    const guestDesignationAfterClaim =
      await ctx.database.cvMasterDesignation.findUniqueOrThrow({
        where: { id: guestA.guestDesignationId },
      });
    assert.notEqual(guestDesignationAfterClaim.supersededAt, null);

    // ---------------------------------------------------------------------
    // Sub-item 10: retry do claim (chamando o SERVIÇO de novo diretamente,
    // já que o endpoint HTTP curto-circuita em convertedAt/convertedCvAdaptationId
    // antes de chegar no ClaimSourceGrantService — a idempotência que o
    // plano pede é do serviço em si, seção 4.2: "chamar duas vezes o mesmo
    // claim é no-op na segunda vez").
    // ---------------------------------------------------------------------
    const grantsBeforeRetry = await ctx.database.claimSourceGrant.count();
    const resumesBeforeRetry = await ctx.database.resume.count({
      where: { userId: newUser.userId },
    });
    const designationsBeforeRetry =
      await ctx.database.cvMasterDesignation.count({
        where: { userId: newUser.userId, supersededAt: null },
      });

    const retryResult = await ctx.claimSourceGrantService.claim({
      userId: newUser.userId,
      analysisJobId: guestA.jobId,
      cvProcessingJobId: guestA.cvProcessingJobId,
    });
    assert.equal(
      retryResult.grantCreated,
      false,
      "retry não deveria recriar o grant",
    );
    assert.equal(retryResult.master?.resumeId, resumeAfterClaim.id);

    const grantsAfterRetry = await ctx.database.claimSourceGrant.count();
    const resumesAfterRetry = await ctx.database.resume.count({
      where: { userId: newUser.userId },
    });
    const designationsAfterRetry = await ctx.database.cvMasterDesignation.count(
      { where: { userId: newUser.userId, supersededAt: null } },
    );
    assert.equal(
      grantsAfterRetry,
      grantsBeforeRetry,
      "retry não deveria duplicar ClaimSourceGrant",
    );
    assert.equal(
      resumesAfterRetry,
      resumesBeforeRetry,
      "retry não deveria duplicar Resume",
    );
    assert.equal(
      designationsAfterRetry,
      designationsBeforeRetry,
      "retry não deveria duplicar CvMasterDesignation ativa",
    );

    // ---------------------------------------------------------------------
    // Sub-item 9: 2o guest, mesmo usuário (que JÁ tem Master ativo agora) —
    // claim deve preservar o Master do usuário, nunca substituí-lo por uma
    // designação de guest.
    // ---------------------------------------------------------------------
    const sessionTokenB = `guest-session-b-${randomUUID()}`;
    const guestB = await runGuestAnalysisToSucceeded(
      ctx,
      sessionTokenB,
      "Visitante Piloto Dois",
      "marketing",
    );

    const masterBeforeSecondClaim =
      await ctx.database.cvMasterDesignation.findFirstOrThrow({
        where: { userId: newUser.userId, supersededAt: null },
      });
    assert.equal(masterBeforeSecondClaim.id, userDesignationAfterClaim.id);

    const claimBRes = await request(ctx.app.getHttpServer())
      .post(`/api/cv-adaptation/analysis-jobs/${guestB.jobId}/claim`)
      .set("Authorization", authHeader)
      .set("Cookie", `analysis_session_token=${sessionTokenB}`)
      .send({ guestPossessionToken: guestB.guestPossessionToken });
    assert.equal(claimBRes.status, 201, JSON.stringify(claimBRes.body));
    assert.equal(claimBRes.body.status, "succeeded");

    const masterAfterSecondClaim =
      await ctx.database.cvMasterDesignation.findFirstOrThrow({
        where: { userId: newUser.userId, supersededAt: null },
      });
    assert.equal(
      masterAfterSecondClaim.id,
      masterBeforeSecondClaim.id,
      "Master do usuário deveria ser PRESERVADO ao reivindicar um 2o CV, já que o usuário já tinha Master ativo",
    );

    const cvProcessingJobB =
      await ctx.database.cvProcessingJob.findUniqueOrThrow({
        where: { id: guestB.cvProcessingJobId },
      });
    const grantB = await ctx.database.claimSourceGrant.findUniqueOrThrow({
      where: {
        cvSourceId_userId: {
          cvSourceId: cvProcessingJobB.cvSourceId,
          userId: newUser.userId,
        },
      },
    });
    assert.ok(grantB, "grant do 2o CV deveria ser criado normalmente");

    const activeDesignationsForUser =
      await ctx.database.cvMasterDesignation.count({
        where: { userId: newUser.userId, supersededAt: null },
      });
    assert.equal(
      activeDesignationsForUser,
      1,
      "exatamente uma CvMasterDesignation ativa para o usuário, mesmo depois de reivindicar 2 CVs de guest",
    );

    // A designação provisória do 2o guest também permanece intacta — não
    // foi ativada nem apagada, só o grant deu acesso formal.
    const guestBDesignationStillActive =
      await ctx.database.cvMasterDesignation.findUniqueOrThrow({
        where: { id: guestB.guestDesignationId },
      });
    assert.equal(guestBDesignationStillActive.supersededAt, null);

    // ---------------------------------------------------------------------
    // Confirmação final: com a flag global DESLIGADA, uma nova sessão guest
    // cai no legado normalmente — a ativação de guest depende inteiramente
    // do master switch, sem nenhum outro caminho residual.
    // ---------------------------------------------------------------------
    delete process.env.CV_STRUCTURED_PROFILE_PIPELINE_ENABLED;
    const sessionTokenC = `guest-session-c-flag-desligada-${randomUUID()}`;
    const resC = await request(ctx.app.getHttpServer())
      .post("/api/cv-adaptation/analyze-guest")
      .set("Cookie", `analysis_session_token=${sessionTokenC}`)
      .field("jobDescriptionText", JOB_DESCRIPTION)
      .field("masterCvText", buildCvText("Visitante Nao Listado", "vendas"));
    assert.equal(resC.status, 201, JSON.stringify(resC.body));
    const analysisRowC = await ctx.database.analysisJob.findUniqueOrThrow({
      where: { id: resC.body.jobId as string },
    });
    // Espera o processamento legado fire-and-forget terminar (mesmo padrão
    // do piloto 3B) só para não deixar Promise solta ao fechar o app.
    {
      const deadline = Date.now() + 5000;
      let row = analysisRowC;
      while (
        (row.status === "processing" || row.status === "pending") &&
        Date.now() < deadline
      ) {
        await new Promise((resolve) => setTimeout(resolve, 25));
        row = await ctx.database.analysisJob.findUniqueOrThrow({
          where: { id: resC.body.jobId as string },
        });
      }
    }
    assert.equal(
      analysisRowC.cvProcessingJobId,
      null,
      "com a flag global desligada, a análise de guest nunca deveria tocar o pipeline novo",
    );

    findings.push(
      "Fase 3C item 6 — claim guest→conta EXERCITADO DE PONTA A PONTA com sucesso: " +
        "guest ativado via flag global (mesmo master switch do usuário autenticado), " +
        "Master provisório criado, Base de Talentos populada, claim gerou " +
        "ClaimSourceGrant + Resume + promoção de Master (usuário sem Master prévio) e " +
        "PRESERVOU o Master do usuário num 2o claim (usuário já tinha Master), retry do " +
        "serviço confirmadamente idempotente (zero duplicação de grant/Resume/" +
        "designação), e com a flag desligada uma 3a sessão guest permaneceu no caminho " +
        "legado.",
    );

    t.diagnostic(JSON.stringify({ findings }, null, 2));
  } finally {
    delete process.env.CV_STRUCTURED_PROFILE_PIPELINE_ENABLED;
    await ctx.app.close();
  }
});
