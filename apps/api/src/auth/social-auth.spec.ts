import "reflect-metadata";

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";

import { Test } from "@nestjs/testing";

import { DatabaseModule } from "../database/database.module";
import { DatabaseService } from "../database/database.service";
import { AuthController } from "./auth.controller";
import { AuthModule } from "./auth.module";
import { AuthService, type AuthSession } from "./auth.service";
import { GoogleStrategy } from "./strategies/google.strategy";

type DeleteManyDelegate = {
  deleteMany: (args?: unknown) => Promise<unknown>;
};

type SocialProfileInput = {
  provider: "google" | "linkedin";
  providerAccountId: string;
  email: string;
  name: string;
  emailVerified: boolean;
};

type SocialAuthService = AuthService & {
  finishSocialLogin: (input: SocialProfileInput) => Promise<AuthSession>;
};

type SocialAuthController = AuthController & {
  googleStart: () => void;
  googleCallback: (request: {
    oauthUser: SocialProfileInput;
  }) => Promise<AuthSession>;
  linkedinStart: () => void;
  linkedinCallback: (request: {
    oauthUser: SocialProfileInput;
  }) => Promise<AuthSession>;
};

async function deleteUserByEmail(database: DatabaseService, email: string) {
  await (database.user as DeleteManyDelegate).deleteMany({
    where: { email },
  });
}

test("social login links a Google account to an existing user by verified email", async () => {
  const moduleRef = await Test.createTestingModule({
    imports: [DatabaseModule, AuthModule],
  }).compile();

  const database = moduleRef.get(DatabaseService);
  const service = moduleRef.get(AuthService) as SocialAuthService;
  const email = `ana+${randomUUID()}@earlycv.dev`;

  await deleteUserByEmail(database, email);

  const user = await database.user.create({
    data: {
      email,
      name: "Ana Silva",
      status: "active",
      profile: { create: {} },
    },
  });

  const session = await service.finishSocialLogin({
    provider: "google",
    providerAccountId: `google-${randomUUID()}`,
    email,
    name: "Ana Silva",
    emailVerified: true,
  });

  const linkedAccount = await database.authAccount.findFirst({
    where: {
      provider: "google",
      userId: user.id,
    },
  });

  const linkedUser = await database.user.findUnique({
    where: { id: user.id },
  });

  assert.equal(typeof session.accessToken, "string");
  assert.equal(typeof session.refreshToken, "string");
  assert.equal(session.user.id, user.id);
  assert.equal(Boolean(linkedAccount), true);
  assert.notEqual(linkedUser?.emailVerifiedAt, null);

  await deleteUserByEmail(database, email);
  await moduleRef.close();
});

test("social login creates a new user for a verified LinkedIn profile when no account exists", async () => {
  const moduleRef = await Test.createTestingModule({
    imports: [DatabaseModule, AuthModule],
  }).compile();

  const database = moduleRef.get(DatabaseService);
  const service = moduleRef.get(AuthService) as SocialAuthService;
  const email = `bia+${randomUUID()}@earlycv.dev`;

  await deleteUserByEmail(database, email);

  const session = await service.finishSocialLogin({
    provider: "linkedin",
    providerAccountId: `linkedin-${randomUUID()}`,
    email,
    name: "Bia Souza",
    emailVerified: true,
  });

  const createdUser = await database.user.findUnique({
    where: { email },
    include: { authAccounts: true, profile: true },
  });

  assert.equal(typeof session.accessToken, "string");
  assert.equal(typeof session.refreshToken, "string");
  assert.equal(createdUser?.status, "active");
  assert.notEqual(createdUser?.emailVerifiedAt, null);
  assert.equal(createdUser?.authAccounts.length, 1);
  assert.equal(createdUser?.authAccounts[0]?.provider, "linkedin");
  assert.notEqual(createdUser?.profile, null);

  await deleteUserByEmail(database, email);
  await moduleRef.close();
});

test("social login remains idempotent when the same provider profile is completed twice", async () => {
  const moduleRef = await Test.createTestingModule({
    imports: [DatabaseModule, AuthModule],
  }).compile();

  const database = moduleRef.get(DatabaseService);
  const service = moduleRef.get(AuthService) as SocialAuthService;
  const email = `carol+${randomUUID()}@earlycv.dev`;
  const providerAccountId = `google-${randomUUID()}`;

  await deleteUserByEmail(database, email);

  const [firstSession, secondSession] = await Promise.all([
    service.finishSocialLogin({
      provider: "google",
      providerAccountId,
      email,
      name: "Carol Dias",
      emailVerified: true,
    }),
    service.finishSocialLogin({
      provider: "google",
      providerAccountId,
      email,
      name: "Carol Dias",
      emailVerified: true,
    }),
  ]);

  const users = await database.user.findMany({ where: { email } });
  const authAccounts = await database.authAccount.findMany({
    where: { provider: "google", providerAccountId },
  });

  assert.equal(typeof firstSession.accessToken, "string");
  assert.equal(typeof secondSession.accessToken, "string");
  assert.equal(users.length, 1);
  assert.equal(authAccounts.length, 1);

  await deleteUserByEmail(database, email);
  await moduleRef.close();
});

test("Google strategy enables OAuth state protection", async () => {
  const moduleRef = await Test.createTestingModule({
    imports: [AuthModule],
  }).compile();

  const strategy = moduleRef.get(GoogleStrategy) as GoogleStrategy & {
    _oauth2?: { _authorizeUrl?: string };
    _stateStore?: object;
  };

  assert.notEqual(strategy._stateStore, undefined);
  await moduleRef.close();
});

test("social auth controller callbacks delegate the OAuth user to AuthService", async () => {
  const calls: SocialProfileInput[] = [];
  const expectedSession: AuthSession = {
    accessToken: "access-token",
    refreshToken: "refresh-token",
    user: {
      id: "user-id",
      email: "social@earlycv.dev",
      name: "Social User",
      planType: "free",
      status: "active",
      emailVerifiedAt: new Date("2026-03-30T00:00:00.000Z"),
      lastLoginAt: null,
      createdAt: new Date("2026-03-30T00:00:00.000Z"),
      updatedAt: new Date("2026-03-30T00:00:00.000Z"),
    },
  };
  const authService = {
    finishSocialLogin: async (input: SocialProfileInput) => {
      calls.push(input);

      return expectedSession;
    },
  } as unknown as AuthService;
  const controller = new AuthController(authService) as SocialAuthController;
  const googleProfile: SocialProfileInput = {
    provider: "google",
    providerAccountId: "google-123",
    email: "social@earlycv.dev",
    name: "Social User",
    emailVerified: true,
  };
  const linkedinProfile: SocialProfileInput = {
    provider: "linkedin",
    providerAccountId: "linkedin-123",
    email: "social@earlycv.dev",
    name: "Social User",
    emailVerified: true,
  };

  controller.googleStart();
  controller.linkedinStart();

  const googleSession = await controller.googleCallback({
    oauthUser: googleProfile,
  });
  const linkedinSession = await controller.linkedinCallback({
    oauthUser: linkedinProfile,
  });

  assert.deepEqual(calls, [googleProfile, linkedinProfile]);
  assert.equal(googleSession, expectedSession);
  assert.equal(linkedinSession, expectedSession);
});
