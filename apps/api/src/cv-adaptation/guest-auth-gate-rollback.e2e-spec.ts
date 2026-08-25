import "reflect-metadata";

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { afterEach, test } from "node:test";

import { type INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";

import { requestContextMiddleware } from "../analysis-protection/request-context.middleware";
import { AppModule } from "../app.module";
import { DatabaseService } from "../database/database.service";
import { StorageService } from "../storage/storage.service";

// Fase 6 do gate de autenticação guest (specs/no-guest-analysis-preview-auth-gate-diagnostic-plan-ADENDO-hardening.md
// seção "Produção"): prova end-to-end que a flag `guest_analysis_auth_gate_enabled`
// alterna entre o comportamento antigo e o novo em runtime, via o MESMO
// mecanismo de admin config já existente (AnalysisConfigController +
// AnalysisConfigService), sem migration, sem deploy, sem rollback de commit.

const VALID_MASTER_CV_TEXT =
  "Ana Silva\nResumo\nAnalista de Dados com 5 anos de experiencia em SQL e BI.\nExperiencia\nEmpresa X\nAnalista de Dados\n2019-2024\nSQL, dashboards e comunicacao com areas de negocio.";

// Texto único por chamada — payloads idênticos entre os 4 testes deste
// arquivo (todos batem em analyze-guest em sequência rápida) disparariam o
// heurístico de anti-bot/dedupe por canonicalHash (proteção real,
// pré-existente, não relacionada ao gate) e não o comportamento que
// queremos exercitar aqui.
function uniqueJobDescription() {
  return `Descricao da vaga para atuar com analytics e produto, incluindo responsabilidades diarias, requisitos tecnicos, colaboracao com times multidisciplinares e foco em resultados de negocio. Ref: ${randomUUID()}.`;
}

type DeleteManyDelegate = { deleteMany: (args?: unknown) => Promise<unknown> };

const openApps = new Set<INestApplication>();

async function createApp() {
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
  openApps.add(app);

  return { app, database: app.get(DatabaseService) };
}

afterEach(async () => {
  const apps = Array.from(openApps);
  openApps.clear();
  await Promise.all(
    apps.map(async (app) => {
      try {
        await app.close();
      } catch {
        return;
      }
    }),
  );
});

async function deleteUserByEmail(database: DatabaseService, email: string) {
  await (database.user as DeleteManyDelegate).deleteMany({ where: { email } });
}

async function registerUser(
  app: INestApplication,
  database: DatabaseService,
  prefix: string,
) {
  const safePrefix = prefix
    .replace(/[^a-z0-9-]/gi, "")
    .toLowerCase()
    .slice(0, 24);
  const email = `${safePrefix}+${randomUUID()}@earlycv.dev`;
  await deleteUserByEmail(database, email);

  const response = await request(app.getHttpServer())
    .post("/api/auth/register")
    .send({
      email,
      password: "Super-secret-123",
      name: `${prefix} User`,
    });
  assert.equal(response.status, 201, JSON.stringify(response.body));

  return {
    accessToken: response.body.accessToken as string,
    email,
    userId: response.body.user.id as string,
  };
}

async function promoteToInternalAdmin(
  database: DatabaseService,
  userId: string,
  internalRole: "admin" | "superadmin" = "superadmin",
) {
  await database.user.update({
    where: { id: userId },
    data: { internalRole, isStaff: true },
  });
}

// Único ponto de alternância da flag — exatamente o que um operador real
// faria em produção (endpoint de admin já existente, protegido por
// role), não um atalho de teste.
async function setGuestAuthGateEnabled(
  app: INestApplication,
  adminAccessToken: string,
  value: boolean,
) {
  const response = await request(app.getHttpServer())
    .patch(
      "/api/admin/analysis-protection/config/guest_analysis_auth_gate_enabled",
    )
    .set("Authorization", `Bearer ${adminAccessToken}`)
    .send({ value, source: "e2e-rollback-validation" });
  assert.equal(response.status, 200, JSON.stringify(response.body));
  assert.equal(response.body.entry.value, value);
}

async function waitForAnalysisJobStatus(
  app: INestApplication,
  jobId: string,
  targetStatuses: string[],
  timeoutMs = 15_000,
) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const response = await request(app.getHttpServer()).get(
      `/api/cv-adaptation/analysis-jobs/${jobId}`,
    );
    if (
      response.status === 200 &&
      targetStatuses.includes(response.body.status)
    ) {
      return response.body as { status: string };
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`timed out waiting for job ${jobId}`);
}

