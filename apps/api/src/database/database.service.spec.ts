import "reflect-metadata";

import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { Test } from "@nestjs/testing";

import { loadAppEnv, loadLocalEnvFileIfPresent } from "../config/env.module";
import { DatabaseModule } from "./database.module";
import { DatabaseService } from "./database.service";

test("loadAppEnv requires auth and social provider settings", async () => {
  await assert.rejects(loadAppEnv({}), /JWT_ACCESS_SECRET/);
});

test("loadAppEnv uses API defaults once required auth settings exist", async () => {
  const env = await loadAppEnv({
    JWT_ACCESS_SECRET: "access-secret",
    JWT_REFRESH_SECRET: "refresh-secret",
    GOOGLE_CLIENT_ID: "google-client-id",
    GOOGLE_CLIENT_SECRET: "google-client-secret",
    GOOGLE_CALLBACK_URL: "http://localhost:4000/api/auth/google/callback",
    LINKEDIN_CLIENT_ID: "linkedin-client-id",
    LINKEDIN_CLIENT_SECRET: "linkedin-client-secret",
    LINKEDIN_CALLBACK_URL: "http://localhost:4000/api/auth/linkedin/callback",
  });

  assert.equal(env.API_PORT, 4000);
  assert.equal(env.JWT_ACCESS_TTL, 900);
  assert.equal(env.JWT_ACCESS_SECRET, "access-secret");
  assert.equal(env.LINKEDIN_CLIENT_ID, "linkedin-client-id");
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

test("DatabaseModule exposes the shared Prisma-backed database service", async () => {
  const moduleRef = await Test.createTestingModule({
    imports: [DatabaseModule],
  }).compile();

  const service = moduleRef.get(DatabaseService);
  const resumeDelegate = service.resume as {
    findMany: (args: { take: number }) => PromiseLike<unknown>;
  };
  const prismaPromise = resumeDelegate.findMany({ take: 0 });

  assert.equal(typeof service.user.findMany, "function");
  assert.equal(typeof service.$transaction, "function");
  assert.equal(typeof service.resume.findMany, "function");
  assert.equal(typeof prismaPromise.then, "function");
  await prismaPromise;
  await moduleRef.close();
});
