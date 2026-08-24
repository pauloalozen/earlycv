import assert from "node:assert/strict";
import { test } from "node:test";

import { AuthController } from "./auth.controller";
import type { AuthService, AuthSession } from "./auth.service";
import type { OAuthAttemptService } from "./oauth-attempt.service";

// Fase 3: o callback do Google resolve/consome o state (se presente) e, só
// então, repassa analysisJobId adiante via query do redirect — nunca
// condiciona o login em si, nunca reprocessa nada (isso é Fase 4). Ver
// specs/no-guest-analysis-preview-auth-gate-diagnostic-plan-ADENDO-hardening.md
// seção 4.1.

const expectedSession: AuthSession = {
  accessToken: "access-token",
  refreshToken: "refresh-token",
  user: {
    id: "user-id",
    email: "guest-convert@earlycv.dev",
    name: "Guest Convertido",
    planType: "free",
    status: "active",
    emailVerifiedAt: new Date("2026-03-30T00:00:00.000Z"),
    lastLoginAt: null,
    createdAt: new Date("2026-03-30T00:00:00.000Z"),
    updatedAt: new Date("2026-03-30T00:00:00.000Z"),
  },
};

const makeAuthService = () =>
  ({
    finishSocialLogin: async () => expectedSession,
  }) as unknown as AuthService;

const fakeResponse = { cookie: () => undefined };
const expectedBase = process.env.FRONTEND_URL ?? "http://localhost:3000";

test("googleCallback resolves a valid state, transfers AnalysisJob ownership to the just-authenticated user, and appends analysisJobId to the redirect — login proceeds regardless", async () => {
  let receivedState: string | undefined;
  let receivedOwnershipTransfer: {
    analysisJobId: string;
    userId: string;
  } | null = null;
  const oauthAttemptService = {
    resolveAndConsume: async (state: string) => {
      receivedState = state;
      return {
        analysisJobId: "job-resolved-1",
        conversionContext: "analysis_guest",
        journeySessionInternalId: "sid-1",
        visitorId: "vid-1",
      };
    },
    transferAnalysisJobOwnership: async (
      analysisJobId: string,
      userId: string,
    ) => {
      receivedOwnershipTransfer = { analysisJobId, userId };
    },
  } as unknown as OAuthAttemptService;

  const controller = new AuthController(makeAuthService(), oauthAttemptService);

  const result = await controller.googleCallback(
    {
      oauthUser: {
        provider: "google",
        providerAccountId: "google-1",
        email: "guest-convert@earlycv.dev",
        name: "Guest Convertido",
        emailVerified: true,
      },
      cookies: {},
      headers: {},
      query: { state: "valid-state" },
    } as never,
    fakeResponse as never,
  );

  assert.equal(receivedState, "valid-state");
  assert.deepEqual(receivedOwnershipTransfer, {
    analysisJobId: "job-resolved-1",
    userId: expectedSession.user.id,
  });
  assert.equal(
    result.url,
    `${expectedBase}/auth/social-callback?accessToken=${expectedSession.accessToken}&refreshToken=${expectedSession.refreshToken}&analysisJobId=job-resolved-1`,
  );
});

test("googleCallback with no state query param never calls resolveAndConsume and never appends analysisJobId", async () => {
  let called = false;
  const oauthAttemptService = {
    resolveAndConsume: async () => {
      called = true;
      return null;
    },
  } as unknown as OAuthAttemptService;

  const controller = new AuthController(makeAuthService(), oauthAttemptService);

  const result = await controller.googleCallback(
    {
      oauthUser: {
        provider: "google",
        providerAccountId: "google-2",
        email: "direct-auth@earlycv.dev",
        name: "Direct Auth",
        emailVerified: true,
      },
      cookies: {},
      headers: {},
      query: {},
    } as never,
    fakeResponse as never,
  );

  assert.equal(called, false);
  assert.equal(
    result.url,
    `${expectedBase}/auth/social-callback?accessToken=${expectedSession.accessToken}&refreshToken=${expectedSession.refreshToken}`,
  );
});

test("googleCallback with an expired/consumed/nonexistent state (resolveAndConsume returns null) still completes login without analysisJobId — never breaks auth", async () => {
  const oauthAttemptService = {
    resolveAndConsume: async () => null,
  } as unknown as OAuthAttemptService;

  const controller = new AuthController(makeAuthService(), oauthAttemptService);

  const result = await controller.googleCallback(
    {
      oauthUser: {
        provider: "google",
        providerAccountId: "google-3",
        email: "replay-or-expired@earlycv.dev",
        name: "Replay Or Expired",
        emailVerified: true,
      },
      cookies: {},
      headers: {},
      query: { state: "expired-or-consumed-state" },
    } as never,
    fakeResponse as never,
  );

  assert.equal(
    result.url,
    `${expectedBase}/auth/social-callback?accessToken=${expectedSession.accessToken}&refreshToken=${expectedSession.refreshToken}`,
  );
});

test("createOAuthAttempt delegates to OAuthAttemptService.create", async () => {
  let receivedInput: unknown;
  const oauthAttemptService = {
    create: async (input: unknown) => {
      receivedInput = input;
      return { state: "generated-state" };
    },
  } as unknown as OAuthAttemptService;

  const controller = new AuthController(makeAuthService(), oauthAttemptService);

  const result = await controller.createOAuthAttempt({
    jobId: "job-1",
    guestPossessionToken: "raw-token",
    conversionContext: "analysis_guest",
  } as never);

  assert.deepEqual(result, { state: "generated-state" });
  assert.deepEqual(receivedInput, {
    jobId: "job-1",
    guestPossessionToken: "raw-token",
    conversionContext: "analysis_guest",
  });
});
