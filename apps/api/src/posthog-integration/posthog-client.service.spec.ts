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
