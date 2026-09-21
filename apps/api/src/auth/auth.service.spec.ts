import "reflect-metadata";

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";

import { JwtService } from "@nestjs/jwt";
import { Test } from "@nestjs/testing";

import { DatabaseModule } from "../database/database.module";
import { DatabaseService } from "../database/database.service";
import { FakeEmailDeliveryService } from "../email/fake-email-delivery.service";
import { PosthogEventExporter } from "../posthog-integration/posthog-event-exporter.service";
import { PosthogIntegrationModule } from "../posthog-integration/posthog-integration.module";

type CapturedPosthogExport = {
  eventName: string;
  properties: Record<string, unknown>;
};

function createFakePosthogExporter() {
  const captured: CapturedPosthogExport[] = [];
  const exporter = {
    shouldExportBusinessFunnelEvent: () => true,
    shouldExportProtectionEvent: () => true,
    exportBusinessFunnelEvent: (
      eventName: string,
      properties: Record<string, unknown>,
    ) => {
      captured.push({ eventName, properties });
    },
    exportProtectionEvent: () => {},
  } as unknown as PosthogEventExporter;

  return { captured, exporter };
}

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
    imports: [DatabaseModule, PosthogIntegrationModule, AuthModule],
  }).compile();

  const database = moduleRef.get(DatabaseService);
  const service = moduleRef.get(AuthService);
  const jwtService = moduleRef.get(JwtService);
  const fakeEmailDelivery = moduleRef.get(FakeEmailDeliveryService);
  const email = `ana+${randomUUID()}@earlycv.dev`;

  await deleteUserByEmail(database, email);

  const result = await service.register({
    email,
    password: "Super-secret-123",
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
  assert.match(sentMessages[0]?.subject ?? "", /c[oó]digo/i);

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

  const signupEvents = await database.businessFunnelEvent.findMany({
    where: { eventName: "signup_completed", userId: storedUser?.id },
  });
  assert.equal(signupEvents.length, 1);
  const metadata = signupEvents[0]?.metadataJson as Record<string, unknown>;
  assert.equal(metadata?.signup_method, "password");
  // conversionContext ausente no payload -> backend nunca infere, cai em
  // "unknown" (não "direct_auth" -- esse é o valor que o frontend envia
  // explicitamente para a entrada direta em /entrar, ver teste dedicado
  // "conversion_context explícito" abaixo).
  assert.equal(metadata?.conversion_context, "unknown");
  assert.equal(metadata?.is_guest_conversion, false);

  await deleteUserByEmail(database, email);
  await moduleRef.close();
});

test("AuthService.register classifies conversion_context explicitly per case (analysis_guest, direct_auth, checkout, radar) and never as free-form/invented values", async () => {
  const authModuleExports = await importAuthModule();
  const authServiceExports = await importAuthService();

  const { AuthModule } = authModuleExports as { AuthModule: never };
  const { AuthService } = authServiceExports as { AuthService: never };

  const moduleRef = await Test.createTestingModule({
    imports: [DatabaseModule, PosthogIntegrationModule, AuthModule],
  }).compile();

  const database = moduleRef.get(DatabaseService);
  const service = moduleRef.get(AuthService);

  const cases: Array<{
    conversionContext: "analysis_guest" | "direct_auth" | "checkout" | "radar";
    expectedIsGuestConversion: boolean;
  }> = [
    { conversionContext: "analysis_guest", expectedIsGuestConversion: true },
    { conversionContext: "direct_auth", expectedIsGuestConversion: false },
    { conversionContext: "checkout", expectedIsGuestConversion: false },
    { conversionContext: "radar", expectedIsGuestConversion: false },
  ];

  for (const testCase of cases) {
    const email = `ctx-${testCase.conversionContext}-${randomUUID()}@earlycv.dev`;
    await deleteUserByEmail(database, email);

    const result = await service.register({
      email,
      password: "Super-secret-123",
      name: "Contexto Teste",
      conversionContext: testCase.conversionContext,
    });

    const signupEvents = await database.businessFunnelEvent.findMany({
      where: { eventName: "signup_completed", userId: result.user.id },
    });
    assert.equal(signupEvents.length, 1);
    const metadata = signupEvents[0]?.metadataJson as Record<string, unknown>;
    assert.equal(metadata?.conversion_context, testCase.conversionContext);
    assert.equal(
      metadata?.is_guest_conversion,
      testCase.expectedIsGuestConversion,
    );

    await deleteUserByEmail(database, email);
  }

  await moduleRef.close();
});