test("rollback e2e: flag OFF preserves the current guest flow end-to-end (polling with full content)", async () => {
  const { app, database } = await createApp();
  const admin = await registerUser(app, database, "rollback-off-admin");
  await promoteToInternalAdmin(database, admin.userId);

  try {
    await setGuestAuthGateEnabled(app, admin.accessToken, false);

    const analyzeResponse = await request(app.getHttpServer())
      .post("/api/cv-adaptation/analyze-guest")
      .send({
        jobDescriptionText: uniqueJobDescription(),
        masterCvText: VALID_MASTER_CV_TEXT,
        turnstileToken: "token-test",
      })
      .expect(201);

    const jobId = analyzeResponse.body.jobId as string;
    assert.equal(typeof analyzeResponse.body.guestPossessionToken, "string");

    // Comportamento atual preservado: polling não autenticado devolve o
    // conteúdo completo (é exatamente isso que guestAnalysis storage no
    // frontend guarda hoje).
    await waitForAnalysisJobStatus(app, jobId, ["succeeded", "failed"]);
    const statusResponse = await request(app.getHttpServer()).get(
      `/api/cv-adaptation/analysis-jobs/${jobId}`,
    );
    assert.equal(statusResponse.body.status, "succeeded");
    assert.ok(
      statusResponse.body.adaptedContentJson,
      "flag OFF deve continuar devolvendo conteúdo no polling",
    );
    assert.equal(typeof statusResponse.body.previewText, "string");
    assert.equal(typeof statusResponse.body.analysisCvSnapshotId, "string");
  } finally {
    await deleteUserByEmail(database, admin.email);
    await app.close();
  }
});

test("rollback e2e: flag ON gates content end-to-end (status-only polling for guest, claim required for content)", async () => {
  const { app, database } = await createApp();
  const admin = await registerUser(app, database, "rollback-on-admin");
  await promoteToInternalAdmin(database, admin.userId);

  try {
    await setGuestAuthGateEnabled(app, admin.accessToken, true);

    const analyzeResponse = await request(app.getHttpServer())
      .post("/api/cv-adaptation/analyze-guest")
      .send({
        jobDescriptionText: uniqueJobDescription(),
        masterCvText: VALID_MASTER_CV_TEXT,
        turnstileToken: "token-test",
      })
      .expect(201);

    const jobId = analyzeResponse.body.jobId as string;
    const guestPossessionToken = analyzeResponse.body
      .guestPossessionToken as string;
    assert.equal(typeof guestPossessionToken, "string");

    // Sem token de posse: nem status.
    await request(app.getHttpServer())
      .get(`/api/cv-adaptation/analysis-jobs/${jobId}`)
      .expect(404);

    // Com token de posse: só status, nunca conteúdo — mesmo depois de
    // succeeded.
    let sawSucceeded = false;
    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline && !sawSucceeded) {
      const statusResponse = await request(app.getHttpServer())
        .get(`/api/cv-adaptation/analysis-jobs/${jobId}`)
        .set("x-guest-possession-token", guestPossessionToken);
      assert.equal(statusResponse.status, 200);
      assert.deepEqual(Object.keys(statusResponse.body), ["status"]);
      if (statusResponse.body.status === "succeeded") {
        sawSucceeded = true;
        break;
      }
      if (statusResponse.body.status === "failed") {
        throw new Error("analysis unexpectedly failed");
      }
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    assert.ok(sawSucceeded, "job deveria ter sucedido dentro do timeout");

    // A flag é um gate de LEITURA, não algo gravado no job: desligando-a
    // agora, o MESMO jobId (criado com a flag ligada) passa a expor
    // conteúdo completo a um GET não autenticado — sem recriar nada, sem
    // nova chamada a analyze-guest. Religa em seguida para continuar
    // testando o caminho de claim com a flag ligada.
    await setGuestAuthGateEnabled(app, admin.accessToken, false);
    const ungatedStatus = await request(app.getHttpServer()).get(
      `/api/cv-adaptation/analysis-jobs/${jobId}`,
    );
    assert.equal(ungatedStatus.status, 200);
    assert.ok(
      ungatedStatus.body.adaptedContentJson,
      "flag desligada deve expor o conteúdo do mesmo job, sem recriar nada",
    );
    await setGuestAuthGateEnabled(app, admin.accessToken, true);

    // Claim: usuário se autentica, ownership é transferida (simulando a
    // Fase 3/4 sem exercitar o round-trip real do Google), claim
    // materializa a CvAdaptation.
    const user = await registerUser(app, database, "rollback-on-user");
    await database.analysisJob.update({
      where: { id: jobId },
      data: { userId: user.userId },
    });

    const claimResponse = await request(app.getHttpServer())
      .post(`/api/cv-adaptation/analysis-jobs/${jobId}/claim`)
      .set("Authorization", `Bearer ${user.accessToken}`)
      .expect(201);
    assert.equal(claimResponse.body.status, "succeeded");
    assert.equal(typeof claimResponse.body.cvAdaptationId, "string");

    await deleteUserByEmail(database, user.email);
  } finally {
    await deleteUserByEmail(database, admin.email);
    await app.close();
  }
});

