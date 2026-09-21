import assert from "node:assert/strict";
import { test } from "node:test";

import { AuthController } from "./auth.controller";
import type { AuthService, AuthSession } from "./auth.service";
import type { OAuthAttemptService } from "./oauth-attempt.service";

// signup_completed/login_completed chegavam 100% classificados como
// $virt_traffic_type=Automation no PostHog porque nada lia o contexto de
// rede real do browser nessas rotas (register/login/google-callback são
// chamadas DIRETO pelo browser na API Nest, sem hop pela rota Next). Estes
// testes garantem que o controller resolve esse contexto do request real
// (header user-agent + analysisContext.ip já calculado pelo
// requestContextMiddleware) e nunca de algo controlável pelo cliente no
// corpo da requisição.

const expectedSession: AuthSession = {
  accessToken: "access-token",
  refreshToken: "refresh-token",
  user: {
    id: "user-id",
    email: "visitor-ctx@earlycv.dev",
    name: "Contexto de Visitante",
    planType: "free",
    status: "active",
    emailVerifiedAt: null,
    lastLoginAt: null,
    createdAt: new Date("2026-09-21T00:00:00.000Z"),
    updatedAt: new Date("2026-09-21T00:00:00.000Z"),
  },
};

const oauthAttemptService = {
  resolveAndConsume: async () => null,
} as unknown as OAuthAttemptService;

test("register reads visitor UA/IP from the real request and forwards them to AuthService.register", async () => {
  let received: unknown;
  const authService = {
    register: async (_dto: unknown, visitorContext: unknown) => {
      received = visitorContext;
      return expectedSession;
    },
  } as unknown as AuthService;

  const controller = new AuthController(authService, oauthAttemptService);

  await controller.register(
    {
      email: "x@earlycv.dev",
      password: "Super-secret-123",
      name: "X",
    } as never,
    {
      headers: { "user-agent": "Mozilla/5.0 (real-browser)" },
      analysisContext: { ip: "203.0.113.10" },
    } as never,
  );

  assert.deepEqual(received, {
    posthogVisitorIp: "203.0.113.10",
    posthogVisitorUserAgent: "Mozilla/5.0 (real-browser)",
  });
});

test("register omits UA/IP (never fabricates) when the request carries neither", async () => {
  let received: unknown;
  const authService = {
    register: async (_dto: unknown, visitorContext: unknown) => {
      received = visitorContext;
      return expectedSession;
    },
  } as unknown as AuthService;

  const controller = new AuthController(authService, oauthAttemptService);

  await controller.register(
    {
      email: "x@earlycv.dev",
      password: "Super-secret-123",
      name: "X",
    } as never,
    { headers: {}, analysisContext: { ip: null } } as never,
  );

  assert.deepEqual(received, {
    posthogVisitorIp: null,
    posthogVisitorUserAgent: null,
  });
});

test("login reads visitor UA/IP from the real request and forwards them to AuthService.login, never from the DTO body", async () => {
  let received: unknown;
  const authService = {
    login: async (
      _user: unknown,
      _sessionInternalId: unknown,
      _visitorId: unknown,
      visitorContext: unknown,
    ) => {
      received = visitorContext;
      return expectedSession;
    },
  } as unknown as AuthService;

  const controller = new AuthController(authService, oauthAttemptService);

  // Um DTO malicioso não tem (e nunca deve ter) campos posthogVisitorIp/
  // posthogVisitorUserAgent — o ValidationPipe (forbidNonWhitelisted) já
  // rejeitaria isso antes de chegar aqui. O ponto deste teste é que o
  // controller nem olha pro DTO pra montar esse contexto.
  await controller.login(
    { email: "x@earlycv.dev", password: "whatever" } as never,
    {
      user: { id: "user-id" },
      headers: { "user-agent": "Mozilla/5.0 (real-browser-login)" },
      analysisContext: { ip: "198.51.100.20" },
    } as never,
  );

  assert.deepEqual(received, {
    posthogVisitorIp: "198.51.100.20",
    posthogVisitorUserAgent: "Mozilla/5.0 (real-browser-login)",
  });
});

test("googleCallback forwards visitor UA/IP resolved from the callback request into finishSocialLogin", async () => {
  let received: unknown;
  const authService = {
    finishSocialLogin: async (
      _profile: unknown,
      _conversionContext: unknown,
      _sessionInternalId: unknown,
      _visitorId: unknown,
      visitorContext: unknown,
    ) => {
      received = visitorContext;
      return expectedSession;
    },
  } as unknown as AuthService;

  const controller = new AuthController(authService, oauthAttemptService);
  const fakeResponse = { cookie: () => undefined };

  await controller.googleCallback(
    {
      oauthUser: {
        provider: "google",
        providerAccountId: "google-1",
        email: "visitor-ctx@earlycv.dev",
        name: "Contexto de Visitante",
        emailVerified: true,
      },
      cookies: {},
      headers: { "user-agent": "Mozilla/5.0 (real-browser-oauth)" },
      analysisContext: { ip: "203.0.113.99" },
      query: {},
    } as never,
    fakeResponse as never,
  );

  assert.deepEqual(received, {
    posthogVisitorIp: "203.0.113.99",
    posthogVisitorUserAgent: "Mozilla/5.0 (real-browser-oauth)",
  });
});
