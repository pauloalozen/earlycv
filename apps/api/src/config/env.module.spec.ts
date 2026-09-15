import assert from "node:assert/strict";
import { test } from "node:test";

import { loadAppEnv } from "./env.module";

function buildBaseEnv(overrides: Record<string, string> = {}) {
  return {
    API_HOST: "0.0.0.0",
    API_PORT: "4000",
    JWT_ACCESS_SECRET: "access-secret",
    JWT_ACCESS_TTL: "900",
    JWT_REFRESH_SECRET: "refresh-secret",
    JWT_REFRESH_TTL: "2592000",
    GOOGLE_CLIENT_ID: "google-id",
    GOOGLE_CLIENT_SECRET: "google-secret",
    GOOGLE_CALLBACK_URL: "http://localhost:4000/api/auth/google/callback",
    LINKEDIN_CLIENT_ID: "linkedin-id",
    LINKEDIN_CLIENT_SECRET: "linkedin-secret",
    LINKEDIN_CALLBACK_URL: "http://localhost:4000/api/auth/linkedin/callback",
    ...overrides,
  };
}

test("loadAppEnv defaults JOBS_GHOST_MODE to false when env is absent", async () => {
  const env = await loadAppEnv(buildBaseEnv());
  assert.equal(env.JOBS_GHOST_MODE, false);
});

test("loadAppEnv parses JOBS_GHOST_MODE boolean", async () => {
  const env = await loadAppEnv(buildBaseEnv({ JOBS_GHOST_MODE: "true" }));
  assert.equal(env.JOBS_GHOST_MODE, true);
});

test("loadAppEnv defaults PRODUCT_UPDATES_ENABLED to false and rate to 5 — nasce desabilitado", async () => {
  const env = await loadAppEnv(buildBaseEnv());
  assert.equal(env.PRODUCT_UPDATES_ENABLED, false);
  assert.equal(env.PRODUCT_UPDATE_SEND_RATE_PER_SECOND, 5);
});

test("loadAppEnv parses PRODUCT_UPDATES_ENABLED and rate overrides", async () => {
  const env = await loadAppEnv(
    buildBaseEnv({
      PRODUCT_UPDATES_ENABLED: "true",
      PRODUCT_UPDATE_SEND_RATE_PER_SECOND: "10",
    }),
  );
  assert.equal(env.PRODUCT_UPDATES_ENABLED, true);
  assert.equal(env.PRODUCT_UPDATE_SEND_RATE_PER_SECOND, 10);
});
