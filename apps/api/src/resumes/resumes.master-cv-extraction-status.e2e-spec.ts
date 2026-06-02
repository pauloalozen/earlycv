import "reflect-metadata";

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";

import { type INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";

import { AppModule } from "../app.module";
import { DatabaseService } from "../database/database.service";

const TEST_TIMEOUT_MS = 120_000;

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

test("GET /api/resumes/master-cv-extraction-status returns latest extraction status for authenticated user (isolated)", {
  timeout: TEST_TIMEOUT_MS,
}, async () => {
  const { app, database } = await createApp();
  const user = await registerUser(app, database, "iso-extraction-status");
  const otherUser = await registerUser(
    app,
    database,
    "iso-extraction-status-other",
  );

  try {
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
        userId: otherUser.userId,
        title: "Other Resume",
        status: "uploaded",
        kind: "master",
        isMaster: true,
      },
    });

    await database.masterCvCanonicalExtraction.create({
      data: {
        userId: otherUser.userId,
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
      data: { updatedAt: new Date(Date.now() - 60_000) },
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
    assert.equal(
      response.body.updatedAt,
      latestOwnExtraction.updatedAt.toISOString(),
    );
  } finally {
    await deleteUserByEmail(database, user.email);
    await deleteUserByEmail(database, otherUser.email);
    await app.close();
  }
});

test("GET /api/resumes/master-cv-extraction-status returns failed with null coverage when latest run has no coverage (isolated)", {
  timeout: TEST_TIMEOUT_MS,
}, async () => {
  const { app, database } = await createApp();
  const user = await registerUser(app, database, "iso-extraction-status-empty");

  try {
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
    await deleteUserByEmail(database, user.email);
    await app.close();
  }
});