test("AuthService.register falls back to unknown conversion_context when the client sends a value outside the closed set", async () => {
  const authModuleExports = await importAuthModule();
  const authServiceExports = await importAuthService();

  const { AuthModule } = authModuleExports as { AuthModule: never };
  const { AuthService } = authServiceExports as { AuthService: never };

  const moduleRef = await Test.createTestingModule({
    imports: [DatabaseModule, PosthogIntegrationModule, AuthModule],
  }).compile();

  const database = moduleRef.get(DatabaseService);
  const service = moduleRef.get(AuthService);
  const email = `ctx-invalid-${randomUUID()}@earlycv.dev`;

  await deleteUserByEmail(database, email);

  // O service em si nunca recebe um valor fora do enum fechado — a
  // ValidationPipe (IsIn) do controller já rejeitaria isso com 400 antes
  // de chegar aqui. Este teste garante que, mesmo se o campo simplesmente
  // não vier preenchido (chamada direta ao service, cliente antigo etc.),
  // o resultado é "unknown" e nunca uma heurística inventada.
  const result = await service.register({
    email,
    password: "Super-secret-123",
    name: "Sem Contexto",
  });

  const signupEvents = await database.businessFunnelEvent.findMany({
    where: { eventName: "signup_completed", userId: result.user.id },
  });
  assert.equal(signupEvents.length, 1);
  const metadata = signupEvents[0]?.metadataJson as Record<string, unknown>;
  assert.equal(metadata?.conversion_context, "unknown");
  assert.equal(metadata?.is_guest_conversion, false);

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
    imports: [DatabaseModule, PosthogIntegrationModule, AuthModule],
  }).compile();

  const database = moduleRef.get(DatabaseService);
  const service = moduleRef.get(AuthService);
  const email = `bia+${randomUUID()}@earlycv.dev`;

  await deleteUserByEmail(database, email);

  const registered = await service.register({
    email,
    password: "Super-secret-123",
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

  const user = await database.user.findUnique({ where: { email } });
  const signupEvents = await database.businessFunnelEvent.findMany({
    where: { eventName: "signup_completed", userId: user?.id },
  });
  assert.equal(
    signupEvents.length,
    1,
    "refresh (session restore) and logout must not emit additional signup_completed events",
  );

  const loginEventsFromRefresh = await database.businessFunnelEvent.findMany({
    where: { eventName: "login_completed", userId: user?.id },
  });
  assert.equal(
    loginEventsFromRefresh.length,
    0,
    "refresh (session restore) and logout must never emit login_completed — that event is exclusive to explicit authentication",
  );

  await deleteUserByEmail(database, email);
  await moduleRef.close();
});

test("AuthService.login emits login_completed exactly once for explicit password authentication into an existing account, never signup_completed", async () => {
  const authModuleExports = await importAuthModule();
  const authServiceExports = await importAuthService();

  const { AuthModule } = authModuleExports as { AuthModule: never };
  const { AuthService } = authServiceExports as { AuthService: never };

  const moduleRef = await Test.createTestingModule({
    imports: [DatabaseModule, PosthogIntegrationModule, AuthModule],
  }).compile();

  const database = moduleRef.get(DatabaseService);
  const service = moduleRef.get(AuthService);
  const email = `login-${randomUUID()}@earlycv.dev`;

  await deleteUserByEmail(database, email);

  const registered = await service.register({
    email,
    password: "Super-secret-123",
    name: "Login Teste",
  });

  const sessionInternalId = `journey-${randomUUID()}`;
  const session = await service.login(
    { id: registered.user.id },
    sessionInternalId,
  );

  assert.equal(typeof session.accessToken, "string");

  const loginEvents = await database.businessFunnelEvent.findMany({
    where: { eventName: "login_completed", userId: registered.user.id },
  });
  assert.equal(loginEvents.length, 1);
  const metadata = loginEvents[0]?.metadataJson as Record<string, unknown>;
  assert.equal(metadata?.login_method, "password");
  assert.equal(metadata?.sessionInternalId, sessionInternalId);

  const signupEvents = await database.businessFunnelEvent.findMany({
    where: { eventName: "signup_completed", userId: registered.user.id },
  });
  assert.equal(
    signupEvents.length,
    1,
    "explicit login on an existing account must not create a second signup_completed",
  );

  await deleteUserByEmail(database, email);
  await moduleRef.close();
});

