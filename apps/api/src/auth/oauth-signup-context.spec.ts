import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import type { Request, Response } from "express";
import {
  captureOAuthSignupContextMiddleware,
  OAUTH_JOURNEY_SESSION_COOKIE,
  OAUTH_SIGNUP_CONTEXT_COOKIE,
  OAUTH_VISITOR_ID_COOKIE,
  readAndClearOAuthJourneySessionId,
  readAndClearOAuthSignupContext,
  readAndClearOAuthVisitorId,
} from "./oauth-signup-context";

function fakeRequest(overrides: Partial<Request> = {}): Request {
  return {
    query: {},
    cookies: {},
    headers: {},
    ...overrides,
  } as unknown as Request;
}

function fakeResponse() {
  const cookies: Array<{ name: string; value: string; options: unknown }> = [];
  const response = {
    cookie: (name: string, value: string, options: unknown) => {
      cookies.push({ name, value, options });
    },
  } as unknown as Response;
  return { response, cookies };
}

test("captureOAuthSignupContextMiddleware sets a cookie only for a value in the closed set", async () => {
  const { response, cookies } = fakeResponse();
  let nextCalled = false;

  captureOAuthSignupContextMiddleware(
    fakeRequest({ query: { ctx: "analysis_guest" } }),
    response,
    () => {
      nextCalled = true;
    },
  );

  assert.equal(nextCalled, true);
  assert.equal(cookies.length, 1);
  assert.equal(cookies[0]?.name, OAUTH_SIGNUP_CONTEXT_COOKIE);
  assert.equal(cookies[0]?.value, "analysis_guest");
});

test("captureOAuthSignupContextMiddleware ignores a ctx value outside the closed set (never invents/infers)", async () => {
  const { response, cookies } = fakeResponse();
  let nextCalled = false;

  captureOAuthSignupContextMiddleware(
    fakeRequest({ query: { ctx: "some-made-up-value" } }),
    response,
    () => {
      nextCalled = true;
    },
  );

  assert.equal(nextCalled, true);
  assert.equal(cookies.length, 0);
});

