import "reflect-metadata";

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";

import { Test } from "@nestjs/testing";

import { DatabaseModule } from "../database/database.module";
import { DatabaseService } from "../database/database.service";
import { PosthogIntegrationModule } from "../posthog-integration/posthog-integration.module";
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
  finishSocialLogin: (
    input: SocialProfileInput,
    conversionContext?: string,
    sessionInternalId?: string | null,
  ) => Promise<AuthSession>;
};

type FakeCookieResponse = { cookie: (...args: unknown[]) => unknown };

type SocialAuthController = AuthController & {
  googleStart: () => void;
  googleCallback: (
    request: {
      oauthUser: SocialProfileInput;
      cookies?: Record<string, string>;
      headers?: Record<string, string>;
    },
    response: FakeCookieResponse,
  ) => Promise<{ url: string }>;
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
    imports: [DatabaseModule, PosthogIntegrationModule, AuthModule],
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

  const sessionInternalId = `journey-${Date.now()}`;
  const session = await service.finishSocialLogin(
    {
      provider: "google",
      providerAccountId: `google-${randomUUID()}`,
      email,
      name: "Ana Silva",
      emailVerified: true,
    },
    undefined,
    sessionInternalId,
  );

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

  const signupEvents = await database.businessFunnelEvent.findMany({
    where: { eventName: "signup_completed", userId: user.id },
  });
  assert.equal(
    signupEvents.length,
    0,
    "social login into a pre-existing account must not emit signup_completed",
  );

  const loginEvents = await database.businessFunnelEvent.findMany({
    where: { eventName: "login_completed", userId: user.id },
  });
  assert.equal(
    loginEvents.length,
    1,
    "social login into a pre-existing account must emit login_completed exactly once",
  );
  const loginMetadata = loginEvents[0]?.metadataJson as Record<string, unknown>;
  assert.equal(loginMetadata?.login_method, "google");
  assert.equal(
    loginMetadata?.sessionInternalId,
    sessionInternalId,
    "Google login of an existing account must preserve the journey sessionInternalId that started the flow",
  );

  await deleteUserByEmail(database, email);
  await moduleRef.close();
});