// ─── visitor_id (Fase C) ───────────────────────────────────────────────────

test("AuthService.register preserves visitor_id on signup_completed — anonymous visitor becoming a new user", async () => {
  const authModuleExports = await importAuthModule();
  const authServiceExports = await importAuthService();

  const { AuthModule } = authModuleExports as { AuthModule: never };
  const { AuthService } = authServiceExports as { AuthService: never };

  const moduleRef = await Test.createTestingModule({
    imports: [DatabaseModule, PosthogIntegrationModule, AuthModule],
  }).compile();

  const database = moduleRef.get(DatabaseService);
  const service = moduleRef.get(AuthService);
  const email = `visitor-signup-${randomUUID()}@earlycv.dev`;
  const visitorId = randomUUID();

  await deleteUserByEmail(database, email);

  const result = await service.register({
    email,
    password: "Super-secret-123",
    name: "Visitante Novo",
    visitorId,
  });

  const signupEvents = await database.businessFunnelEvent.findMany({
    where: { eventName: "signup_completed", userId: result.user.id },
  });
  assert.equal(signupEvents.length, 1);
  const metadata = signupEvents[0]?.metadataJson as Record<string, unknown>;
  assert.equal(metadata?.visitor_id, visitorId);

  await deleteUserByEmail(database, email);
  await moduleRef.close();
});

test("AuthService.register omits visitor_id from signup_completed metadata when the journey didn't carry one — never invented", async () => {
  const authModuleExports = await importAuthModule();
  const authServiceExports = await importAuthService();

  const { AuthModule } = authModuleExports as { AuthModule: never };
  const { AuthService } = authServiceExports as { AuthService: never };

  const moduleRef = await Test.createTestingModule({
    imports: [DatabaseModule, PosthogIntegrationModule, AuthModule],
  }).compile();

  const database = moduleRef.get(DatabaseService);
  const service = moduleRef.get(AuthService);
  const email = `visitor-signup-none-${randomUUID()}@earlycv.dev`;

  await deleteUserByEmail(database, email);

  const result = await service.register({
    email,
    password: "Super-secret-123",
    name: "Sem Visitor",
  });

  const signupEvents = await database.businessFunnelEvent.findMany({
    where: { eventName: "signup_completed", userId: result.user.id },
  });
  const metadata = signupEvents[0]?.metadataJson as Record<string, unknown>;
  assert.equal("visitor_id" in metadata, false);

  await deleteUserByEmail(database, email);
  await moduleRef.close();
});

test("AuthService.login preserves visitor_id on login_completed — recurring visitor logging into an existing account", async () => {
  const authModuleExports = await importAuthModule();
  const authServiceExports = await importAuthService();

  const { AuthModule } = authModuleExports as { AuthModule: never };
  const { AuthService } = authServiceExports as { AuthService: never };

  const moduleRef = await Test.createTestingModule({
    imports: [DatabaseModule, PosthogIntegrationModule, AuthModule],
  }).compile();

  const database = moduleRef.get(DatabaseService);
  const service = moduleRef.get(AuthService);
  const email = `visitor-login-${randomUUID()}@earlycv.dev`;

  await deleteUserByEmail(database, email);

  const registered = await service.register({
    email,
    password: "Super-secret-123",
    name: "Visitante Recorrente",
  });

  const visitorId = randomUUID();
  await service.login({ id: registered.user.id }, undefined, visitorId);

  const loginEvents = await database.businessFunnelEvent.findMany({
    where: { eventName: "login_completed", userId: registered.user.id },
  });
  assert.equal(loginEvents.length, 1);
  const metadata = loginEvents[0]?.metadataJson as Record<string, unknown>;
  assert.equal(metadata?.visitor_id, visitorId);

  await deleteUserByEmail(database, email);
  await moduleRef.close();
});

