import assert from "node:assert/strict";
import { test } from "node:test";

import {
  PosthogClientService,
  resolvePosthogHost,
} from "./posthog-client.service";

test("keeps PostHog enabled when API key exists without project id", () => {
  const service = new PosthogClientService({
    apiKey: "phc_test_key",
    enabled: true,
    flushIntervalMs: 5000,
    maxBatchSize: 50,
    projectId: "",
  });

  assert.equal(service.isEnabled(), true);
});

test("uses default PostHog host when project id is numeric", () => {
  assert.equal(resolvePosthogHost("392966"), "https://us.i.posthog.com");
});

test("capture appends analytics env and app properties", () => {
  const previousAppEnv = process.env.APP_ENV;
  const previousRailwayEnv = process.env.RAILWAY_ENVIRONMENT_NAME;
  const previousNodeEnv = process.env.NODE_ENV;

  process.env.APP_ENV = "preview";
  process.env.RAILWAY_ENVIRONMENT_NAME = "";
  process.env.NODE_ENV = "production";

  const captured: Array<Record<string, unknown>> = [];
  const service = new PosthogClientService({
    apiKey: "phc_test_key",
    enabled: true,
    flushIntervalMs: 5000,
    maxBatchSize: 50,
    projectId: "",
  });

  (service as any).client = {
    capture: (message: Record<string, unknown>) => captured.push(message),
    flush: async () => {},
    shutdown: () => {},
  };
  (service as any).isConfigured = true;

  service.capture("analysis_started", { source: "backend" });

  assert.equal(captured.length, 1);
  assert.equal((captured[0].properties as Record<string, unknown>).env, "staging");
  assert.equal((captured[0].properties as Record<string, unknown>).app, "earlycv");

  process.env.APP_ENV = previousAppEnv;
  process.env.RAILWAY_ENVIRONMENT_NAME = previousRailwayEnv;
  process.env.NODE_ENV = previousNodeEnv;
});
