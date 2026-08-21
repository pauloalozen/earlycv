import assert from "node:assert/strict";
import { test } from "node:test";
import type { Request, Response } from "express";
import {
  captureOAuthSignupContextMiddleware,
  OAUTH_SIGNUP_CONTEXT_COOKIE,
  readAndClearOAuthSignupContext,
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