test("visitor_id from one signup never leaks into another user's signup_completed event", async () => {
  const authModuleExports = await importAuthModule();
  const authServiceExports = await importAuthService();

  const { AuthModule } = authModuleExports as { AuthModule: never };
  const { AuthService } = authServiceExports as { AuthService: never };

  const moduleRef = await Test.createTestingModule({
    imports: [DatabaseModule, PosthogIntegrationModule, AuthModule],
  }).compile();

  const database = moduleRef.get(DatabaseService);
  const service = moduleRef.get(AuthService);
  const emailA = `visitor-a-${randomUUID()}@earlycv.dev`;
  const emailB = `visitor-b-${randomUUID()}@earlycv.dev`;
  const visitorA = randomUUID();
  const visitorB = randomUUID();

  await deleteUserByEmail(database, emailA);
  await deleteUserByEmail(database, emailB);

  const resultA = await service.register({
    email: emailA,
    password: "Super-secret-123",
    name: "Visitante A",
    visitorId: visitorA,
  });
  const resultB = await service.register({
    email: emailB,
    password: "Super-secret-123",
    name: "Visitante B",
    visitorId: visitorB,
  });

  const eventsA = await database.businessFunnelEvent.findMany({
    where: { eventName: "signup_completed", userId: resultA.user.id },
  });
  const eventsB = await database.businessFunnelEvent.findMany({
    where: { eventName: "signup_completed", userId: resultB.user.id },
  });

  const metadataA = eventsA[0]?.metadataJson as Record<string, unknown>;
  const metadataB = eventsB[0]?.metadataJson as Record<string, unknown>;
  assert.equal(metadataA?.visitor_id, visitorA);
  assert.equal(metadataB?.visitor_id, visitorB);
  assert.notEqual(metadataA?.visitor_id, metadataB?.visitor_id);

  await deleteUserByEmail(database, emailA);
  await deleteUserByEmail(database, emailB);
  await moduleRef.close();
});

// ─── $raw_user_agent / $ip propagation on signup_completed/login_completed ─
// Auditoria PostHog (semana 14-20/09): signup_completed e login_completed
// chegavam 100% classificados como $virt_traffic_type=Automation, porque
// AuthService montava o AnalysisRequestContext do zero (sem os campos
// posthogVisitorIp/posthogVisitorUserAgent), diferente do resto dos eventos
// v2 (fix #53). Mesmo princípio aqui: nunca fabricar, nunca aceitar valor
// vindo de DTO/metadata controlável pelo cliente — só o contexto que o
// AuthController resolveu do request real (ver resolveAuthVisitorContext).

test("AuthService.register propagates visitor UA/IP to signup_completed when the controller supplies them", async () => {
  const authModuleExports = await importAuthModule();
  const authServiceExports = await importAuthService();

  const { AuthModule } = authModuleExports as { AuthModule: never };
  const { AuthService } = authServiceExports as { AuthService: never };

  const { captured, exporter } = createFakePosthogExporter();
  const moduleRef = await Test.createTestingModule({
    imports: [DatabaseModule, PosthogIntegrationModule, AuthModule],
  })
    .overrideProvider(PosthogEventExporter)
    .useValue(exporter)
    .compile();

  const database = moduleRef.get(DatabaseService);
  const service = moduleRef.get(AuthService);
  const email = `visitor-ctx-signup-${randomUUID()}@earlycv.dev`;

  await deleteUserByEmail(database, email);

  await service.register(
    { email, password: "Super-secret-123", name: "Rede Original" },
    {
      posthogVisitorIp: "203.0.113.10",
      posthogVisitorUserAgent: "Mozilla/5.0 (compatible; realbrowser)",
    },
  );

  const signupExport = captured.find((c) => c.eventName === "signup_completed");
  assert.notEqual(signupExport, undefined);
  assert.equal(
    signupExport?.properties.$raw_user_agent,
    "Mozilla/5.0 (compatible; realbrowser)",
  );
  assert.equal(signupExport?.properties.$ip, "203.0.113.10");

  await deleteUserByEmail(database, email);
  await moduleRef.close();
});

test("AuthService.login propagates visitor UA/IP to login_completed when the controller supplies them", async () => {
  const authModuleExports = await importAuthModule();
  const authServiceExports = await importAuthService();

  const { AuthModule } = authModuleExports as { AuthModule: never };
  const { AuthService } = authServiceExports as { AuthService: never };

  const { captured, exporter } = createFakePosthogExporter();
  const moduleRef = await Test.createTestingModule({
    imports: [DatabaseModule, PosthogIntegrationModule, AuthModule],
  })
    .overrideProvider(PosthogEventExporter)
    .useValue(exporter)
    .compile();

  const database = moduleRef.get(DatabaseService);
  const service = moduleRef.get(AuthService);
  const email = `visitor-ctx-login-${randomUUID()}@earlycv.dev`;

  await deleteUserByEmail(database, email);

  const registered = await service.register({
    email,
    password: "Super-secret-123",
    name: "Rede Original Login",
  });
  captured.length = 0;

  await service.login({ id: registered.user.id }, undefined, undefined, {
    posthogVisitorIp: "198.51.100.20",
    posthogVisitorUserAgent: "Mozilla/5.0 (compatible; realbrowser-login)",
  });

  const loginExport = captured.find((c) => c.eventName === "login_completed");
  assert.notEqual(loginExport, undefined);
  assert.equal(
    loginExport?.properties.$raw_user_agent,
    "Mozilla/5.0 (compatible; realbrowser-login)",
  );
  assert.equal(loginExport?.properties.$ip, "198.51.100.20");

  await deleteUserByEmail(database, email);
  await moduleRef.close();
});

