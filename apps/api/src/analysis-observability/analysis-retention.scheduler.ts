import { Inject, Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";

import {
  type AnalysisRetentionPurgeResult,
  AnalysisRetentionService,
} from "./analysis-retention.service";

@Injectable()
export class AnalysisRetentionScheduler {
  private readonly logger = new Logger(AnalysisRetentionScheduler.name);

  constructor(
    @Inject(AnalysisRetentionService)
    private readonly analysisRetentionService: AnalysisRetentionService,
  ) {}

  @Cron("0 2 * * *")
  async runDailyRetention(): Promise<AnalysisRetentionPurgeResult> {
    const startedAt = Date.now();
    const policy = AnalysisRetentionService.parseRetentionPolicyFromEnv(
      process.env,
    );
    const result = await this.analysisRetentionService.purgeExpiredData(policy);
    const durationMs = Date.now() - startedAt;

    this.logger.log(
      `retention purge complete in ${durationMs}ms (protection=${result.deletedProtectionEventCount}, business=${result.deletedBusinessEventCount}, metrics=${result.deletedStageMetricCount})`,
    );

    return result;
  }
}
