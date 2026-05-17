import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildSaoPauloUsageDate,
  resolveDailyAnalysisLimit,
} from "./analysis-limit";

test("resolveDailyAnalysisLimit maps env values for plans", () => {
  const env = {
    QNT_AN_PLAN_FREE: "3",
    QNT_AN_PLAN_STARTER: "6",
    QNT_AN_PLAN_PRO: "9",
    QNT_AN_PLAN_TURBO: "30",
  } as NodeJS.ProcessEnv;

  assert.equal(resolveDailyAnalysisLimit("free", env), 3);
  assert.equal(resolveDailyAnalysisLimit("starter", env), 6);
  assert.equal(resolveDailyAnalysisLimit("pro", env), 9);
  assert.equal(resolveDailyAnalysisLimit("turbo", env), 30);
  assert.equal(resolveDailyAnalysisLimit("unlimited", env), null);
});

test("resolveDailyAnalysisLimit throws for invalid env values", () => {
  assert.throws(
    () =>
      resolveDailyAnalysisLimit("free", {
        QNT_AN_PLAN_FREE: "0",
        QNT_AN_PLAN_STARTER: "6",
        QNT_AN_PLAN_PRO: "9",
        QNT_AN_PLAN_TURBO: "30",
      } as NodeJS.ProcessEnv),
    /QNT_AN_PLAN_FREE/,
  );
  assert.throws(
    () =>
      resolveDailyAnalysisLimit("starter", {
        QNT_AN_PLAN_FREE: "3",
        QNT_AN_PLAN_STARTER: "-1",
        QNT_AN_PLAN_PRO: "9",
        QNT_AN_PLAN_TURBO: "30",
      } as NodeJS.ProcessEnv),
    /QNT_AN_PLAN_STARTER/,
  );
  assert.throws(
    () =>
      resolveDailyAnalysisLimit("pro", {
        QNT_AN_PLAN_FREE: "3",
        QNT_AN_PLAN_STARTER: "6",
        QNT_AN_PLAN_PRO: "abc",
        QNT_AN_PLAN_TURBO: "30",
      } as NodeJS.ProcessEnv),
    /QNT_AN_PLAN_PRO/,
  );
  assert.throws(
    () =>
      resolveDailyAnalysisLimit("turbo", {
        QNT_AN_PLAN_FREE: "3",
        QNT_AN_PLAN_STARTER: "6",
        QNT_AN_PLAN_PRO: "9",
        QNT_AN_PLAN_TURBO: "3abc",
      } as NodeJS.ProcessEnv),
    /QNT_AN_PLAN_TURBO/,
  );
  assert.throws(
    () =>
      resolveDailyAnalysisLimit("free", {
        QNT_AN_PLAN_FREE: "",
        QNT_AN_PLAN_STARTER: "6",
        QNT_AN_PLAN_PRO: "9",
        QNT_AN_PLAN_TURBO: "30",
      } as NodeJS.ProcessEnv),
    /QNT_AN_PLAN_FREE/,
  );
});

test("buildSaoPauloUsageDate normalizes to Sao Paulo day boundary", () => {
  const date = buildSaoPauloUsageDate(new Date("2026-04-14T23:40:00.000Z"));
  assert.equal(date.toISOString(), "2026-04-14T03:00:00.000Z");
});

test("buildSaoPauloUsageDate maps early UTC to previous Sao Paulo day", () => {
  const date = buildSaoPauloUsageDate(new Date("2026-04-14T02:30:00.000Z"));
  assert.equal(date.toISOString(), "2026-04-13T03:00:00.000Z");
});