test("rollback e2e: toggling the flag back OFF restores the old behavior immediately, no migration/redeploy involved", async () => {
  const { app, database } = await createApp();
  const admin = await registerUser(app, database, "rollback-cycle-admin");
  await promoteToInternalAdmin(database, admin.userId);

  try {
    // ON primeiro.
    await setGuestAuthGateEnabled(app, admin.accessToken, true);
    const onResponse = await request(app.getHttpServer())
      .post("/api/cv-adaptation/analyze-guest")
      .send({
        jobDescriptionText: uniqueJobDescription(),
        masterCvText: VALID_MASTER_CV_TEXT,
        turnstileToken: "token-test",
      })
      .expect(201);
    const onJobId = onResponse.body.jobId as string;
    const onToken = onResponse.body.guestPossessionToken as string;

    const gatedStatus = await request(app.getHttpServer())
      .get(`/api/cv-adaptation/analysis-jobs/${onJobId}`)
      .set("x-guest-possession-token", onToken);
    assert.deepEqual(Object.keys(gatedStatus.body), ["status"]);

    // Desliga de novo — mesmo endpoint, sem tocar em código/schema.
    await setGuestAuthGateEnabled(app, admin.accessToken, false);

    // Um job NOVO criado agora, com a flag já desligada, volta a expor
    // conteúdo completo no polling — prova que a reversão é imediata e
    // não depende de nenhum estado remanescente do período em que a flag
    // esteve ligada.
    const offResponse = await request(app.getHttpServer())
      .post("/api/cv-adaptation/analyze-guest")
      .send({
        jobDescriptionText: uniqueJobDescription(),
        masterCvText: VALID_MASTER_CV_TEXT,
        turnstileToken: "token-test",
      })
      .expect(201);
    const offJobId = offResponse.body.jobId as string;

    await waitForAnalysisJobStatus(app, offJobId, ["succeeded", "failed"]);
    const restoredStatus = await request(app.getHttpServer()).get(
      `/api/cv-adaptation/analysis-jobs/${offJobId}`,
    );
    assert.equal(restoredStatus.body.status, "succeeded");
    assert.ok(
      restoredStatus.body.adaptedContentJson,
      "desligar a flag deve restaurar o polling com conteúdo completo imediatamente",
    );
  } finally {
    await deleteUserByEmail(database, admin.email);
    await app.close();
  }
});