test("AuthService never fabricates $raw_user_agent/$ip on signup_completed/login_completed when the visitor context is unavailable", async () => {
  const authModuleExports = await importAuthModule();
  const authServiceExports = await importAuthService();

  const { AuthModule } = authModuleExports as { AuthModule: never };
  const { AuthService } = authServiceExports as { AuthService: never };

  const { captured, exporter } = createFakePosthogExporter();
  const moduleRef = await Test.createTestingModule({
    imports: [DatabaseModule, PosthogIntegrationModule, AuthModule],
  })
    .overrideProvider(PosthogEventExporter)
    .useValue(exporter)
    .compile();

  const database = moduleRef.get(DatabaseService);
  const service = moduleRef.get(AuthService);
  const email = `visitor-ctx-absent-${randomUUID()}@earlycv.dev`;

  await deleteUserByEmail(database, email);

  // Sem visitorContext (equivalente a um request sem contexto original) —
  // nunca cai pro user-agent/IP do próprio processo Nest.
  const registered = await service.register({
    email,
    password: "Super-secret-123",
    name: "Sem Contexto",
  });

  const signupExport = captured.find((c) => c.eventName === "signup_completed");
  assert.notEqual(signupExport, undefined);
  assert.equal("$raw_user_agent" in (signupExport?.properties ?? {}), false);
  assert.equal("$ip" in (signupExport?.properties ?? {}), false);

  captured.length = 0;
  await service.login({ id: registered.user.id });

  const loginExport = captured.find((c) => c.eventName === "login_completed");
  assert.notEqual(loginExport, undefined);
  assert.equal("$raw_user_agent" in (loginExport?.properties ?? {}), false);
  assert.equal("$ip" in (loginExport?.properties ?? {}), false);

  await deleteUserByEmail(database, email);
  await moduleRef.close();
});

test("AuthService.register ignores a spoofed posthogVisitorIp/posthogVisitorUserAgent smuggled into the DTO — only the trusted controller-resolved context is honored", async () => {
  const authModuleExports = await importAuthModule();
  const authServiceExports = await importAuthService();

  const { AuthModule } = authModuleExports as { AuthModule: never };
  const { AuthService } = authServiceExports as { AuthService: never };

  const { captured, exporter } = createFakePosthogExporter();
  const moduleRef = await Test.createTestingModule({
    imports: [DatabaseModule, PosthogIntegrationModule, AuthModule],
  })
    .overrideProvider(PosthogEventExporter)
    .useValue(exporter)
    .compile();

  const database = moduleRef.get(DatabaseService);
  const service = moduleRef.get(AuthService);
  const email = `visitor-ctx-spoof-${randomUUID()}@earlycv.dev`;

  await deleteUserByEmail(database, email);

  // Um DTO malicioso nunca teria esses campos (ValidationPipe com
  // forbidNonWhitelisted rejeitaria), mas mesmo se algo os injetasse no
  // objeto em runtime, o service só lê o segundo argumento
  // (visitorContext), nunca `input`.
  const spoofedDto = {
    email,
    password: "Super-secret-123",
    name: "Tentativa de Spoof",
    posthogVisitorIp: "1.2.3.4",
    posthogVisitorUserAgent: "spoofed-by-client",
  };

  await service.register(spoofedDto as never, {
    posthogVisitorIp: "203.0.113.55",
    posthogVisitorUserAgent: "Mozilla/5.0 (compatible; trusted)",
  });

  const signupExport = captured.find((c) => c.eventName === "signup_completed");
  assert.notEqual(signupExport, undefined);
  assert.equal(
    signupExport?.properties.$raw_user_agent,
    "Mozilla/5.0 (compatible; trusted)",
  );
  assert.equal(signupExport?.properties.$ip, "203.0.113.55");

  await deleteUserByEmail(database, email);
  await moduleRef.close();
});
