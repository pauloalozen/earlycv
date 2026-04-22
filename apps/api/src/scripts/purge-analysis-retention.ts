import { PrismaClient } from "@prisma/client";

import {
  type AnalysisRetentionPolicy,
  AnalysisRetentionService,
} from "../analysis-observability/analysis-retention.service";

async function main() {
  const prisma = new PrismaClient();

  try {
    const policy = AnalysisRetentionService.parseRetentionPolicyFromEnv(
      process.env,
    );
    const service = new AnalysisRetentionService({
      analysisProtectionEvent: prisma.analysisProtectionEvent,
      businessFunnelEvent: prisma.businessFunnelEvent,
      businessFunnelStageMetric: prisma.businessFunnelStageMetric,
    });
    const result = await service.purgeExpiredData(policy);

    logSummary(policy, result);
  } finally {
    await prisma.$disconnect();
  }
}

function logSummary(
  policy: AnalysisRetentionPolicy,
  result: {
    deletedBusinessEventCount: number;
    deletedProtectionEventCount: number;
    deletedStageMetricCount: number;
  },
) {
  console.log("[analysis-retention] completed");
  console.log(
    `[analysis-retention] policy protection=${policy.protectionEventsDays}d business=${policy.businessEventsDays}d metrics=${policy.stageMetricsDays}d`,
  );
  console.log(
    `[analysis-retention] deleted protection=${result.deletedProtectionEventCount} business=${result.deletedBusinessEventCount} metrics=${result.deletedStageMetricCount}`,
  );
}

main().catch((error) => {
  console.error("[analysis-retention] failed", error);
  process.exitCode = 1;
});