test("social login creates a new user for a verified LinkedIn profile when no account exists", async () => {
  const moduleRef = await Test.createTestingModule({
    imports: [DatabaseModule, PosthogIntegrationModule, AuthModule],
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

  const signupEvents = await database.businessFunnelEvent.findMany({
    where: { eventName: "signup_completed", userId: createdUser?.id },
  });
  assert.equal(signupEvents.length, 1);
  const metadata = signupEvents[0]?.metadataJson as Record<string, unknown>;
  assert.equal(metadata?.signup_method, "linkedin");
  assert.equal(metadata?.is_guest_conversion, false);
  // conversionContext não foi passado pro callback -> "unknown", nunca
  // inferido a partir de heurística.
  assert.equal(metadata?.conversion_context, "unknown");

  const loginEvents = await database.businessFunnelEvent.findMany({
    where: { eventName: "login_completed", userId: createdUser?.id },
  });
  assert.equal(
    loginEvents.length,
    0,
    "creating a brand-new account via social login must not also emit login_completed",
  );

  await deleteUserByEmail(database, email);
  await moduleRef.close();
});

test("social login (OAuth) propagates an explicit conversion_context for a new account originating from a guest analysis", async () => {
  const moduleRef = await Test.createTestingModule({
    imports: [DatabaseModule, PosthogIntegrationModule, AuthModule],
  }).compile();

  const database = moduleRef.get(DatabaseService);
  const service = moduleRef.get(AuthService) as SocialAuthService;
  const email = `guestoauth+${randomUUID()}@earlycv.dev`;

  await deleteUserByEmail(database, email);

  const sessionInternalId = randomUUID();
  const session = await service.finishSocialLogin(
    {
      provider: "google",
      providerAccountId: `google-${randomUUID()}`,
      email,
      name: "Diana Reis",
      emailVerified: true,
    },
    "analysis_guest",
    sessionInternalId,
  );

  assert.equal(typeof session.accessToken, "string");

  const signupEvents = await database.businessFunnelEvent.findMany({
    where: { eventName: "signup_completed", userId: session.user.id },
  });
  assert.equal(signupEvents.length, 1);
  const metadata = signupEvents[0]?.metadataJson as Record<string, unknown>;
  assert.equal(metadata?.conversion_context, "analysis_guest");
  assert.equal(metadata?.is_guest_conversion, true);
  assert.equal(metadata?.signup_method, "google");
  assert.equal(
    metadata?.sessionInternalId,
    sessionInternalId,
    "Google signup originating from a guest analysis must preserve the journey sessionInternalId",
  );

  await deleteUserByEmail(database, email);
  await moduleRef.close();
});

test("social login (OAuth) propagates conversion_context and sessionInternalId for a new account originating from Radar", async () => {
  const moduleRef = await Test.createTestingModule({
    imports: [DatabaseModule, PosthogIntegrationModule, AuthModule],
  }).compile();

  const database = moduleRef.get(DatabaseService);
  const service = moduleRef.get(AuthService) as SocialAuthService;
  const email = `radaroauth+${randomUUID()}@earlycv.dev`;

  await deleteUserByEmail(database, email);

  const sessionInternalId = randomUUID();
  const session = await service.finishSocialLogin(
    {
      provider: "google",
      providerAccountId: `google-${randomUUID()}`,
      email,
      name: "Fabio Nogueira",
      emailVerified: true,
    },
    "radar",
    sessionInternalId,
  );

  const signupEvents = await database.businessFunnelEvent.findMany({
    where: { eventName: "signup_completed", userId: session.user.id },
  });
  assert.equal(signupEvents.length, 1);
  const metadata = signupEvents[0]?.metadataJson as Record<string, unknown>;
  assert.equal(metadata?.conversion_context, "radar");
  // Radar não é jornada guest conhecida -- is_guest_conversion só é true
  // pra analysis_guest.
  assert.equal(metadata?.is_guest_conversion, false);
  assert.equal(
    metadata?.sessionInternalId,
    sessionInternalId,
    "Google signup originating from Radar must preserve the journey sessionInternalId",
  );

  await deleteUserByEmail(database, email);
  await moduleRef.close();
});

test("social login remains idempotent when the same provider profile is completed twice", async () => {
  const moduleRef = await Test.createTestingModule({
    imports: [DatabaseModule, PosthogIntegrationModule, AuthModule],
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

  const signupEvents = await database.businessFunnelEvent.findMany({
    where: { eventName: "signup_completed", userId: users[0]?.id },
  });
  assert.equal(
    signupEvents.length,
    1,
    "concurrent duplicate social signups must record signup_completed only once",
  );

  await deleteUserByEmail(database, email);
  await moduleRef.close();
});

test("Google strategy enables OAuth state protection", async () => {
  const moduleRef = await Test.createTestingModule({
    imports: [PosthogIntegrationModule, AuthModule],
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
  // Nenhum destes callbacks manda `state` na query — o caminho de
  // resolução de OAuthAttempt (Fase 3) nunca é acionado aqui, então um
  // mock vazio é suficiente só para satisfazer o construtor.
  const oauthAttemptService = {
    resolveAndConsume: async () => {
      throw new Error("resolveAndConsume should not be called without state");
    },
  } as unknown as import("./oauth-attempt.service").OAuthAttemptService;
  const controller = new AuthController(
    authService,
    oauthAttemptService,
  ) as SocialAuthController;
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

  const fakeResponse: FakeCookieResponse = { cookie: () => undefined };

  const googleSession = await controller.googleCallback(
    { oauthUser: googleProfile, cookies: {}, headers: {} },
    fakeResponse,
  );
  const expectedBase = process.env.FRONTEND_URL ?? "http://localhost:3000";

  await controller.googleCallback(
    { oauthUser: linkedinProfile, cookies: {}, headers: {} },
    fakeResponse,
  );

  assert.deepEqual(calls, [googleProfile, linkedinProfile]);
  assert.deepEqual(googleSession, {
    url: `${expectedBase}/auth/social-callback?accessToken=${expectedSession.accessToken}&refreshToken=${expectedSession.refreshToken}`,
  });
});