test("captureOAuthSignupContextMiddleware is a no-op when ctx is absent", async () => {
  const { response, cookies } = fakeResponse();
  let nextCalled = false;

  captureOAuthSignupContextMiddleware(fakeRequest(), response, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
  assert.equal(cookies.length, 0);
});

test("readAndClearOAuthSignupContext returns the cookie value when valid and clears it", async () => {
  const { response, cookies } = fakeResponse();

  const value = readAndClearOAuthSignupContext(
    fakeRequest({ cookies: { [OAUTH_SIGNUP_CONTEXT_COOKIE]: "checkout" } }),
    response,
  );

  assert.equal(value, "checkout");
  assert.equal(cookies.length, 1);
  assert.equal(cookies[0]?.value, "");
});

test("readAndClearOAuthSignupContext falls back to unknown when the cookie is absent, tampered, or outside the closed set", async () => {
  const { response: r1 } = fakeResponse();
  assert.equal(readAndClearOAuthSignupContext(fakeRequest(), r1), "unknown");

  const { response: r2 } = fakeResponse();
  assert.equal(
    readAndClearOAuthSignupContext(
      fakeRequest({
        cookies: { [OAUTH_SIGNUP_CONTEXT_COOKIE]: "not-a-real-context" },
      }),
      r2,
    ),
    "unknown",
  );
});

// ─── sessionInternalId (Fase B.2) ─────────────────────────────────────────

test("captureOAuthSignupContextMiddleware sets a sid cookie for a valid UUID sessionInternalId", async () => {
  const { response, cookies } = fakeResponse();
  const sessionInternalId = randomUUID();

  captureOAuthSignupContextMiddleware(
    fakeRequest({ query: { sid: sessionInternalId } }),
    response,
    () => {},
  );

  assert.equal(cookies.length, 1);
  assert.equal(cookies[0]?.name, OAUTH_JOURNEY_SESSION_COOKIE);
  assert.equal(cookies[0]?.value, sessionInternalId);
});

test("captureOAuthSignupContextMiddleware sets a sid cookie for the journey-<timestamp> fallback format", async () => {
  const { response, cookies } = fakeResponse();
  const sessionInternalId = `journey-${Date.now()}`;

  captureOAuthSignupContextMiddleware(
    fakeRequest({ query: { sid: sessionInternalId } }),
    response,
    () => {},
  );

  assert.equal(cookies.length, 1);
  assert.equal(cookies[0]?.value, sessionInternalId);
});

test("captureOAuthSignupContextMiddleware discards a sid outside the strict format — never persisted, never inferred", async () => {
  const invalidValues = [
    "'; DROP TABLE users; --",
    "<script>alert(1)</script>",
    "not-a-uuid-or-journey-id",
    "journey-abc", // não são só dígitos
    "a".repeat(200), // maior que o limite
    "",
  ];

  for (const invalid of invalidValues) {
    const { response, cookies } = fakeResponse();

    captureOAuthSignupContextMiddleware(
      fakeRequest({ query: { sid: invalid } }),
      response,
      () => {},
    );

    assert.equal(
      cookies.length,
      0,
      `expected sid "${invalid}" to be discarded, but a cookie was set`,
    );
  }
});

test("captureOAuthSignupContextMiddleware captures both ctx and sid independently in the same pass", async () => {
  const { response, cookies } = fakeResponse();
  const sessionInternalId = randomUUID();

  captureOAuthSignupContextMiddleware(
    fakeRequest({ query: { ctx: "radar", sid: sessionInternalId } }),
    response,
    () => {},
  );

  assert.equal(cookies.length, 2);
  const byName = Object.fromEntries(cookies.map((c) => [c.name, c.value]));
  assert.equal(byName[OAUTH_SIGNUP_CONTEXT_COOKIE], "radar");
  assert.equal(byName[OAUTH_JOURNEY_SESSION_COOKIE], sessionInternalId);
});

test("readAndClearOAuthJourneySessionId returns the cookie value when valid and clears it", async () => {
  const { response, cookies } = fakeResponse();
  const sessionInternalId = randomUUID();

  const value = readAndClearOAuthJourneySessionId(
    fakeRequest({
      cookies: { [OAUTH_JOURNEY_SESSION_COOKIE]: sessionInternalId },
    }),
    response,
  );

  assert.equal(value, sessionInternalId);
  assert.equal(cookies.length, 1);
  assert.equal(cookies[0]?.name, OAUTH_JOURNEY_SESSION_COOKIE);
  assert.equal(cookies[0]?.value, "");
});

test("readAndClearOAuthJourneySessionId returns null (never invented) when the cookie is expired/absent", async () => {
  const { response, cookies } = fakeResponse();

  const value = readAndClearOAuthJourneySessionId(fakeRequest(), response);

  assert.equal(value, null);
  // Ainda limpa a cookie por segurança, mesmo sem valor pra ler.
  assert.equal(cookies.length, 1);
  assert.equal(cookies[0]?.value, "");
});

test("readAndClearOAuthJourneySessionId discards a tampered/invalid cookie value instead of trusting it", async () => {
  const { response } = fakeResponse();

  const value = readAndClearOAuthJourneySessionId(
    fakeRequest({
      cookies: { [OAUTH_JOURNEY_SESSION_COOKIE]: "<script>evil()</script>" },
    }),
    response,
  );

  assert.equal(value, null);
});

test("the journey context of one OAuth flow never leaks into another — each request only ever sees its own cookie", async () => {
  const sessionA = randomUUID();
  const sessionB = randomUUID();

  const { response: responseA } = fakeResponse();
  const valueA = readAndClearOAuthJourneySessionId(
    fakeRequest({ cookies: { [OAUTH_JOURNEY_SESSION_COOKIE]: sessionA } }),
    responseA,
  );

  const { response: responseB } = fakeResponse();
  const valueB = readAndClearOAuthJourneySessionId(
    fakeRequest({ cookies: { [OAUTH_JOURNEY_SESSION_COOKIE]: sessionB } }),
    responseB,
  );

  assert.equal(valueA, sessionA);
  assert.equal(valueB, sessionB);
  assert.notEqual(valueA, valueB);

  // Uma terceira "aba"/callback sem cookie (já consumida ou nunca setada)
  // nunca reaproveita o valor de outra jornada.
  const { response: responseC } = fakeResponse();
  const valueC = readAndClearOAuthJourneySessionId(fakeRequest(), responseC);
  assert.equal(valueC, null);
});

// ─── visitor_id (Fase C) ────────────────────────────────────────────────

test("captureOAuthSignupContextMiddleware sets a vid cookie for a valid UUID visitor_id", async () => {
  const { response, cookies } = fakeResponse();
  const visitorId = randomUUID();

  captureOAuthSignupContextMiddleware(
    fakeRequest({ query: { vid: visitorId } }),
    response,
    () => {},
  );

  assert.equal(cookies.length, 1);
  assert.equal(cookies[0]?.name, OAUTH_VISITOR_ID_COOKIE);
  assert.equal(cookies[0]?.value, visitorId);
});

test("captureOAuthSignupContextMiddleware discards a vid outside the strict UUID format — never persisted, never inferred", async () => {
  const invalidValues = [
    "'; DROP TABLE users; --",
    "<script>alert(1)</script>",
    "not-a-uuid",
    "journey-1717171717171", // formato de fallback do sessionInternalId, não aceito aqui
    "a".repeat(200),
    "",
  ];

  for (const invalid of invalidValues) {
    const { response, cookies } = fakeResponse();

    captureOAuthSignupContextMiddleware(
      fakeRequest({ query: { vid: invalid } }),
      response,
      () => {},
    );

    assert.equal(
      cookies.length,
      0,
      `expected vid "${invalid}" to be discarded, but a cookie was set`,
    );
  }
});

test("captureOAuthSignupContextMiddleware captures ctx, sid and vid independently in the same pass", async () => {
  const { response, cookies } = fakeResponse();
  const sessionInternalId = randomUUID();
  const visitorId = randomUUID();

  captureOAuthSignupContextMiddleware(
    fakeRequest({
      query: { ctx: "radar", sid: sessionInternalId, vid: visitorId },
    }),
    response,
    () => {},
  );

  assert.equal(cookies.length, 3);
  const byName = Object.fromEntries(cookies.map((c) => [c.name, c.value]));
  assert.equal(byName[OAUTH_SIGNUP_CONTEXT_COOKIE], "radar");
  assert.equal(byName[OAUTH_JOURNEY_SESSION_COOKIE], sessionInternalId);
  assert.equal(byName[OAUTH_VISITOR_ID_COOKIE], visitorId);
});

test("readAndClearOAuthVisitorId returns the cookie value when valid and clears it", async () => {
  const { response, cookies } = fakeResponse();
  const visitorId = randomUUID();

  const value = readAndClearOAuthVisitorId(
    fakeRequest({ cookies: { [OAUTH_VISITOR_ID_COOKIE]: visitorId } }),
    response,
  );

  assert.equal(value, visitorId);
  assert.equal(cookies.length, 1);
  assert.equal(cookies[0]?.name, OAUTH_VISITOR_ID_COOKIE);
  assert.equal(cookies[0]?.value, "");
});

test("readAndClearOAuthVisitorId returns null (never invented) when the cookie is expired/absent", async () => {
  const { response, cookies } = fakeResponse();

  const value = readAndClearOAuthVisitorId(fakeRequest(), response);

  assert.equal(value, null);
  assert.equal(cookies.length, 1);
  assert.equal(cookies[0]?.value, "");
});

test("readAndClearOAuthVisitorId discards a tampered/invalid cookie value instead of trusting it", async () => {
  const { response } = fakeResponse();

  const value = readAndClearOAuthVisitorId(
    fakeRequest({
      cookies: { [OAUTH_VISITOR_ID_COOKIE]: "<script>evil()</script>" },
    }),
    response,
  );

  assert.equal(value, null);
});

test("the visitor_id of one OAuth flow never leaks into another — each request only ever sees its own cookie", async () => {
  const visitorA = randomUUID();
  const visitorB = randomUUID();

  const { response: responseA } = fakeResponse();
  const valueA = readAndClearOAuthVisitorId(
    fakeRequest({ cookies: { [OAUTH_VISITOR_ID_COOKIE]: visitorA } }),
    responseA,
  );

  const { response: responseB } = fakeResponse();
  const valueB = readAndClearOAuthVisitorId(
    fakeRequest({ cookies: { [OAUTH_VISITOR_ID_COOKIE]: visitorB } }),
    responseB,
  );

  assert.equal(valueA, visitorA);
  assert.equal(valueB, visitorB);
  assert.notEqual(valueA, valueB);

  const { response: responseC } = fakeResponse();
  const valueC = readAndClearOAuthVisitorId(fakeRequest(), responseC);
  assert.equal(valueC, null);
});
