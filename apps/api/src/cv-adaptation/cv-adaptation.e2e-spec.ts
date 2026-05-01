import "reflect-metadata";

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";

import { type INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { Prisma } from "@prisma/client";
import request from "supertest";

import { AppModule } from "../app.module";
import { DatabaseService } from "../database/database.service";

import { PlansService } from "../plans/plans.service";

type DeleteManyDelegate = {
  deleteMany: (args?: unknown) => Promise<unknown>;
};

type RegisterResult = {
  accessToken: string;
  email: string;
  userId: string;
};

async function createApp() {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app: INestApplication = moduleRef.createNestApplication();
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
    database: app.get(DatabaseService),
  };
}

async function deleteUserByEmail(database: DatabaseService, email: string) {
  await (database.user as DeleteManyDelegate).deleteMany({
    where: { email },
  });
}

async function promoteToInternalAdmin(
  database: DatabaseService,
  userId: string,
  internalRole: "admin" | "superadmin" = "admin",
) {
  await database.user.update({
    where: { id: userId },
    data: { internalRole, isStaff: true },
  });
}

async function registerUser(
  app: INestApplication,
  database: DatabaseService,
  prefix: string,
): Promise<RegisterResult> {
  const email = `${prefix}+${randomUUID()}@earlycv.dev`;

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

async function markPurchaseAsApproved(
  app: INestApplication,
  paymentReference: string,
) {
  const plansService = app.get(PlansService) as unknown as {
    handleWebhook: (provider: string, body: unknown) => Promise<void>;
    resolveMercadoPagoPayment: (body: unknown) => Promise<{
      paymentReference: string | null;
      status: "approved" | "failed" | "pending" | "unknown";
    }>;
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

test("POST /cv-adaptation with masterResumeId creates an adaptation", async () => {
  const { app, database } = await createApp();
  const user = await registerUser(app, database, "cv-adaptation-user");

  // Create a master resume
  const masterResume = await database.resume.create({
    data: {
      userId: user.userId,
      title: "My CV",
      kind: "master",
      status: "uploaded",
      rawText: "Engineer with 5 years experience in TypeScript",
    },
  });

  const res = await request(app.getHttpServer())
    .post("/api/cv-adaptation")
    .set("Authorization", `Bearer ${user.accessToken}`)
    .send({
      masterResumeId: masterResume.id,
      jobDescriptionText: "Senior Engineer role at Tech Company",
      jobTitle: "Senior Engineer",
      companyName: "Tech Corp",
    })
    .expect(201);

  assert.equal(res.body.masterResumeId, masterResume.id);
  assert.equal(res.body.status, "analyzing");
  assert.equal(res.body.jobTitle, "Senior Engineer");
  assert.equal(res.body.companyName, "Tech Corp");
  assert.ok(!("adaptedContentJson" in res.body));

  await deleteUserByEmail(database, user.email);
  await app.close();
});

test("POST /cv-adaptation with wrong masterResumeId returns 404", async () => {
  const { app, database } = await createApp();
  const user = await registerUser(app, database, "cv-adaptation-wrong-resume");

  await request(app.getHttpServer())
    .post("/api/cv-adaptation")
    .set("Authorization", `Bearer ${user.accessToken}`)
    .send({
      masterResumeId: randomUUID(),
      jobDescriptionText: "Senior Engineer role",
    })
    .expect(404);

  await deleteUserByEmail(database, user.email);
  await app.close();
});

test("GET /cv-adaptation returns only current user's adaptations", async () => {
  const { app, database } = await createApp();
  const user1 = await registerUser(app, database, "cv-adaptation-user-1");
  const user2 = await registerUser(app, database, "cv-adaptation-user-2");

  // Create resumes and adaptations for both users
  const resume1 = await database.resume.create({
    data: {
      userId: user1.userId,
      title: "CV1",
      kind: "master",
      status: "uploaded",
      rawText: "User 1 resume",
    },
  });

  const resume2 = await database.resume.create({
    data: {
      userId: user2.userId,
      title: "CV2",
      kind: "master",
      status: "uploaded",
      rawText: "User 2 resume",
    },
  });

  await database.cvAdaptation.create({
    data: {
      userId: user1.userId,
      masterResumeId: resume1.id,
      jobDescriptionText: "User 1 job",
      status: "pending",
    },
  });

  await database.cvAdaptation.create({
    data: {
      userId: user2.userId,
      masterResumeId: resume2.id,
      jobDescriptionText: "User 2 job",
      status: "pending",
    },
  });

  // User 1 fetches adaptations - should only see their own
  const res = await request(app.getHttpServer())
    .get("/api/cv-adaptation")
    .set("Authorization", `Bearer ${user1.accessToken}`)
    .expect(200);

  assert.equal(Array.isArray(res.body.items), true);
  assert.equal(res.body.items.length, 1);
  assert.equal(res.body.items[0].masterResumeId, resume1.id);

  await deleteUserByEmail(database, user1.email);
  await deleteUserByEmail(database, user2.email);
  await app.close();
});

test("GET /cv-adaptation/:id returns 404 for another user's adaptation", async () => {
  const { app, database } = await createApp();
  const user1 = await registerUser(app, database, "cv-adaptation-user-a");
  const user2 = await registerUser(app, database, "cv-adaptation-user-b");

  const resume = await database.resume.create({
    data: {
      userId: user1.userId,
      title: "CV",
      kind: "master",
      status: "uploaded",
      rawText: "Resume content",
    },
  });

  const adaptation = await database.cvAdaptation.create({
    data: {
      userId: user1.userId,
      masterResumeId: resume.id,
      jobDescriptionText: "Job description",
      status: "pending",
    },
  });

  // User 2 tries to access User 1's adaptation
  await request(app.getHttpServer())
    .get(`/api/cv-adaptation/${adaptation.id}`)
    .set("Authorization", `Bearer ${user2.accessToken}`)
    .expect(404);

  await deleteUserByEmail(database, user1.email);
  await deleteUserByEmail(database, user2.email);
  await app.close();
});

test("DELETE /cv-adaptation/:id deletes the record", async () => {
  const { app, database } = await createApp();
  const user = await registerUser(app, database, "cv-adaptation-delete-user");

  const resume = await database.resume.create({
    data: {
      userId: user.userId,
      title: "CV",
      kind: "master",
      status: "uploaded",
      rawText: "Resume",
    },
  });

  const adaptation = await database.cvAdaptation.create({
    data: {
      userId: user.userId,
      masterResumeId: resume.id,
      jobDescriptionText: "Job",
      status: "pending",
    },
  });

  // Delete adaptation
  await request(app.getHttpServer())
    .delete(`/api/cv-adaptation/${adaptation.id}`)
    .set("Authorization", `Bearer ${user.accessToken}`)
    .expect(204);

  // Verify it's deleted
  await request(app.getHttpServer())
    .get(`/api/cv-adaptation/${adaptation.id}`)
    .set("Authorization", `Bearer ${user.accessToken}`)
    .expect(404);

  await deleteUserByEmail(database, user.email);
  await app.close();
});

test("DELETE /cv-adaptation/:id also deletes the adaptedResume if present", async () => {
  const { app, database } = await createApp();
  const user = await registerUser(app, database, "cv-adapt-del-adapted");

  const masterResume = await database.resume.create({
    data: {
      userId: user.userId,
      title: "Master CV",
      kind: "master",
      status: "uploaded",
      rawText: "Resume",
    },
  });

  const adaptedResume = await database.resume.create({
    data: {
      userId: user.userId,
      title: "Adapted CV",
      kind: "adapted",
      isMaster: false,
      status: "reviewed",
      basedOnResumeId: masterResume.id,
    },
  });

  const adaptation = await database.cvAdaptation.create({
    data: {
      userId: user.userId,
      masterResumeId: masterResume.id,
      jobDescriptionText: "Job",
      status: "delivered",
      adaptedResumeId: adaptedResume.id,
    },
  });

  // Verify adapted resume exists
  const beforeDelete = await database.resume.findUnique({
    where: { id: adaptedResume.id },
  });
  assert.ok(beforeDelete);

  // Delete adaptation
  await request(app.getHttpServer())
    .delete(`/api/cv-adaptation/${adaptation.id}`)
    .set("Authorization", `Bearer ${user.accessToken}`)
    .expect(204);

  // Verify adapted resume is also deleted
  const afterDelete = await database.resume.findUnique({
    where: { id: adaptedResume.id },
  });
  assert.equal(afterDelete, null);

  await deleteUserByEmail(database, user.email);
  await app.close();
});

test("POST /cv-adaptation/save-guest-preview without saveAsMaster does not create a primary master resume", async () => {
  const { app, database } = await createApp();
  const user = await registerUser(app, database, "cv-save-nomaster");

  try {
    const snapshot = await database.analysisCvSnapshot.create({
      data: {
        userId: user.userId,
        sourceType: "text_input",
        textStorageKey: "analysis-cv-snapshots/test-save-no-master.md",
        textSha256: "hash-save-no-master",
        textSizeBytes: 123,
      },
    });

    const response = await request(app.getHttpServer())
      .post("/api/cv-adaptation/save-guest-preview")
      .set("Authorization", `Bearer ${user.accessToken}`)
      .field(
        "adaptedContentJson",
        JSON.stringify({
          vaga: { cargo: "Data Analyst", empresa: "EarlyCV" },
          fit: { score: 80, categoria: "alto", headline: "ok" },
        }),
      )
      .field("jobDescriptionText", "Descricao da vaga")
      .field("masterCvText", "CV original enviado pelo usuario")
      .field("analysisCvSnapshotId", snapshot.id)
      .field("jobTitle", "Data Analyst")
      .field("companyName", "EarlyCV")
      .field("previewText", "preview");

    assert.equal(response.status, 201, JSON.stringify(response.body));

    const resumes = await database.resume.findMany({
      where: { userId: user.userId },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        kind: true,
        isMaster: true,
        sourceFileName: true,
        sourceFileType: true,
        sourceFileUrl: true,
      },
    });

    assert.equal(resumes.length, 1);
    assert.equal(resumes[0]?.id, response.body.masterResumeId);
    assert.equal(resumes[0]?.kind, "master");
    assert.equal(resumes[0]?.isMaster, false);
    assert.equal(resumes[0]?.sourceFileName, null);
    assert.equal(resumes[0]?.sourceFileType, null);
    assert.equal(resumes[0]?.sourceFileUrl, null);

    const primaryResumeCount = await database.resume.count({
      where: { userId: user.userId, isMaster: true },
    });
    assert.equal(primaryResumeCount, 0);
  } finally {
    await deleteUserByEmail(database, user.email);
    await app.close();
  }
});

test("POST /cv-adaptation/save-guest-preview with saveAsMaster promotes uploaded resume as primary master", async () => {
  const { app, database } = await createApp();
  const user = await registerUser(app, database, "cv-save-master");

  const previousMaster = await database.resume.create({
    data: {
      userId: user.userId,
      title: "CV anterior",
      kind: "master",
      status: "uploaded",
      rawText: "CV anterior",
      isMaster: true,
    },
  });

  try {
    const snapshot = await database.analysisCvSnapshot.create({
      data: {
        userId: user.userId,
        sourceType: "uploaded_file",
        textStorageKey: "analysis-cv-snapshots/test-save-master.md",
        textSha256: "hash-save-master",
        textSizeBytes: 123,
      },
    });

    const response = await request(app.getHttpServer())
      .post("/api/cv-adaptation/save-guest-preview")
      .set("Authorization", `Bearer ${user.accessToken}`)
      .attach("file", Buffer.from("%PDF-1.4\n%mock"), {
        contentType: "application/pdf",
        filename: "novo-cv.pdf",
      })
      .field(
        "adaptedContentJson",
        JSON.stringify({
          vaga: { cargo: "Data Analyst", empresa: "EarlyCV" },
          fit: { score: 87, categoria: "alto", headline: "ok" },
        }),
      )
      .field("jobDescriptionText", "Descricao da vaga")
      .field("masterCvText", "CV original enviado pelo usuario")
      .field("analysisCvSnapshotId", snapshot.id)
      .field("jobTitle", "Data Analyst")
      .field("companyName", "EarlyCV")
      .field("previewText", "preview")
      .field("saveAsMaster", "true");

    assert.equal(response.status, 201, JSON.stringify(response.body));

    const resumes = await database.resume.findMany({
      where: { userId: user.userId },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        isMaster: true,
        kind: true,
        sourceFileName: true,
        sourceFileType: true,
        sourceFileUrl: true,
      },
    });

    assert.equal(resumes.length, 2);

    const promoted = resumes.find(
      (resume) => resume.id === response.body.masterResumeId,
    );
    assert.ok(promoted);
    assert.equal(promoted?.kind, "master");
    assert.equal(promoted?.isMaster, true);
    assert.equal(promoted?.sourceFileName, "novo-cv.pdf");
    assert.equal(promoted?.sourceFileType, "application/pdf");
    assert.equal(typeof promoted?.sourceFileUrl, "string");
    assert.ok((promoted?.sourceFileUrl?.length ?? 0) > 0);

    const demotedPreviousMaster = resumes.find(
      (resume) => resume.id === previousMaster.id,
    );
    assert.equal(demotedPreviousMaster?.isMaster, false);

    const adaptedAsMasterCount = await database.resume.count({
      where: { userId: user.userId, kind: "adapted", isMaster: true },
    });
    assert.equal(adaptedAsMasterCount, 0);
  } finally {
    await deleteUserByEmail(database, user.email);
    await app.close();
  }
});

test("claimed guest analysis can be downloaded as PDF and DOCX", async () => {
  const { app, database } = await createApp();
  const user = await registerUser(app, database, "cv-adapt-claim-download");

  await database.user.update({
    where: { id: user.userId },
    data: { creditsRemaining: 1 },
  });

  const claimResponse = await request(app.getHttpServer())
    .post("/api/cv-adaptation/claim-guest")
    .set("Authorization", `Bearer ${user.accessToken}`)
    .send({
      adaptedContentJson: {
        vaga: {
          cargo: "Analista de Produto",
          empresa: "EarlyCV",
        },
        fit: {
          score: 74,
          categoria: "medio",
          headline: "Bom alinhamento com a vaga",
          subheadline: "Perfil com aderencia alta para produto digital",
        },
        pontos_fortes: ["Experiencia com squads"],
        lacunas: ["Poucos exemplos de impacto"],
        melhorias_aplicadas: ["Resumo orientado por resultados"],
        ats_keywords: {
          presentes: ["produto"],
          ausentes: ["discovery"],
        },
      },
      jobDescriptionText: "Descricao da vaga",
      masterCvText: "Resumo profissional\nExperiencia com produto e dados",
      analysisCvSnapshotId: (
        await database.analysisCvSnapshot.create({
          data: {
            userId: user.userId,
            sourceType: "text_input",
            textStorageKey: "analysis-cv-snapshots/test-claim-download.md",
            textSha256: "hash-claim-download",
            textSizeBytes: 123,
          },
        })
      ).id,
      jobTitle: "Analista de Produto",
      companyName: "EarlyCV",
      previewText: "Bom alinhamento com a vaga",
    })
    .expect(201);

  const adaptationId = claimResponse.body.id as string;

  // aiAuditJson is now generated lazily on first download (not eagerly on claim)
  await database.cvAdaptation.update({
    where: { id: adaptationId },
    data: { aiAuditJson: Prisma.JsonNull },
  });

  await database.resume.updateMany({
    where: { userId: user.userId, kind: "master" },
    data: { rawText: null },
  });

  await request(app.getHttpServer())
    .get(`/api/cv-adaptation/${adaptationId}/download?format=pdf`)
    .set("Authorization", `Bearer ${user.accessToken}`)
    .expect(200)
    .expect((res) => {
      assert.equal(res.headers["content-type"], "application/pdf");
    });

  const backfilled = await database.cvAdaptation.findUnique({
    where: { id: adaptationId },
    select: { aiAuditJson: true },
  });
  assert.equal(
    typeof (backfilled?.aiAuditJson as { summary?: string })?.summary,
    "string",
  );

  await request(app.getHttpServer())
    .get(`/api/cv-adaptation/${adaptationId}/download?format=docx`)
    .set("Authorization", `Bearer ${user.accessToken}`)
    .buffer(true)
    .parse((res, callback) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("end", () => callback(null, Buffer.concat(chunks)));
    })
    .expect(200)
    .expect((res) => {
      assert.equal(
        res.headers["content-type"],
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      );
      const body = res.body as Buffer;
      assert.equal(Buffer.isBuffer(body), true);
      assert.equal(body.subarray(0, 2).toString("utf8"), "PK");
    });

  await deleteUserByEmail(database, user.email);
  await app.close();
});

