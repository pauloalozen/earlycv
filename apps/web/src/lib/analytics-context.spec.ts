import assert from "node:assert/strict";
import { test } from "node:test";

import { getFrontendAnalyticsContext } from "./analytics-context";

test("frontend analytics context resolves env from NEXT_PUBLIC_APP_ENV", () => {
  const previousAppEnv = process.env.NEXT_PUBLIC_APP_ENV;
  const previousVercelEnv = process.env.NEXT_PUBLIC_VERCEL_ENV;
  const previousNodeEnv = process.env.NODE_ENV;

  process.env.NEXT_PUBLIC_APP_ENV = "staging";
  process.env.NEXT_PUBLIC_VERCEL_ENV = "production";
  process.env.NODE_ENV = "production";

  const context = getFrontendAnalyticsContext();
  assert.deepEqual(context, { app: "earlycv", env: "staging" });

  process.env.NEXT_PUBLIC_APP_ENV = previousAppEnv;
  process.env.NEXT_PUBLIC_VERCEL_ENV = previousVercelEnv;
  process.env.NODE_ENV = previousNodeEnv;
});

test("frontend analytics context falls back to development", () => {
  const previousAppEnv = process.env.NEXT_PUBLIC_APP_ENV;
  const previousVercelEnv = process.env.NEXT_PUBLIC_VERCEL_ENV;
  const previousNodeEnv = process.env.NODE_ENV;

  process.env.NEXT_PUBLIC_APP_ENV = "";
  process.env.NEXT_PUBLIC_VERCEL_ENV = "";
  process.env.NODE_ENV = "test";

  const context = getFrontendAnalyticsContext();
  assert.deepEqual(context, { app: "earlycv", env: "development" });

  process.env.NEXT_PUBLIC_APP_ENV = previousAppEnv;
  process.env.NEXT_PUBLIC_VERCEL_ENV = previousVercelEnv;
  process.env.NODE_ENV = previousNodeEnv;
});
