import assert from "node:assert/strict";
import { test } from "node:test";
import { sign } from "jsonwebtoken";

import { requestContextMiddleware } from "./request-context.middleware";

const UUID_V4_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

test("request context middleware assigns request and correlation ids", () => {
  const req = {
    app: { get: () => false },
    cookies: {},
    headers: {},
    socket: { remoteAddress: "127.0.0.1" },
  } as any;
  let called = false;

  requestContextMiddleware(req, {} as any, () => {
    called = true;
  });

  assert.equal(called, true);
  assert.equal(typeof req.analysisContext.requestId, "string");
  assert.equal(typeof req.analysisContext.correlationId, "string");
  assert.equal(req.analysisContext.ip, "127.0.0.1");
});

test("request context middleware does not trust forwarded ip without trusted proxy", () => {
  const req = {
    app: { get: () => false },
    cookies: {},
    headers: { "x-forwarded-for": "203.0.113.10" },
    socket: { remoteAddress: "127.0.0.1" },
  } as any;

  requestContextMiddleware(req, {} as any, () => {});

  assert.equal(req.analysisContext.ip, "127.0.0.1");
});

test("request context middleware accepts forwarded ip when trusted proxy is enabled", () => {
  const req = {
    app: { get: (key: string) => key === "trust proxy" },
    cookies: {},
    headers: { "x-forwarded-for": "203.0.113.10, 198.51.100.5" },
    socket: { remoteAddress: "127.0.0.1" },
  } as any;

  requestContextMiddleware(req, {} as any, () => {});

  assert.equal(req.analysisContext.ip, "203.0.113.10");
});

test("request context middleware does not trust forwarded ip when trust proxy is string false", () => {
  const req = {
    app: { get: (key: string) => (key === "trust proxy" ? "false" : false) },
    cookies: {},
    headers: { "x-forwarded-for": "203.0.113.10" },
    socket: { remoteAddress: "127.0.0.1" },
  } as any;

  requestContextMiddleware(req, {} as any, () => {});

  assert.equal(req.analysisContext.ip, "127.0.0.1");
});

test("request context middleware falls back to UUID correlation id when incoming id is invalid", () => {
  const req = {
    app: { get: () => false },
    cookies: {},
    headers: { "x-correlation-id": "\tbad\nvalue\t" },
    socket: { remoteAddress: "127.0.0.1" },
  } as any;

  requestContextMiddleware(req, {} as any, () => {});

  assert.match(req.analysisContext.correlationId, UUID_V4_REGEX);
  assert.notEqual(req.analysisContext.correlationId, "\tbad\nvalue\t");
});

test("request context middleware falls back to UUID correlation id when incoming id is oversized", () => {
  const oversizedCorrelationId = "a".repeat(257);
  const req = {
    app: { get: () => false },
    cookies: {},
    headers: { "x-correlation-id": oversizedCorrelationId },
    socket: { remoteAddress: "127.0.0.1" },
  } as any;

  requestContextMiddleware(req, {} as any, () => {});

  assert.match(req.analysisContext.correlationId, UUID_V4_REGEX);
  assert.notEqual(req.analysisContext.correlationId, oversizedCorrelationId);
});

test("request context middleware keeps public session token separate from internal id", () => {
  const req = {
    app: { get: () => false },
    cookies: { analysis_session_token: "public-session-token" },
    headers: {},
    socket: { remoteAddress: "127.0.0.1" },
  } as any;

  requestContextMiddleware(req, {} as any, () => {});

  assert.equal(req.analysisContext.sessionPublicToken, "public-session-token");
  assert.equal(req.analysisContext.sessionInternalId, null);
});

test("request context middleware reads public session token from cookie header when parser is unavailable", () => {
  const req = {
    app: { get: () => false },
    headers: {
      cookie:
        "other_cookie=value; analysis_session_token=public-session-token-from-header",
    },
    socket: { remoteAddress: "127.0.0.1" },
  } as any;

  requestContextMiddleware(req, {} as any, () => {});

  assert.equal(
    req.analysisContext.sessionPublicToken,
    "public-session-token-from-header",
  );
  assert.equal(req.analysisContext.sessionInternalId, null);
});

test("request context middleware stores route path and user-agent hash", () => {
  const req = {
    app: { get: () => false },
    cookies: {},
    headers: {
      "user-agent": "Mozilla/5.0 (X11; Linux x86_64)",
    },
    originalUrl: "/api/cv-adaptation/analyze-guest?foo=bar",
    socket: { remoteAddress: "127.0.0.1" },
  } as any;

  requestContextMiddleware(req, {} as any, () => {});

  assert.equal(
    req.analysisContext.routePath,
    "/api/cv-adaptation/analyze-guest",
  );
  assert.equal(typeof req.analysisContext.userAgentHash, "string");
  assert.equal(req.analysisContext.userAgentHash.length > 0, true);
});

test("request context middleware resolves userId from bearer token", () => {
  process.env.JWT_ACCESS_SECRET = "test-access-secret";
  const token = sign(
    {
      sub: "user-123",
      type: "access",
    },
    process.env.JWT_ACCESS_SECRET,
  );

  const req = {
    app: { get: () => false },
    cookies: {},
    headers: {
      authorization: `Bearer ${token}`,
    },
    socket: { remoteAddress: "127.0.0.1" },
  } as any;

  requestContextMiddleware(req, {} as any, () => {});

  assert.equal(req.analysisContext.userId, "user-123");
});

test("request context middleware resolves userId from access token cookie", () => {
  process.env.JWT_ACCESS_SECRET = "test-access-secret";
  const token = sign(
    {
      sub: "user-cookie-123",
      type: "access",
    },
    process.env.JWT_ACCESS_SECRET,
  );

  const req = {
    app: { get: () => false },
    headers: {
      cookie: `earlycv-access-token=${token}`,
    },
    socket: { remoteAddress: "127.0.0.1" },
  } as any;

  requestContextMiddleware(req, {} as any, () => {});

  assert.equal(req.analysisContext.userId, "user-cookie-123");
});

test("request context middleware keeps userId null for invalid token", () => {
  process.env.JWT_ACCESS_SECRET = "test-access-secret";
  const token = sign(
    {
      sub: "user-123",
      type: "access",
    },
    "another-secret",
  );

  const req = {
    app: { get: () => false },
    cookies: {},
    headers: {
      authorization: `Bearer ${token}`,
    },
    socket: { remoteAddress: "127.0.0.1" },
  } as any;

  requestContextMiddleware(req, {} as any, () => {});

  assert.equal(req.analysisContext.userId, null);
});
