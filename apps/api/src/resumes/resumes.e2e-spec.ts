import "reflect-metadata";

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { type INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { sign } from "jsonwebtoken";
import request from "supertest";

import { AppModule } from "../app.module";
import { DatabaseService } from "../database/database.service";
import { ResumesService } from "./resumes.service";

type DeleteManyDelegate = {
  deleteMany: (args?: unknown) => Promise<unknown>;
};

type RegisterResult = {
  accessToken: string;
  email: string;
  userId: string;
};

type UserSession = {
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

async function createAppWithResumesServiceStub(resumesService: ResumesService) {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(ResumesService)
    .useValue(resumesService)
    .compile();

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

async function createActiveUserSession(
  database: DatabaseService,
  prefix: string,
): Promise<UserSession> {
  const email = `${prefix}+${randomUUID()}@earlycv.dev`;
  await deleteUserByEmail(database, email);

  const user = await database.user.create({
    data: {
      email,
      name: `${prefix} User`,
      status: "active",
    },
  });

  const jwtSecret = process.env.JWT_ACCESS_SECRET;
  if (!jwtSecret) {
    throw new Error("JWT_ACCESS_SECRET is required for e2e token generation");
  }

  const accessToken = sign({ sub: user.id, type: "access" }, jwtSecret, {
    expiresIn: "15m",
  });

  return {
    accessToken,
    email,
    userId: user.id,
  };
}

test("resume endpoints stay scoped to the authenticated user", async () => {
  const { app, database } = await createApp();
  const firstUser = await registerUser(app, database, "resume-one");
  const secondUser = await registerUser(app, database, "resume-two");

  try {
    const ownResumeResponse = await request(app.getHttpServer())
      .post("/api/resumes")
      .set("Authorization", `Bearer ${firstUser.accessToken}`)
      .send({
        title: "Data Resume",
        sourceFileName: "resume-ana.pdf",
        status: "uploaded",
      })
      .expect(201);

    const ownResumeId = ownResumeResponse.body.id as string;

    const otherResume = await database.resume.create({
      data: {
        userId: secondUser.userId,
        title: "Other Resume",
        status: "draft",
      },
    });

    await request(app.getHttpServer())
      .get("/api/resumes")
      .set("Authorization", `Bearer ${firstUser.accessToken}`)
      .expect(200)
      .expect(({ body }) => {
        assert.equal(Array.isArray(body), true);
        assert.equal(body.length, 1);
        assert.equal(body[0]?.id, ownResumeId);
        assert.equal(body[0]?.userId, firstUser.userId);
        assert.equal(body[0]?.isMaster, true);
        assert.equal(body[0]?.kind, "master");
      });

    await request(app.getHttpServer())
      .get(`/api/resumes/${ownResumeId}`)
      .set("Authorization", `Bearer ${firstUser.accessToken}`)
      .expect(200)
      .expect(({ body }) => {
        assert.equal(body.id, ownResumeId);
        assert.equal(body.userId, firstUser.userId);
        assert.equal(body.title, "Data Resume");
      });

    await request(app.getHttpServer())
      .get(`/api/resumes/${otherResume.id}`)
      .set("Authorization", `Bearer ${firstUser.accessToken}`)
      .expect(404);

    await request(app.getHttpServer())
      .put(`/api/resumes/${otherResume.id}`)
      .set("Authorization", `Bearer ${firstUser.accessToken}`)
      .send({ title: "Should Not Leak" })
      .expect(404);
  } finally {
    await deleteUserByEmail(database, firstUser.email);
    await deleteUserByEmail(database, secondUser.email);
    await app.close();
  }
});

test("POST /api/resumes accepts turnstileToken for master CV uploads", async () => {
  const capturedCalls: Array<{
    dto: { title: string };
    file: { originalname: string } | undefined;
    turnstileToken: string | undefined;
    userId: string;
  }> = [];
  const { app, database } = await createAppWithResumesServiceStub({
    create: async (userId, dto, file, turnstileToken) => {
      capturedCalls.push({
        userId,
        dto: { title: dto.title },
        file: file ? { originalname: file.originalname } : undefined,
        turnstileToken,
      });

      return {
        id: "resume-stub",
        title: dto.title,
        sourceFileName: file?.originalname ?? null,
        isMaster: true,
        updatedAt: new Date("2026-06-02T12:00:00.000Z").toISOString(),
      };
    },
  } as unknown as ResumesService);
  const user = await registerUser(app, database, "resume-turnstile");

  try {
    const response = await request(app.getHttpServer())
      .post("/api/resumes")
      .set("Authorization", `Bearer ${user.accessToken}`)
      .attach("file", Buffer.from("%PDF-1.4\n%mock"), {
        contentType: "application/pdf",
        filename: "cv-base.pdf",
      })
      .field("title", "CV Master")
      .field("isPrimary", "true")
      .field("turnstileToken", "turnstile-upload-token")
      .expect(201);

    assert.equal(response.body.id, "resume-stub");
    assert.equal(response.body.title, "CV Master");
    assert.equal(response.body.isMaster, true);
    assert.equal(response.body.updatedAt, "2026-06-02T12:00:00.000Z");
    assert.deepEqual(capturedCalls, [
      {
        userId: user.userId,
        dto: { title: "CV Master" },
        file: { originalname: "cv-base.pdf" },
        turnstileToken: "turnstile-upload-token",
      },
    ]);
  } finally {
    await deleteUserByEmail(database, user.email);
    await app.close();
  }
});

test("POST /api/resumes keeps non-primary uploads as generic master resumes", async () => {
  const { app, database } = await createApp();
  const user = await registerUser(app, database, "resume-secondary");

  try {
    await request(app.getHttpServer())
      .post("/api/resumes")
      .set("Authorization", `Bearer ${user.accessToken}`)
      .send({
        title: "Primary Resume",
        sourceFileName: "resume-primary.pdf",
        status: "uploaded",
      })
      .expect(201);

    const secondResumeResponse = await request(app.getHttpServer())
      .post("/api/resumes")
      .set("Authorization", `Bearer ${user.accessToken}`)
      .send({
        title: "Secondary Resume",
        sourceFileName: "resume-secondary.pdf",
        status: "reviewed",
      })
      .expect(201);

    assert.equal(secondResumeResponse.body.isMaster, false);
    assert.equal(secondResumeResponse.body.kind, "master");
    assert.equal(secondResumeResponse.body.basedOnResumeId, null);

    const resumes = await database.resume.findMany({
      where: { userId: user.userId },
      orderBy: { createdAt: "asc" },
    });

    assert.equal(resumes.length, 2);
    assert.equal(resumes[0]?.isMaster, true);
    assert.equal(resumes[0]?.kind, "master");
    assert.equal(resumes[1]?.isMaster, false);
    assert.equal(resumes[1]?.kind, "master");
  } finally {
    await deleteUserByEmail(database, user.email);
    await app.close();
  }
});

test("POST /api/resumes/:id/set-primary keeps one primary resume per user", async () => {
  const { app, database } = await createApp();
  const user = await registerUser(app, database, "resume-primary");
  const otherUser = await registerUser(app, database, "resume-primary-other");

  const firstResume = await database.resume.create({
    data: {
      userId: user.userId,
      title: "Resume One",
      status: "uploaded",
      kind: "master",
      isMaster: true,
    },
  });
  const secondResume = await database.resume.create({
    data: {
      userId: user.userId,
      title: "Resume Two",
      status: "reviewed",
      kind: "master",
      isMaster: false,
    },
  });
  const otherResume = await database.resume.create({
    data: {
      userId: otherUser.userId,
      title: "Other User Resume",
      status: "draft",
      kind: "master",
      isMaster: true,
    },
  });

  await request(app.getHttpServer())
    .post(`/api/resumes/${secondResume.id}/set-primary`)
    .set("Authorization", `Bearer ${user.accessToken}`)
    .expect(200)
    .expect(({ body }) => {
      assert.equal(body.id, secondResume.id);
      assert.equal(body.isMaster, true);
      assert.equal(body.kind, "master");
    });

  const userResumes = await database.resume.findMany({
    where: { userId: user.userId },
    orderBy: { createdAt: "asc" },
  });
  const refreshedOtherResume = await database.resume.findUnique({
    where: { id: otherResume.id },
  });

  assert.equal(userResumes.filter((resume) => resume.isMaster).length, 1);
  assert.equal(
    userResumes.find((resume) => resume.id === firstResume.id)?.isMaster,
    false,
  );
  assert.equal(
    userResumes.find((resume) => resume.id === firstResume.id)?.kind,
    "master",
  );
  assert.equal(
    userResumes.find((resume) => resume.id === secondResume.id)?.isMaster,
    true,
  );
  assert.equal(
    userResumes.find((resume) => resume.id === secondResume.id)?.kind,
    "master",
  );
  assert.equal(refreshedOtherResume?.isMaster, true);
  assert.equal(refreshedOtherResume?.kind, "master");

  await request(app.getHttpServer())
    .post(`/api/resumes/${otherResume.id}/set-primary`)
    .set("Authorization", `Bearer ${user.accessToken}`)
    .expect(404);

  await deleteUserByEmail(database, user.email);
  await deleteUserByEmail(database, otherUser.email);
  await app.close();
});

test("updating the current primary resume cannot leave the user without a primary resume", async () => {
  const { app, database } = await createApp();
  const user = await registerUser(app, database, "resume-update-primary");

  const primaryResume = await database.resume.create({
    data: {
      userId: user.userId,
      title: "Primary Resume",
      status: "uploaded",
      kind: "master",
      isMaster: true,
    },
  });

  await request(app.getHttpServer())
    .put(`/api/resumes/${primaryResume.id}`)
    .set("Authorization", `Bearer ${user.accessToken}`)
    .send({ isPrimary: false, title: "Updated Primary Resume" })
    .expect(200)
    .expect(({ body }) => {
      assert.equal(body.isMaster, true);
      assert.equal(body.kind, "master");
      assert.equal(body.title, "Updated Primary Resume");
    });

  const refreshedResume = await database.resume.findUnique({
    where: { id: primaryResume.id },
  });

  assert.equal(refreshedResume?.isMaster, true);
  assert.equal(refreshedResume?.kind, "master");

  await deleteUserByEmail(database, user.email);
  await app.close();
});

test("DELETE /api/resumes/:id removes dependent resumes instead of promoting them", async () => {
  const { app, database } = await createApp();
  try {
    const firstUser = await registerUser(app, database, "resume-delete-one");
    const secondUser = await registerUser(app, database, "resume-delete-two");

    const ownResume = await database.resume.create({
      data: {
        userId: firstUser.userId,
        title: "Keep Primary",
        status: "draft",
        kind: "master",
        isMaster: true,
      },
    });
    const secondaryResume = await database.resume.create({
      data: {
        userId: firstUser.userId,
        title: "Delete Me",
        status: "reviewed",
        kind: "adapted",
        isMaster: false,
        basedOnResumeId: ownResume.id,
      },
    });
    const otherResume = await database.resume.create({
      data: {
        userId: secondUser.userId,
        title: "Keep Me",
        status: "reviewed",
      },
    });

    await request(app.getHttpServer())
      .delete(`/api/resumes/${otherResume.id}`)
      .set("Authorization", `Bearer ${firstUser.accessToken}`)
      .expect(404);

    await request(app.getHttpServer())
      .delete(`/api/resumes/${ownResume.id}`)
      .set("Authorization", `Bearer ${firstUser.accessToken}`)
      .expect(200)
      .expect(({ body }) => {
        assert.deepEqual(body, { ok: true });
      });

    const deletedPrimaryResume = await database.resume.findUnique({
      where: { id: ownResume.id },
    });
    const deletedDependentResume = await database.resume.findUnique({
      where: { id: secondaryResume.id },
    });
    const untouchedOtherResume = await database.resume.findUnique({
      where: { id: otherResume.id },
    });

    assert.equal(deletedPrimaryResume, null);
    assert.equal(deletedDependentResume, null);
    assert.equal(untouchedOtherResume?.id, otherResume.id);

    await deleteUserByEmail(database, firstUser.email);
    await deleteUserByEmail(database, secondUser.email);
  } finally {
    await app.close();
  }
});

test("GET /api/resumes/master-cv-extraction-status returns latest extraction status for authenticated user", {
  timeout: 120_000,
}, async () => {
  const { app, database } = await createApp();
  let user: UserSession | null = null;
  let otherUserEmail: string | null = null;
  let otherUserId: string | null = null;

  try {
    user = await createActiveUserSession(database, "resume-extraction-status");
    otherUserEmail = `resume-extraction-status-other+${randomUUID()}@earlycv.dev`;
    const otherUser = await database.user.create({
      data: {
        email: otherUserEmail,
        name: "Resume Extraction Status Other",
      },
    });
    otherUserId = otherUser.id;

    const ownResume = await database.resume.create({
      data: {
        userId: user.userId,
        title: "Own Resume",
        status: "uploaded",
        kind: "master",
        isMaster: true,
      },
    });
    const otherResume = await database.resume.create({
      data: {
        userId: otherUserId,
        title: "Other Resume",
        status: "uploaded",
        kind: "master",
        isMaster: true,
      },
    });

    await database.masterCvCanonicalExtraction.create({
      data: {
        userId: otherUserId,
        resumeId: otherResume.id,
        inputHash: randomUUID(),
        status: "succeeded",
        coverageJson: {
          identifiedFields: ["fullName"],
          missingFields: ["education"],
          fieldStatus: {
            fullName: "filled",
            education: "missing",
          },
        },
      },
    });

    const olderOwnExtraction =
      await database.masterCvCanonicalExtraction.create({
        data: {
          userId: user.userId,
          resumeId: ownResume.id,
          inputHash: randomUUID(),
          status: "failed",
        },
      });

    await database.masterCvCanonicalExtraction.update({
      where: { id: olderOwnExtraction.id },
      data: {
        updatedAt: new Date(Date.now() - 60_000),
      },
    });

    const latestOwnExtraction =
      await database.masterCvCanonicalExtraction.create({
        data: {
          userId: user.userId,
          resumeId: ownResume.id,
          inputHash: randomUUID(),
          status: "succeeded",
          coverageJson: {
            identifiedFields: ["fullName", "experiences"],
            missingFields: ["education", "certifications"],
            fieldStatus: {
              fullName: "filled",
              experiences: "partial",
              education: "missing",
              certifications: "missing",
            },
          },
        },
      });

    const response = await request(app.getHttpServer())
      .get("/api/resumes/master-cv-extraction-status")
      .set("Authorization", `Bearer ${user.accessToken}`);

    assert.equal(response.status, 200);
    assert.equal(response.body.status, "succeeded");
    assert.deepEqual(response.body.extractionCoverage, {
      identifiedFields: ["fullName", "experiences"],
      missingFields: ["education", "certifications"],
      fieldStatus: {
        fullName: "filled",
        experiences: "partial",
        education: "missing",
        certifications: "missing",
      },
    });
    assert.equal(typeof response.body.updatedAt, "string");
    assert.equal(
      response.body.updatedAt,
      latestOwnExtraction.updatedAt.toISOString(),
    );
  } finally {
    if (user) {
      await deleteUserByEmail(database, user.email);
    }
    if (otherUserEmail) {
      await deleteUserByEmail(database, otherUserEmail);
    }
    await app.close();
  }
});

test("GET /api/resumes/master-cv-extraction-status omits extractionCoverage when latest run has no coverage", {
  timeout: 120_000,
}, async () => {
  const { app, database } = await createApp();
  let user: UserSession | null = null;

  try {
    user = await createActiveUserSession(
      database,
      "resume-extraction-status-empty",
    );
    const ownResume = await database.resume.create({
      data: {
        userId: user.userId,
        title: "Own Resume",
        status: "uploaded",
        kind: "master",
        isMaster: true,
      },
    });

    const latestOwnExtraction =
      await database.masterCvCanonicalExtraction.create({
        data: {
          userId: user.userId,
          resumeId: ownResume.id,
          inputHash: randomUUID(),
          status: "failed",
        },
      });

    const response = await request(app.getHttpServer())
      .get("/api/resumes/master-cv-extraction-status")
      .set("Authorization", `Bearer ${user.accessToken}`);

    assert.equal(response.status, 200);
    assert.equal(response.body.status, "failed");
    assert.equal(response.body.extractionCoverage, null);
    assert.equal(
      response.body.updatedAt,
      latestOwnExtraction.updatedAt.toISOString(),
    );
  } finally {
    if (user) {
      await deleteUserByEmail(database, user.email);
    }
    await app.close();
  }
});
