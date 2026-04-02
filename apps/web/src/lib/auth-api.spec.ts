import assert from "node:assert/strict";
import { test } from "node:test";

import { getAuthApiBaseUrl, getAuthErrorMessage } from "./auth-api";

test("getAuthApiBaseUrl appends /api when needed", () => {
  assert.equal(
    getAuthApiBaseUrl("http://localhost:4000"),
    "http://localhost:4000/api",
  );
  assert.equal(
    getAuthApiBaseUrl("http://localhost:4000/api"),
    "http://localhost:4000/api",
  );
});

test("getAuthErrorMessage maps common auth responses to concise UI copy", () => {
  assert.equal(
    getAuthErrorMessage(401, "invalid credentials"),
    "Email ou senha invalidos.",
  );
  assert.equal(
    getAuthErrorMessage(400, "verification code is invalid or expired"),
    "Codigo invalido ou expirado.",
  );
  assert.equal(
    getAuthErrorMessage(503, "anything"),
    "Nao foi possivel concluir a solicitacao agora. Tente novamente.",
  );
});
