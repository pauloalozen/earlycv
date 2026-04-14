import assert from "node:assert/strict";
import { test } from "node:test";

import { extractApiErrorMessage } from "./cv-adaptation-api-errors.ts";

test("extractApiErrorMessage returns nested API message when response is JSON", () => {
  const raw = JSON.stringify({
    message: "Você não tem créditos de análise disponíveis.",
    error: "Bad Request",
    statusCode: 400,
  });

  assert.equal(
    extractApiErrorMessage(raw, "Falha ao analisar CV."),
    "Você não tem créditos de análise disponíveis.",
  );
});

test("extractApiErrorMessage joins array messages from validation responses", () => {
  const raw = JSON.stringify({
    message: [
      "masterResumeId must be a UUID",
      "jobDescriptionText is required",
    ],
    statusCode: 400,
  });

  assert.equal(
    extractApiErrorMessage(raw, "Falha ao analisar CV."),
    "masterResumeId must be a UUID | jobDescriptionText is required",
  );
});

test("extractApiErrorMessage falls back to trimmed plain text", () => {
  assert.equal(
    extractApiErrorMessage("  service unavailable  ", "Falha ao analisar CV."),
    "service unavailable",
  );
});
