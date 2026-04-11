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
    })
    .expect(201);

  return {
    accessToken: response.body.accessToken as string,
    email,
    userId: response.body.user.id as string,
  };
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
      jobTitle: "Analista de Produto",
      companyName: "EarlyCV",
      previewText: "Bom alinhamento com a vaga",
    })
    .expect(201);

  const adaptationId = claimResponse.body.id as string;

  const savedAdaptation = await database.cvAdaptation.findUnique({
    where: { id: adaptationId },
    select: { aiAuditJson: true },
  });

  const generatedOutput = savedAdaptation?.aiAuditJson as {
    summary?: string;
    sections?: unknown[];
  } | null;

  assert.equal(typeof generatedOutput?.summary, "string");
  assert.equal(Array.isArray(generatedOutput?.sections), true);

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
      assert.equal(body.paymentStatus, "completed");
    });

  const refreshedUser = await database.user.findUnique({
    where: { id: user.userId },
    select: { creditsRemaining: true },
  });

  assert.equal(refreshedUser?.creditsRemaining, 0);

  await deleteUserByEmail(database, user.email);
  await app.close();
});
