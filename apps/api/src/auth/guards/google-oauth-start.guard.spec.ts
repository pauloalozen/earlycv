import assert from "node:assert/strict";
import { test } from "node:test";

import { GoogleOAuthStartGuard } from "./google-oauth-start.guard";

// Fase 3: o navegador só consegue influenciar `state` via query string de
// /auth/google/start — mas o VALOR em si é sempre o que o backend gerou em
// POST /auth/oauth-attempts (o navegador só ecoa de volta o que recebeu).
// Este guard é só o encanamento que repassa esse valor pro passport-oauth2.

const makeContext = (query: Record<string, unknown>) =>
  ({
    switchToHttp: () => ({
      getRequest: () => ({ query }),
    }),
  }) as never;

test("forwards state to passport when present as a non-empty string", () => {
  const guard = new GoogleOAuthStartGuard();
  const options = guard.getAuthenticateOptions(
    makeContext({ state: "opaque-state-value" }),
  );

  assert.deepEqual(options, { state: "opaque-state-value" });
});

test("returns no state option when absent — not every /auth/google/start comes from a pending guest analysis", () => {
  const guard = new GoogleOAuthStartGuard();
  const options = guard.getAuthenticateOptions(makeContext({}));

  assert.deepEqual(options, {});
});

test("ignores a non-string state (e.g. duplicated query param, array)", () => {
  const guard = new GoogleOAuthStartGuard();
  const options = guard.getAuthenticateOptions(
    makeContext({ state: ["a", "b"] }),
  );

  assert.deepEqual(options, {});
});

test("ignores an empty string state", () => {
  const guard = new GoogleOAuthStartGuard();
  const options = guard.getAuthenticateOptions(makeContext({ state: "" }));

  assert.deepEqual(options, {});
});