test("superadmin can claim guest analysis even with zero credits", async () => {
  const { app, database } = await createApp();
  const user = await registerUser(app, database, "cv-adapt-superadmin-claim");

  await promoteToInternalAdmin(database, user.userId, "superadmin");
  await database.user.update({
    where: { id: user.userId },
    data: { creditsRemaining: 0, planType: "free" },
  });

  await request(app.getHttpServer())
    .get("/api/plans/me")
    .set("Authorization", `Bearer ${user.accessToken}`)
    .expect(200)
    .expect(({ body }) => {
      assert.equal(body.planType, "unlimited");
      assert.equal(body.creditsRemaining, null);
      assert.equal(body.isActive, true);
    });

  await request(app.getHttpServer())
    .post("/api/cv-adaptation/claim-guest")
    .set("Authorization", `Bearer ${user.accessToken}`)
    .send({
      adaptedContentJson: {
        vaga: { cargo: "Data Manager", empresa: "EarlyCV" },
        fit: { score: 80, categoria: "alto", headline: "ok" },
      },
      jobDescriptionText: "Descricao da vaga",
      masterCvText: "Resumo profissional com experiencia em dados",
      analysisCvSnapshotId: (
        await database.analysisCvSnapshot.create({
          data: {
            userId: user.userId,
            sourceType: "text_input",
            textStorageKey: "analysis-cv-snapshots/test-superadmin-claim.md",
            textSha256: "hash-superadmin-claim",
            textSizeBytes: 123,
          },
        })
      ).id,
      jobTitle: "Data Manager",
      companyName: "EarlyCV",
      previewText: "ok",
    })
    .expect(201);

  const refreshed = await database.user.findUnique({
    where: { id: user.userId },
    select: { creditsRemaining: true },
  });

  assert.equal(refreshed?.creditsRemaining, 0);

  await deleteUserByEmail(database, user.email);
  await app.close();
});

