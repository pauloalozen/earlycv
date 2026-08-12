import assert from "node:assert/strict";
import { test } from "node:test";

import { normalizeAdapterTitle } from "./title-normalization";

test("normalizeAdapterTitle keeps slash-separated tokens apart", () => {
  assert.equal(
    normalizeAdapterTitle("ANALISTA DE ETL/BI-NÍVEL PLENO"),
    "analista de etl bi-nivel pleno",
  );
});

test("normalizeAdapterTitle keeps pipe-separated tokens apart", () => {
  assert.equal(
    normalizeAdapterTitle("AI Orchestrator (Squad Leader | Manager)"),
    "ai orchestrator squad leader manager",
  );
});

test("normalizeAdapterTitle keeps plus-separated tokens apart", () => {
  assert.equal(
    normalizeAdapterTitle("Senior Developer Fullstack (Java+ Angular)"),
    "senior developer fullstack java angular",
  );
});

test("normalizeAdapterTitle strips accents, punctuation, and extra whitespace", () => {
  assert.equal(
    normalizeAdapterTitle("Pessoa Engenheira de Dados Sênior!"),
    "pessoa engenheira de dados senior",
  );
});

test("normalizeAdapterTitle returns an empty string for null/undefined", () => {
  assert.equal(normalizeAdapterTitle(null), "");
  assert.equal(normalizeAdapterTitle(undefined), "");
});
