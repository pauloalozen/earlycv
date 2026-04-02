import "reflect-metadata";

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";

import { JwtService } from "@nestjs/jwt";
import { Test } from "@nestjs/testing";

import { DatabaseModule } from "../database/database.module";
import { DatabaseService } from "../database/database.service";
import { FakeEmailDeliveryService } from "./fake-email-delivery.service";

type DeleteManyDelegate = {
  deleteMany: (args?: unknown) => Promise<unknown>;
};

type RefreshTokenDelegate = DeleteManyDelegate & {
  findMany: (args?: unknown) => Promise<
    Array<{
      createdAt: Date;
      revokedAt: Date | null;
      sessionId: string;
      tokenHash: string;
    }>
  >;
};

type UserDelegate = DeleteManyDelegate & {
  deleteMany: (args?: unknown) => Promise<unknown>;
  findUnique: (args: unknown) => Promise<{
    passwordHash: string | null;
    profile: unknown;
    status: string;
    emailVerifiedAt: Date | null;
    authAccounts: Array<{ provider: string }>;
  } | null>;
};

type EmailVerificationChallengeDelegate = DeleteManyDelegate & {
  findMany: (args?: unknown) => Promise<
    Array<{
      codeHash: string;
      consumedAt: Date | null;
      expiresAt: Date;
      userId: string;
    }>
  >;
};

async function importAuthModule() {
  const imported = await import("./auth" + ".module").catch(() => null);

  if (!imported) {
    return null;
  }

  return (imported.default ?? imported["module.exports"] ?? imported) as {
    AuthModule: unknown;
  };
}

async function importAuthService() {
  const imported = await import("./auth" + ".service").catch(() => null);

  if (!imported) {
    return null;
  }

  return (imported.default ?? imported["module.exports"] ?? imported) as {
    AuthService: unknown;
  };
}

async function deleteUserByEmail(database: DatabaseService, email: string) {
  await (database.user as UserDelegate).deleteMany({
    where: { email },
  });
}

test("AuthService registers a user and stores a hashed refresh token", async () => {
  const authModuleExports = await importAuthModule();
  const authServiceExports = await importAuthService();

  assert.notEqual(authModuleExports, null);
  assert.notEqual(authServiceExports, null);

  const { AuthModule } = authModuleExports as { AuthModule: never };
  const { AuthService } = authServiceExports as { AuthService: never };

  const moduleRef = await Test.createTestingModule({
    imports: [DatabaseModule, AuthModule],
  }).compile();

  const database = moduleRef.get(DatabaseService);
  const service = moduleRef.get(AuthService);
  const jwtService = moduleRef.get(JwtService);
  const fakeEmailDelivery = moduleRef.get(FakeEmailDeliveryService);
  const email = `ana+${randomUUID()}@earlycv.dev`;

  await deleteUserByEmail(database, email);

  const result = await service.register({
    email,
    password: "super-secret-123",
    name: "Ana Silva",
  });

  assert.equal(typeof result.accessToken, "string");
  assert.equal(typeof result.refreshToken, "string");
  assert.equal(result.user.email, email);
  assert.equal(result.user.emailVerifiedAt, null);
  assert.equal("passwordHash" in result.user, false);

  const refreshPayload = await jwtService.verifyAsync<{
    sessionId: string;
    sub: string;
    type: "refresh";
  }>(result.refreshToken, {
    secret: process.env.JWT_REFRESH_SECRET,
  });

  const refreshRows = await (
    database.refreshToken as unknown as RefreshTokenDelegate
  ).findMany({ where: { user: { email } } });

  assert.equal(refreshRows.length, 1);
  assert.notEqual(refreshRows[0]?.tokenHash, result.refreshToken);
  assert.equal(refreshRows[0]?.sessionId, refreshPayload.sessionId);

  const verificationRows = await (
    database.emailVerificationChallenge as unknown as EmailVerificationChallengeDelegate
  ).findMany({ where: { user: { email } } });

  assert.equal(verificationRows.length, 1);
  assert.equal(verificationRows[0]?.consumedAt ?? null, null);
  assert.equal(typeof verificationRows[0]?.codeHash, "string");
  assert.equal(verificationRows[0]?.codeHash.length > 0, true);
  assert.equal(verificationRows[0]?.expiresAt instanceof Date, true);

  const sentMessages = fakeEmailDelivery.listSentMessages();

  assert.equal(sentMessages.length, 1);
  assert.equal(sentMessages[0]?.to, email);
  assert.equal(sentMessages[0]?.subject.includes("codigo"), true);

  const storedUser = await (database.user as UserDelegate).findUnique({
    where: { email },
    include: { authAccounts: true, profile: true },
  });

  assert.equal(storedUser?.status, "active");
  assert.equal(storedUser?.emailVerifiedAt ?? null, null);
  assert.equal(typeof storedUser?.passwordHash, "string");
  assert.equal(storedUser?.authAccounts.length, 1);
  assert.equal(storedUser?.authAccounts[0]?.provider, "credentials");
  assert.notEqual(storedUser?.profile, null);

  await deleteUserByEmail(database, email);
  await moduleRef.close();
});

test("AuthService rotates refresh tokens and logout revokes the active session", async () => {
  const authModuleExports = await importAuthModule();
  const authServiceExports = await importAuthService();

  assert.notEqual(authModuleExports, null);
  assert.notEqual(authServiceExports, null);

  const { AuthModule } = authModuleExports as { AuthModule: never };
  const { AuthService } = authServiceExports as { AuthService: never };

  const moduleRef = await Test.createTestingModule({
    imports: [DatabaseModule, AuthModule],
  }).compile();

  const database = moduleRef.get(DatabaseService);
  const service = moduleRef.get(AuthService);
  const email = `bia+${randomUUID()}@earlycv.dev`;

  await deleteUserByEmail(database, email);

  const registered = await service.register({
    email,
    password: "super-secret-123",
    name: "Bia Souza",
  });

  const refreshed = await service.refresh({
    refreshToken: registered.refreshToken,
  });

  assert.equal(typeof refreshed.accessToken, "string");
  assert.equal(typeof refreshed.refreshToken, "string");
  assert.notEqual(refreshed.refreshToken, registered.refreshToken);

  await assert.rejects(
    service.refresh({ refreshToken: registered.refreshToken }),
    /refresh token/i,
  );

  const tokenRowsAfterRefresh = await (
    database.refreshToken as unknown as RefreshTokenDelegate
  ).findMany({
    where: { user: { email } },
    orderBy: { createdAt: "asc" },
  });

  assert.equal(tokenRowsAfterRefresh.length, 2);
  assert.notEqual(tokenRowsAfterRefresh[0]?.revokedAt, null);
  assert.equal(tokenRowsAfterRefresh[1]?.revokedAt ?? null, null);

  await service.logout({ refreshToken: refreshed.refreshToken });

  const tokenRowsAfterLogout = await (
    database.refreshToken as unknown as RefreshTokenDelegate
  ).findMany({
    where: { user: { email } },
    orderBy: { createdAt: "asc" },
  });

  assert.notEqual(tokenRowsAfterLogout[1]?.revokedAt, null);

  await assert.rejects(
    service.refresh({ refreshToken: refreshed.refreshToken }),
    /refresh token/i,
  );

  await deleteUserByEmail(database, email);
  await moduleRef.close();
});