test("GET /plans/me returns plan info for free user", async () => {
  const { app, database } = await createApp();
  const user = await registerUser(app, database, "cv-adapt-plan-counters");

  await request(app.getHttpServer())
    .get("/api/plans/me")
    .set("Authorization", `Bearer ${user.accessToken}`)
    .expect(200)
    .expect(({ body }) => {
      assert.equal(body.planType, "free");
      assert.equal(body.creditsRemaining, 0);
      assert.equal(body.isActive, false);
    });

  await deleteUserByEmail(database, user.email);
  await app.close();
});

test("GET /plans/me applies free plan type for expired unlimited plans", async () => {
  const { app, database } = await createApp();
  const user = await registerUser(app, database, "cv-adapt-expired-unlimited");

  await database.user.update({
    where: { id: user.userId },
    data: {
      planType: "unlimited",
      planExpiresAt: new Date("2026-01-01T00:00:00.000Z"),
    },
  });

  await request(app.getHttpServer())
    .get("/api/plans/me")
    .set("Authorization", `Bearer ${user.accessToken}`)
    .expect(200)
    .expect(({ body }) => {
      assert.equal(body.planType, "free");
      assert.equal(body.isActive, false);
    });

  await deleteUserByEmail(database, user.email);
  await app.close();
});

test("plan activation accumulates purchased balances on top of existing user balances", async () => {
  const { app, database } = await createApp();
  const user = await registerUser(app, database, "plans-accumulate-balances");

  await database.user.update({
    where: { id: user.userId },
    data: {
      creditsRemaining: 1,
      analysisCreditsRemaining: 2,
    },
  });

  const plansService = app.get(PlansService) as unknown as {
    activatePlan: (
      userId: string,
      planType: "starter" | "pro" | "turbo" | "unlimited" | "free",
      downloadCreditsGranted: number,
      analysisCreditsGranted: number,
    ) => Promise<void>;
  };

  await plansService.activatePlan(user.userId, "starter", 3, 6);

  const refreshed = await database.user.findUnique({
    where: { id: user.userId },
    select: {
      creditsRemaining: true,
      analysisCreditsRemaining: true,
    },
  });

  assert.equal(refreshed?.creditsRemaining, 4);
  assert.equal(refreshed?.analysisCreditsRemaining, 8);

  await deleteUserByEmail(database, user.email);
  await app.close();
});

