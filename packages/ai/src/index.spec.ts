import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import OpenAI from "openai";

import { aiProviders, createOpenAIClient, defaultAIProvider } from "./index.js";

const packageJson = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
) as {
  exports: {
    ".": {
      development?: string;
      default: string;
      types: string;
    };
  };
};

test("createOpenAIClient builds an OpenAI SDK client", () => {
  const client = createOpenAIClient({
    apiKey: "test-key",
    baseURL: "https://api.openai.example/v1",
    organization: "org_earlycv",
    project: "proj_foundation",
  });

  assert.equal(client instanceof OpenAI, true);
});

test("ai package exposes development source exports and compiled default runtime", () => {
  assert.equal(packageJson.exports["."].development, "./src/index.ts");
  assert.equal(packageJson.exports["."].default, "./dist/index.js");
  assert.equal(packageJson.exports["."].types, "./src/index.ts");
});

test("ai package exposes stable provider contract metadata", () => {
  assert.equal(defaultAIProvider, "openai");
  assert.deepEqual(aiProviders, ["openai"]);
});
