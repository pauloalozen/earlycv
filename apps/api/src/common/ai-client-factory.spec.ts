import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import {
  createAiClientFromEnv,
  getActiveAiSupplier,
  getAiModel,
} from "./ai-client-factory";

const ENV_KEYS = [
  "AI_SUPPLIER",
  "AI_SUPPLIER_ANALYSIS",
  "AI_SUPPLIER_CV_GENERATION",
  "AI_SUPPLIER_MASTERCV",
  "OPENAI_API_KEY",
  "DEEPSEEK_API_KEY",
  "OPENROUTER_API_KEY",
] as const;

let originalEnv: Record<string, string | undefined>;

beforeEach(() => {
  originalEnv = {};
  for (const key of ENV_KEYS) {
    originalEnv[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (originalEnv[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = originalEnv[key];
    }
  }
});

test("parses supplier and model from the global AI_SUPPLIER pipe value", () => {
  process.env.AI_SUPPLIER = "openai|gpt-5.4-mini";

  assert.equal(getActiveAiSupplier(), "openai");
  assert.equal(getAiModel(), "gpt-5.4-mini");
});

test("per-operation AI_SUPPLIER_<OP> overrides the global default", () => {
  process.env.AI_SUPPLIER = "openai|gpt-5.4-mini";
  process.env.AI_SUPPLIER_ANALYSIS = "deepseek|deepseek-v4-flash";

  assert.equal(getActiveAiSupplier("ANALYSIS"), "deepseek");
  assert.equal(getAiModel("ANALYSIS"), "deepseek-v4-flash");

  // operations without an override keep using the global config
  assert.equal(getActiveAiSupplier("MASTERCV"), "openai");
  assert.equal(getAiModel("MASTERCV"), "gpt-5.4-mini");
});

test("keeps model names with '/' intact for openrouter routes", () => {
  process.env.AI_SUPPLIER_CV_GENERATION =
    "openrouter|anthropic/claude-sonnet-4.6";

  assert.equal(getActiveAiSupplier("CV_GENERATION"), "openrouter");
  assert.equal(getAiModel("CV_GENERATION"), "anthropic/claude-sonnet-4.6");
});

test("falls back to the hardcoded default when AI_SUPPLIER is unset", () => {
  assert.equal(getActiveAiSupplier(), "openai");
  assert.equal(getAiModel(), "gpt-4o-mini");
});

test("falls back to the hardcoded default when a value is missing the '|' separator", () => {
  process.env.AI_SUPPLIER = "openai";

  assert.equal(getActiveAiSupplier(), "openai");
  assert.equal(getAiModel(), "gpt-4o-mini");
});

test("falls back to the hardcoded default when the supplier name is unknown", () => {
  process.env.AI_SUPPLIER = "not-a-real-supplier|some-model";

  assert.equal(getActiveAiSupplier(), "openai");
  assert.equal(getAiModel(), "gpt-4o-mini");
});

test("falls back to the global config when a per-operation override is malformed", () => {
  process.env.AI_SUPPLIER = "deepseek|deepseek-v4-flash";
  process.env.AI_SUPPLIER_MASTERCV = "openai";

  assert.equal(getActiveAiSupplier("MASTERCV"), "deepseek");
  assert.equal(getAiModel("MASTERCV"), "deepseek-v4-flash");
});

test("createAiClientFromEnv routes to the right base URL and key per supplier", () => {
  process.env.AI_SUPPLIER_MASTERCV = "openai|gpt-4o-mini";
  process.env.OPENAI_API_KEY = "openai-key";
  const openaiClient = createAiClientFromEnv("MASTERCV");
  assert.equal(openaiClient.apiKey, "openai-key");

  process.env.AI_SUPPLIER_MASTERCV = "openrouter|openai/gpt-4o-mini";
  process.env.OPENROUTER_API_KEY = "openrouter-key";
  const openrouterClient = createAiClientFromEnv("MASTERCV");
  assert.equal(openrouterClient.apiKey, "openrouter-key");
  assert.equal(openrouterClient.baseURL, "https://openrouter.ai/api/v1");
});