test("webhook activation uses persisted purchase grants even when env values change", async () => {
  const { app, database } = await createApp();
  const user = await registerUser(app, database, "plans-webhook-frozen-grants");

  await database.user.update({
    where: { id: user.userId },
    data: {
      creditsRemaining: 1,
      analysisCreditsRemaining: 2,
    },
  });

  const paymentReference = randomUUID();

  await database.planPurchase.create({
    data: {
      userId: user.userId,
      planType: "starter",
      amountInCents: 1190,
      currency: "BRL",
      paymentProvider: "mercadopago",
      paymentReference,
      status: "none",
      creditsGranted: 3,
      analysisCreditsGranted: 5,
    },
  });

  const originalStarterAnalysis = process.env.QNT_AN_CREDIT_PLAN_STARTER;
  process.env.QNT_AN_CREDIT_PLAN_STARTER = "999";

  const plansService = app.get(PlansService) as unknown as {
    handleWebhook: (provider: string, body: unknown) => Promise<void>;
    resolveMercadoPagoPayment: (body: unknown) => Promise<{
      paymentReference: string | null;
      status: "approved" | "failed" | "pending" | "unknown";
    }>;
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
    if (originalStarterAnalysis === undefined) {
      delete process.env.QNT_AN_CREDIT_PLAN_STARTER;
    } else {
      process.env.QNT_AN_CREDIT_PLAN_STARTER = originalStarterAnalysis;
    }
  }

  const refreshed = await database.user.findUnique({
    where: { id: user.userId },
    select: {
      creditsRemaining: true,
      analysisCreditsRemaining: true,
    },
  });

  assert.equal(refreshed?.creditsRemaining, 4);
  assert.equal(refreshed?.analysisCreditsRemaining, 7);

  await deleteUserByEmail(database, user.email);
  await app.close();
});

