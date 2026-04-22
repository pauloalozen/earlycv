import { Inject, Injectable } from "@nestjs/common";

import { DatabaseService } from "../database/database.service";

export type AnalysisRetentionPolicy = {
  businessEventsDays: number;
  protectionEventsDays: number;
  stageMetricsDays: number;
};

export type AnalysisRetentionPurgeResult = {
  deletedBusinessEventCount: number;
  deletedProtectionEventCount: number;
  deletedStageMetricCount: number;
};

const DEFAULT_RETENTION_POLICY: AnalysisRetentionPolicy = {
  businessEventsDays: 180,
  protectionEventsDays: 90,
  stageMetricsDays: 365,
};

@Injectable()
export class AnalysisRetentionService {
  constructor(
    @Inject(DatabaseService)
    private readonly database: Pick<
      DatabaseService,
      | "analysisProtectionEvent"
      | "businessFunnelEvent"
      | "businessFunnelStageMetric"
    >,
  ) {}

  static parseRetentionPolicyFromEnv(
    env: Record<string, string | undefined>,
  ): AnalysisRetentionPolicy {
    return {
      businessEventsDays: AnalysisRetentionService.parsePositiveInt(
        env.ANALYSIS_RETENTION_BUSINESS_EVENTS_DAYS,
        DEFAULT_RETENTION_POLICY.businessEventsDays,
      ),
      protectionEventsDays: AnalysisRetentionService.parsePositiveInt(
        env.ANALYSIS_RETENTION_PROTECTION_EVENTS_DAYS,
        DEFAULT_RETENTION_POLICY.protectionEventsDays,
      ),
      stageMetricsDays: AnalysisRetentionService.parsePositiveInt(
        env.ANALYSIS_RETENTION_STAGE_METRICS_DAYS,
        DEFAULT_RETENTION_POLICY.stageMetricsDays,
      ),
    };
  }

  async purgeExpiredData(
    policy: AnalysisRetentionPolicy,
    now = new Date(),
  ): Promise<AnalysisRetentionPurgeResult> {
    const protectionCutoff = this.daysAgo(now, policy.protectionEventsDays);
    const businessCutoff = this.daysAgo(now, policy.businessEventsDays);
    const metricsCutoff = this.daysAgo(now, policy.stageMetricsDays);

    const [deletedProtection, deletedBusiness, deletedMetrics] =
      await Promise.all([
        this.database.analysisProtectionEvent.deleteMany({
          where: {
            createdAt: {
              lt: protectionCutoff,
            },
          },
        }),
        this.database.businessFunnelEvent.deleteMany({
          where: {
            createdAt: {
              lt: businessCutoff,
            },
          },
        }),
        this.database.businessFunnelStageMetric.deleteMany({
          where: {
            metricDate: {
              lt: metricsCutoff,
            },
          },
        }),
      ]);

    return {
      deletedBusinessEventCount: deletedBusiness.count,
      deletedProtectionEventCount: deletedProtection.count,
      deletedStageMetricCount: deletedMetrics.count,
    };
  }

  private daysAgo(now: Date, days: number): Date {
    return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  }

  private static parsePositiveInt(value: string | undefined, fallback: number) {
    const parsed = Number.parseInt(value ?? "", 10);

    if (Number.isNaN(parsed) || parsed <= 0) {
      return fallback;
    }

    return parsed;
  }
}
