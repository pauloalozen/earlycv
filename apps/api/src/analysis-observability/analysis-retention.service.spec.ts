import assert from "node:assert/strict";
import { test } from "node:test";

import {
  type AnalysisRetentionPolicy,
  AnalysisRetentionService,
} from "./analysis-retention.service";

test("purges protection and business streams using explicit retention policy", async () => {
  const calls: Array<{ cutoff: Date; model: string }> = [];
  const databaseStub: ConstructorParameters<
    typeof AnalysisRetentionService
  >[0] = {
    analysisProtectionEvent: {
      deleteMany: async (input: { where: { createdAt: { lt: Date } } }) => {
        calls.push({ cutoff: input.where.createdAt.lt, model: "protection" });
        return { count: 2 };
      },
    },
    businessFunnelEvent: {
      deleteMany: async (input: { where: { createdAt: { lt: Date } } }) => {
        calls.push({ cutoff: input.where.createdAt.lt, model: "business" });
        return { count: 3 };
      },
    },
    businessFunnelStageMetric: {
      deleteMany: async (input: { where: { metricDate: { lt: Date } } }) => {
        calls.push({ cutoff: input.where.metricDate.lt, model: "metrics" });
        return { count: 1 };
      },
    },
  };
  const service = new AnalysisRetentionService(databaseStub);
  const now = new Date("2026-04-21T00:00:00.000Z");
  const policy: AnalysisRetentionPolicy = {
    businessEventsDays: 30,
    protectionEventsDays: 14,
    stageMetricsDays: 90,
  };

  const result = await service.purgeExpiredData(policy, now);

  assert.deepEqual(result, {
    deletedBusinessEventCount: 3,
    deletedProtectionEventCount: 2,
    deletedStageMetricCount: 1,
  });
  assert.equal(calls.length, 3);
  assert.deepEqual(
    calls.map((entry) => entry.model),
    ["protection", "business", "metrics"],
  );
});

test("retention policy parser reads env values with defaults", () => {
  const parsed = AnalysisRetentionService.parseRetentionPolicyFromEnv({
    ANALYSIS_RETENTION_BUSINESS_EVENTS_DAYS: "45",
    ANALYSIS_RETENTION_PROTECTION_EVENTS_DAYS: "20",
    ANALYSIS_RETENTION_STAGE_METRICS_DAYS: "120",
  });

  assert.deepEqual(parsed, {
    businessEventsDays: 45,
    protectionEventsDays: 20,
    stageMetricsDays: 120,
  });
});