test("webhook activation falls back for legacy purchases with zero analysis grant", async () => {
  const { app, database } = await createApp();
  const user = await registerUser(app, database, "plans-legacy-fallback");

  await database.user.update({
    where: { id: user.userId },
    data: {
      creditsRemaining: 1,
      analysisCreditsRemaining: 2,
    },
  });

  const paymentReference = randomUUID();

  await database.planPurchase.create({
    data: {
      userId: user.userId,
      planType: "starter",
      amountInCents: 1190,
      currency: "BRL",
      paymentProvider: "mercadopago",
      paymentReference,
      status: "none",
      creditsGranted: 3,
      analysisCreditsGranted: 0,
    },
  });

  const plansService = app.get(PlansService) as unknown as {
    handleWebhook: (provider: string, body: unknown) => Promise<void>;
    resolveMercadoPagoPayment: (body: unknown) => Promise<{
      paymentReference: string | null;
      status: "approved" | "failed" | "pending" | "unknown";
    }>;
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

  const refreshed = await database.user.findUnique({
    where: { id: user.userId },
    select: {
      creditsRemaining: true,
      analysisCreditsRemaining: true,
    },
  });

  assert.equal(refreshed?.creditsRemaining, 4);
  assert.equal(refreshed?.analysisCreditsRemaining, 8);

  await deleteUserByEmail(database, user.email);
  await app.close();
});

test("POST /cv-adaptation/analyze succeeds regardless of analysisCreditsRemaining", async () => {
  const { app, database } = await createApp();
  const user = await registerUser(app, database, "cv-adapt-analyze-no-quota");
  const previousSkipTurnstile = process.env.SKIP_TURNSTILE_VERIFICATION;
  const previousRolloutMode = process.env.ANALYSIS_ROLLOUT_MODE;
  process.env.ANALYSIS_ROLLOUT_MODE = "hard-block";
  process.env.SKIP_TURNSTILE_VERIFICATION = "false";

  const masterResume = await database.resume.create({
    data: {
      userId: user.userId,
      title: "CV Master",
      kind: "master",
      status: "uploaded",
      rawText: "Experiencia em produto e analytics",
    },
  });

  await database.user.update({
    where: { id: user.userId },
    data: {
      planType: "starter",
      analysisCreditsRemaining: 0,
    },
  });

  try {
    await request(app.getHttpServer())
      .post("/api/cv-adaptation/analyze")
      .set("Authorization", `Bearer ${user.accessToken}`)
      .attach("file", Buffer.from("not-a-real-pdf"), {
        contentType: "application/pdf",
        filename: "resume.pdf",
      })
      .field("jobDescriptionText", "Vaga para atuar com analytics de produto")
      .expect(400)
      .expect(({ body }) => {
        assert.match(String(body.message), /turnstile/i);
      });

    process.env.SKIP_TURNSTILE_VERIFICATION = "true";

    await request(app.getHttpServer())
      .post("/api/cv-adaptation/analyze")
      .set("Authorization", `Bearer ${user.accessToken}`)
      .send({
        masterResumeId: masterResume.id,
        jobDescriptionText: "Vaga para atuar com analytics de produto",
        turnstileToken: "token-test",
      })
      .expect(201)
      .expect(({ body }) => {
        assert.equal(typeof body.previewText, "string");
        assert.equal(typeof body.masterCvText, "string");
        assert.equal(typeof body.analysisCvSnapshotId, "string");
        assert.ok(body.adaptedContentJson);
      });
  } finally {
    if (previousRolloutMode === undefined) {
      delete process.env.ANALYSIS_ROLLOUT_MODE;
    } else {
      process.env.ANALYSIS_ROLLOUT_MODE = previousRolloutMode;
    }

    if (previousSkipTurnstile === undefined) {
      delete process.env.SKIP_TURNSTILE_VERIFICATION;
    } else {
      process.env.SKIP_TURNSTILE_VERIFICATION = previousSkipTurnstile;
    }
  }

  await deleteUserByEmail(database, user.email);
  await app.close();
});

test("POST /cv-adaptation/analyze-guest blocks missing turnstile token", async () => {
  const { app } = await createApp();
  const previousRolloutMode = process.env.ANALYSIS_ROLLOUT_MODE;
  const previousSkipTurnstile = process.env.SKIP_TURNSTILE_VERIFICATION;
  process.env.ANALYSIS_ROLLOUT_MODE = "hard-block";
  process.env.SKIP_TURNSTILE_VERIFICATION = "false";

  try {
    await request(app.getHttpServer())
      .post("/api/cv-adaptation/analyze-guest")
      .attach("file", Buffer.from("not-a-real-pdf"), {
        contentType: "application/pdf",
        filename: "resume.pdf",
      })
      .field("jobDescriptionText", "Data Analyst role")
      .expect(400)
      .expect(({ body }) => {
        assert.match(String(body.message), /turnstile/i);
      });
  } finally {
    if (previousRolloutMode === undefined) {
      delete process.env.ANALYSIS_ROLLOUT_MODE;
    } else {
      process.env.ANALYSIS_ROLLOUT_MODE = previousRolloutMode;
    }

    if (previousSkipTurnstile === undefined) {
      delete process.env.SKIP_TURNSTILE_VERIFICATION;
    } else {
      process.env.SKIP_TURNSTILE_VERIFICATION = previousSkipTurnstile;
    }
  }

  await app.close();
});

test("user can redeem an awaiting analysis with one credit", async () => {
  const { app, database } = await createApp();
  const user = await registerUser(app, database, "cv-adapt-redeem-credit");

  const masterResume = await database.resume.create({
    data: {
      userId: user.userId,
      title: "CV Master",
      kind: "master",
      status: "uploaded",
      sourceFileType: "application/pdf",
      rawText: "Resumo profissional de teste",
    },
  });

  const adaptation = await database.cvAdaptation.create({
    data: {
      userId: user.userId,
      masterResumeId: masterResume.id,
      jobDescriptionText: "Descricao da vaga",
      jobTitle: "Data Manager",
      companyName: "EarlyCV",
      status: "awaiting_payment",
      paymentStatus: "none",
      adaptedContentJson: {
        vaga: { cargo: "Data Manager", empresa: "EarlyCV" },
        fit: { score: 80, categoria: "alto", headline: "ok" },
      } as unknown as Prisma.InputJsonValue,
    },
  });

  await database.user.update({
    where: { id: user.userId },
    data: { creditsRemaining: 1 },
  });

  await request(app.getHttpServer())
    .post(`/api/cv-adaptation/${adaptation.id}/redeem-credit`)
    .set("Authorization", `Bearer ${user.accessToken}`)
    .expect(201)
    .expect(({ body }) => {
      assert.equal(body.isUnlocked, true);
    });

  const unlock = await database.cvUnlock.findUnique({
    where: { cvAdaptationId: adaptation.id },
  });
  assert.ok(unlock);
  assert.equal(unlock?.source, "CREDIT");
  assert.equal(unlock?.creditsConsumed, 1);

  const planPurchasesCount = await database.planPurchase.count({
    where: { userId: user.userId },
  });
  assert.equal(planPurchasesCount, 0);

  const paymentLogsCount = await database.paymentAuditLog.count({
    where: { internalCheckoutId: adaptation.id },
  });
  assert.equal(paymentLogsCount, 0);

  const refreshedUser = await database.user.findUnique({
    where: { id: user.userId },
    select: { creditsRemaining: true },
  });

  assert.equal(refreshedUser?.creditsRemaining, 0);

  await deleteUserByEmail(database, user.email);
  await app.close();
});

test("redeem-credit does not debit twice for the same adaptation", async () => {
  const { app, database } = await createApp();
  const user = await registerUser(app, database, "cv-adapt-redeem-idempotent");

  const masterResume = await database.resume.create({
    data: {
      userId: user.userId,
      title: "CV Master",
      kind: "master",
      status: "uploaded",
      sourceFileType: "application/pdf",
      rawText: "Resumo profissional de teste",
    },
  });

  const adaptation = await database.cvAdaptation.create({
    data: {
      userId: user.userId,
      masterResumeId: masterResume.id,
      jobDescriptionText: "Descricao da vaga",
      status: "awaiting_payment",
      paymentStatus: "none",
      adaptedContentJson: {
        vaga: { cargo: "Data Manager", empresa: "EarlyCV" },
      } as unknown as Prisma.InputJsonValue,
    },
  });

  await database.user.update({
    where: { id: user.userId },
    data: { creditsRemaining: 2 },
  });

  await request(app.getHttpServer())
    .post(`/api/cv-adaptation/${adaptation.id}/redeem-credit`)
    .set("Authorization", `Bearer ${user.accessToken}`)
    .expect(201);

  await request(app.getHttpServer())
    .post(`/api/cv-adaptation/${adaptation.id}/redeem-credit`)
    .set("Authorization", `Bearer ${user.accessToken}`)
    .expect(201);

  const refreshedUser = await database.user.findUnique({
    where: { id: user.userId },
    select: { creditsRemaining: true },
  });
  assert.equal(refreshedUser?.creditsRemaining, 1);

  const unlockCount = await database.cvUnlock.count({
    where: { cvAdaptationId: adaptation.id },
  });
  assert.equal(unlockCount, 1);

  await deleteUserByEmail(database, user.email);
  await app.close();
});

test("admin payments list excludes cv unlock entries and cv-unlocks list includes them", async () => {
  const { app, database } = await createApp();
  const user = await registerUser(app, database, "cv-adapt-admin-lists-user");
  const superadmin = await registerUser(
    app,
    database,
    "cv-adapt-admin-lists-superadmin",
  );
  await promoteToInternalAdmin(database, superadmin.userId, "superadmin");

  const masterResume = await database.resume.create({
    data: {
      userId: user.userId,
      title: "CV Master",
      kind: "master",
      status: "uploaded",
      sourceFileType: "application/pdf",
      rawText: "Resumo profissional de teste",
    },
  });

  const adaptation = await database.cvAdaptation.create({
    data: {
      userId: user.userId,
      masterResumeId: masterResume.id,
      jobDescriptionText: "Descricao da vaga",
      status: "awaiting_payment",
      paymentStatus: "none",
      adaptedContentJson: {
        vaga: { cargo: "Data Analyst", empresa: "EarlyCV" },
      } as unknown as Prisma.InputJsonValue,
    },
  });

  await database.user.update({
    where: { id: user.userId },
    data: { creditsRemaining: 1 },
  });

  await request(app.getHttpServer())
    .post(`/api/cv-adaptation/${adaptation.id}/redeem-credit`)
    .set("Authorization", `Bearer ${user.accessToken}`)
    .expect(201);

  await request(app.getHttpServer())
    .get("/api/payments/admin/list")
    .set("Authorization", `Bearer ${superadmin.accessToken}`)
    .expect(200)
    .expect(({ body }) => {
      assert.equal(Array.isArray(body.items), true);
      assert.equal(
        body.items.some(
          (item: { checkoutId: string }) => item.checkoutId === adaptation.id,
        ),
        false,
      );
    });

  await request(app.getHttpServer())
    .get("/api/cv-unlocks/admin/list")
    .set("Authorization", `Bearer ${superadmin.accessToken}`)
    .expect(200)
    .expect(({ body }) => {
      assert.equal(Array.isArray(body.items), true);
      assert.equal(
        body.items.some(
          (item: { cvAdaptationId: string }) =>
            item.cvAdaptationId === adaptation.id,
        ),
        true,
      );
    });

  await deleteUserByEmail(database, user.email);
  await deleteUserByEmail(database, superadmin.email);
  await app.close();
});

test("approved buy_credits purchase does not auto-unlock adaptation", async () => {
  const { app, database } = await createApp();
  const user = await registerUser(app, database, "p-buy-no-unlock");

  const masterResume = await database.resume.create({
    data: {
      userId: user.userId,
      title: "CV Master",
      kind: "master",
      status: "uploaded",
      rawText: "Resumo profissional",
    },
  });

  const adaptation = await database.cvAdaptation.create({
    data: {
      userId: user.userId,
      masterResumeId: masterResume.id,
      jobDescriptionText: "Descricao da vaga",
      status: "awaiting_payment",
      paymentStatus: "none",
      adaptedContentJson: { vaga: { cargo: "Data" } } as Prisma.InputJsonValue,
    },
  });

  const paymentReference = randomUUID();
  await database.planPurchase.create({
    data: {
      userId: user.userId,
      planType: "starter",
      amountInCents: 1190,
      currency: "BRL",
      paymentProvider: "mercadopago",
      paymentReference,
      status: "pending",
      creditsGranted: 3,
      analysisCreditsGranted: 6,
      originAction: "buy_credits",
    },
  });

  await markPurchaseAsApproved(app, paymentReference);

  const refreshedAdaptation = await database.cvAdaptation.findUnique({
    where: { id: adaptation.id },
    select: { isUnlocked: true },
  });
  assert.equal(refreshedAdaptation?.isUnlocked, false);

  await deleteUserByEmail(database, user.email);
  await app.close();
});

test("approved unlock_cv purchase with one credit unlocks and leaves net zero credits", async () => {
  const { app, database } = await createApp();
  const user = await registerUser(app, database, "p-unlock-1");

  const masterResume = await database.resume.create({
    data: {
      userId: user.userId,
      title: "CV Master",
      kind: "master",
      status: "uploaded",
      rawText: "Resumo profissional",
    },
  });

  const adaptation = await database.cvAdaptation.create({
    data: {
      userId: user.userId,
      masterResumeId: masterResume.id,
      jobDescriptionText: "Descricao da vaga",
      status: "awaiting_payment",
      paymentStatus: "none",
      adaptedContentJson: { vaga: { cargo: "Data" } } as Prisma.InputJsonValue,
    },
  });

  const paymentReference = randomUUID();
  await database.planPurchase.create({
    data: {
      userId: user.userId,
      planType: "starter",
      amountInCents: 1190,
      currency: "BRL",
      paymentProvider: "mercadopago",
      paymentReference,
      status: "pending",
      creditsGranted: 1,
      analysisCreditsGranted: 6,
      originAction: "unlock_cv",
      originAdaptationId: adaptation.id,
    },
  });

  await markPurchaseAsApproved(app, paymentReference);

  const refreshedUser = await database.user.findUnique({
    where: { id: user.userId },
    select: { creditsRemaining: true },
  });
  assert.equal(refreshedUser?.creditsRemaining, 0);

  const refreshedAdaptation = await database.cvAdaptation.findUnique({
    where: { id: adaptation.id },
    select: { isUnlocked: true },
  });
  assert.equal(refreshedAdaptation?.isUnlocked, true);

  await deleteUserByEmail(database, user.email);
  await app.close();
});

test("approved unlock_cv purchase with five credits unlocks and leaves net +4 credits", async () => {
  const { app, database } = await createApp();
  const user = await registerUser(app, database, "p-unlock-5");

  const masterResume = await database.resume.create({
    data: {
      userId: user.userId,
      title: "CV Master",
      kind: "master",
      status: "uploaded",
      rawText: "Resumo profissional",
    },
  });

  const adaptation = await database.cvAdaptation.create({
    data: {
      userId: user.userId,
      masterResumeId: masterResume.id,
      jobDescriptionText: "Descricao da vaga",
      status: "awaiting_payment",
      paymentStatus: "none",
      adaptedContentJson: { vaga: { cargo: "Data" } } as Prisma.InputJsonValue,
    },
  });

  const paymentReference = randomUUID();
  await database.planPurchase.create({
    data: {
      userId: user.userId,
      planType: "pro",
      amountInCents: 2990,
      currency: "BRL",
      paymentProvider: "mercadopago",
      paymentReference,
      status: "pending",
      creditsGranted: 5,
      analysisCreditsGranted: 9,
      originAction: "unlock_cv",
      originAdaptationId: adaptation.id,
    },
  });

  await markPurchaseAsApproved(app, paymentReference);

  const refreshedUser = await database.user.findUnique({
    where: { id: user.userId },
    select: { creditsRemaining: true },
  });
  assert.equal(refreshedUser?.creditsRemaining, 4);

  await deleteUserByEmail(database, user.email);
  await app.close();
});

test("duplicate approved webhook does not duplicate credit or debit", async () => {
  const { app, database } = await createApp();
  const user = await registerUser(app, database, "p-dup-webhook");

  const masterResume = await database.resume.create({
    data: {
      userId: user.userId,
      title: "CV Master",
      kind: "master",
      status: "uploaded",
      rawText: "Resumo profissional",
    },
  });

  const adaptation = await database.cvAdaptation.create({
    data: {
      userId: user.userId,
      masterResumeId: masterResume.id,
      jobDescriptionText: "Descricao da vaga",
      status: "awaiting_payment",
      paymentStatus: "none",
      adaptedContentJson: { vaga: { cargo: "Data" } } as Prisma.InputJsonValue,
    },
  });

  const paymentReference = randomUUID();
  await database.planPurchase.create({
    data: {
      userId: user.userId,
      planType: "pro",
      amountInCents: 2990,
      currency: "BRL",
      paymentProvider: "mercadopago",
      paymentReference,
      status: "pending",
      creditsGranted: 5,
      analysisCreditsGranted: 9,
      originAction: "unlock_cv",
      originAdaptationId: adaptation.id,
    },
  });

  await markPurchaseAsApproved(app, paymentReference);
  await markPurchaseAsApproved(app, paymentReference);

  const refreshedUser = await database.user.findUnique({
    where: { id: user.userId },
    select: { creditsRemaining: true },
  });
  assert.equal(refreshedUser?.creditsRemaining, 4);

  const unlockCount = await database.cvUnlock.count({
    where: { cvAdaptationId: adaptation.id },
  });
  assert.equal(unlockCount, 1);

  await deleteUserByEmail(database, user.email);
  await app.close();
});

test("approved unlock_cv does not debit again when adaptation is already unlocked", async () => {
  const { app, database } = await createApp();
  let user: RegisterResult | null = null;

  try {
    user = await registerUser(app, database, "p-unlock-already");

    const masterResume = await database.resume.create({
      data: {
        userId: user.userId,
        title: "CV Master",
        kind: "master",
        status: "uploaded",
        rawText: "Resumo profissional",
      },
    });

    const adaptation = await database.cvAdaptation.create({
      data: {
        userId: user.userId,
        masterResumeId: masterResume.id,
        jobDescriptionText: "Descricao da vaga",
        status: "paid",
        paymentStatus: "none",
        isUnlocked: true,
        unlockedAt: new Date(),
        adaptedContentJson: {
          vaga: { cargo: "Data" },
        } as Prisma.InputJsonValue,
      },
    });

    const paymentReference = randomUUID();
    const purchase = await database.planPurchase.create({
      data: {
        userId: user.userId,
        planType: "starter",
        amountInCents: 1190,
        currency: "BRL",
        paymentProvider: "mercadopago",
        paymentReference,
        status: "pending",
        creditsGranted: 1,
        analysisCreditsGranted: 6,
        originAction: "unlock_cv",
        originAdaptationId: adaptation.id,
      },
    });

    await markPurchaseAsApproved(app, paymentReference);

    const refreshedUser = await database.user.findUnique({
      where: { id: user.userId },
      select: { creditsRemaining: true },
    });

    const unlockCount = await database.cvUnlock.count({
      where: { cvAdaptationId: adaptation.id },
    });

    const refreshedPurchase = await database.planPurchase.findUnique({
      where: { id: purchase.id },
      select: {
        status: true,
        originAction: true,
        creditsGranted: true,
        autoUnlockProcessedAt: true,
        autoUnlockError: true,
      },
    });

    const refreshedAdaptation = await database.cvAdaptation.findUnique({
      where: { id: adaptation.id },
      select: { isUnlocked: true },
    });

    assert.equal(
      refreshedUser?.creditsRemaining,
      1,
      `creditsRemaining expected 1, got ${String(refreshedUser?.creditsRemaining)}`,
    );
    assert.equal(
      refreshedPurchase?.status,
      "completed",
      `purchase status expected completed, got ${String(refreshedPurchase?.status)}`,
    );
    assert.equal(
      refreshedPurchase?.originAction,
      "unlock_cv",
      `originAction expected unlock_cv, got ${String(refreshedPurchase?.originAction)}`,
    );
    assert.equal(
      refreshedPurchase?.creditsGranted,
      1,
      `creditsGranted expected 1, got ${String(refreshedPurchase?.creditsGranted)}`,
    );
    assert.equal(
      refreshedAdaptation?.isUnlocked,
      true,
      `adaptationUnlocked expected true, got ${String(refreshedAdaptation?.isUnlocked)}`,
    );
    assert.equal(
      refreshedPurchase?.autoUnlockError,
      null,
      `autoUnlockError expected null, got ${String(refreshedPurchase?.autoUnlockError)}`,
    );
    assert.ok(
      refreshedPurchase?.autoUnlockProcessedAt,
      `autoUnlockProcessedAt expected present, got ${String(refreshedPurchase?.autoUnlockProcessedAt)}`,
    );
    assert.equal(
      unlockCount,
      0,
      `unlockCount expected 0, got ${String(unlockCount)}`,
    );
  } finally {
    if (user) {
      await deleteUserByEmail(database, user.email);
    }
    await app.close();
  }
});

test("ownership mismatch records autoUnlockError and preserves purchased credits", async () => {
  const { app, database } = await createApp();
  const buyer = await registerUser(app, database, "p-mismatch-buyer");
  const owner = await registerUser(app, database, "p-mismatch-owner");

  const ownerResume = await database.resume.create({
    data: {
      userId: owner.userId,
      title: "CV Master",
      kind: "master",
      status: "uploaded",
      rawText: "Resumo profissional",
    },
  });

  const adaptation = await database.cvAdaptation.create({
    data: {
      userId: owner.userId,
      masterResumeId: ownerResume.id,
      jobDescriptionText: "Descricao da vaga",
      status: "awaiting_payment",
      paymentStatus: "none",
      adaptedContentJson: { vaga: { cargo: "Data" } } as Prisma.InputJsonValue,
    },
  });

  const paymentReference = randomUUID();
  const purchase = await database.planPurchase.create({
    data: {
      userId: buyer.userId,
      planType: "starter",
      amountInCents: 1190,
      currency: "BRL",
      paymentProvider: "mercadopago",
      paymentReference,
      status: "pending",
      creditsGranted: 1,
      analysisCreditsGranted: 6,
      originAction: "unlock_cv",
      originAdaptationId: adaptation.id,
    },
  });

  await markPurchaseAsApproved(app, paymentReference);

  const refreshedBuyer = await database.user.findUnique({
    where: { id: buyer.userId },
    select: { creditsRemaining: true },
  });
  assert.equal(refreshedBuyer?.creditsRemaining, 1);

  const refreshedAdaptation = await database.cvAdaptation.findUnique({
    where: { id: adaptation.id },
    select: { isUnlocked: true },
  });
  assert.equal(refreshedAdaptation?.isUnlocked, false);

  const refreshedPurchase = await database.planPurchase.findUnique({
    where: { id: purchase.id },
    select: { autoUnlockError: true },
  });
  assert.match(
    String(refreshedPurchase?.autoUnlockError),
    /ownership mismatch/i,
  );

  await deleteUserByEmail(database, buyer.email);
  await deleteUserByEmail(database, owner.email);
  await app.close();
});

test("missing adapted content records autoUnlockError and preserves purchased credits", async () => {
  const { app, database } = await createApp();
  const user = await registerUser(app, database, "p-unlock-no-content");

  const masterResume = await database.resume.create({
    data: {
      userId: user.userId,
      title: "CV Master",
      kind: "master",
      status: "uploaded",
      rawText: "Resumo profissional",
    },
  });

  const adaptation = await database.cvAdaptation.create({
    data: {
      userId: user.userId,
      masterResumeId: masterResume.id,
      jobDescriptionText: "Descricao da vaga",
      status: "awaiting_payment",
      paymentStatus: "none",
      adaptedContentJson: null,
    },
  });

  const paymentReference = randomUUID();
  const purchase = await database.planPurchase.create({
    data: {
      userId: user.userId,
      planType: "starter",
      amountInCents: 1190,
      currency: "BRL",
      paymentProvider: "mercadopago",
      paymentReference,
      status: "pending",
      creditsGranted: 1,
      analysisCreditsGranted: 6,
      originAction: "unlock_cv",
      originAdaptationId: adaptation.id,
    },
  });

  await markPurchaseAsApproved(app, paymentReference);

  const refreshedUser = await database.user.findUnique({
    where: { id: user.userId },
    select: { creditsRemaining: true },
  });
  assert.equal(refreshedUser?.creditsRemaining, 1);

  const refreshedAdaptation = await database.cvAdaptation.findUnique({
    where: { id: adaptation.id },
    select: { isUnlocked: true },
  });
  assert.equal(refreshedAdaptation?.isUnlocked, false);

  const refreshedPurchase = await database.planPurchase.findUnique({
    where: { id: purchase.id },
    select: { autoUnlockError: true },
  });
  assert.match(
    String(refreshedPurchase?.autoUnlockError),
    /no adapted content/i,
  );

  await deleteUserByEmail(database, user.email);
  await app.close();
});
