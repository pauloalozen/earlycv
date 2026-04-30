import assert from "node:assert/strict";
import { test } from "node:test";

import { ANALYTICS_APP, resolveAnalyticsEnv } from "./analytics-env";

test("resolveAnalyticsEnv normalizes supported environments", () => {
  assert.equal(resolveAnalyticsEnv({ appEnv: "production" }), "production");
  assert.equal(resolveAnalyticsEnv({ appEnv: "staging" }), "staging");
  assert.equal(resolveAnalyticsEnv({ appEnv: "preview" }), "staging");
  assert.equal(resolveAnalyticsEnv({ appEnv: "development" }), "development");
  assert.equal(resolveAnalyticsEnv({ appEnv: "test" }), "development");
  assert.equal(resolveAnalyticsEnv({ appEnv: "local" }), "development");
  assert.equal(resolveAnalyticsEnv({ appEnv: undefined }), "development");
});

test("resolveAnalyticsEnv uses fallback precedence", () => {
  assert.equal(
    resolveAnalyticsEnv({
      appEnv: undefined,
      platformEnv: "preview",
      nodeEnv: "production",
    }),
    "staging",
  );

  assert.equal(
    resolveAnalyticsEnv({
      appEnv: undefined,
      platformEnv: undefined,
      nodeEnv: "production",
    }),
    "production",
  );
});

test("analytics app name is fixed", () => {
  assert.equal(ANALYTICS_APP, "earlycv");
});
