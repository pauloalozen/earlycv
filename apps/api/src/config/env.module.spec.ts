import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { loadAppEnv, loadLocalEnvFileIfPresent } from "./env.module";

test("loadAppEnv uses monorepo API defaults", async () => {
  const env = await loadAppEnv({});

  assert.deepEqual(env, {
    API_HOST: "0.0.0.0",
    API_PORT: 4000,
  });
});

test("loadAppEnv rejects an invalid API port", async () => {
  await assert.rejects(
    loadAppEnv({ API_PORT: "invalid" }),
    /API_PORT: must be a valid number/,
  );
});

test("loadLocalEnvFileIfPresent loads the repo root .env for workspace runs", () => {
  const tempRoot = mkdtempSync(join(tmpdir(), "earlycv-api-env-"));
  const workspaceDir = join(tempRoot, "apps", "api");
  const envPath = join(tempRoot, ".env");
  const previousValue = process.env.API_PORT;

  mkdirSync(workspaceDir, { recursive: true });
  writeFileSync(envPath, "API_PORT=4000\n");
  delete process.env.API_PORT;

  const loadedPath = loadLocalEnvFileIfPresent(workspaceDir);

  assert.equal(loadedPath, envPath);
  assert.equal(process.env.API_PORT, "4000");

  if (previousValue === undefined) {
    delete process.env.API_PORT;
  } else {
    process.env.API_PORT = previousValue;
  }
});
