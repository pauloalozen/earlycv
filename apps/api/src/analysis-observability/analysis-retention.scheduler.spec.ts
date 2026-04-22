import assert from "node:assert/strict";
import { test } from "node:test";

import { AnalysisRetentionScheduler } from "./analysis-retention.scheduler";

test("daily retention scheduler executes purge with env policy", async () => {
  const envBackup = {
    ANALYSIS_RETENTION_BUSINESS_EVENTS_DAYS:
      process.env.ANALYSIS_RETENTION_BUSINESS_EVENTS_DAYS,
    ANALYSIS_RETENTION_PROTECTION_EVENTS_DAYS:
      process.env.ANALYSIS_RETENTION_PROTECTION_EVENTS_DAYS,
    ANALYSIS_RETENTION_STAGE_METRICS_DAYS:
      process.env.ANALYSIS_RETENTION_STAGE_METRICS_DAYS,
  };

  process.env.ANALYSIS_RETENTION_PROTECTION_EVENTS_DAYS = "7";
  process.env.ANALYSIS_RETENTION_BUSINESS_EVENTS_DAYS = "21";
  process.env.ANALYSIS_RETENTION_STAGE_METRICS_DAYS = "45";

  let capturedPolicy: {
    businessEventsDays: number;
    protectionEventsDays: number;
    stageMetricsDays: number;
  } | null = null;

  const scheduler = new AnalysisRetentionScheduler({
    purgeExpiredData: async (policy: {
      businessEventsDays: number;
      protectionEventsDays: number;
      stageMetricsDays: number;
    }) => {
      capturedPolicy = policy;

      return {
        deletedBusinessEventCount: 3,
        deletedProtectionEventCount: 2,
        deletedStageMetricCount: 1,
      };
    },
  } as any);

  const result = await scheduler.runDailyRetention();

  assert.deepEqual(capturedPolicy, {
    businessEventsDays: 21,
    protectionEventsDays: 7,
    stageMetricsDays: 45,
  });
  assert.deepEqual(result, {
    deletedBusinessEventCount: 3,
    deletedProtectionEventCount: 2,
    deletedStageMetricCount: 1,
  });

  process.env.ANALYSIS_RETENTION_PROTECTION_EVENTS_DAYS =
    envBackup.ANALYSIS_RETENTION_PROTECTION_EVENTS_DAYS;
  process.env.ANALYSIS_RETENTION_BUSINESS_EVENTS_DAYS =
    envBackup.ANALYSIS_RETENTION_BUSINESS_EVENTS_DAYS;
  process.env.ANALYSIS_RETENTION_STAGE_METRICS_DAYS =
    envBackup.ANALYSIS_RETENTION_STAGE_METRICS_DAYS;
});
