import { Inject, Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";

import { GoogleIndexingBackfillService } from "./google-indexing-backfill.service";

@Injectable()
export class GoogleIndexingBackfillScheduler {
  private readonly logger = new Logger(GoogleIndexingBackfillScheduler.name);

  constructor(
    @Inject(GoogleIndexingBackfillService)
    private readonly backfillService: GoogleIndexingBackfillService,
  ) {}

  // 03:00 — fora da janela de retention (02:00, ver
  // analysis-retention.scheduler.ts) e do horário de pico de ingestão.
  @Cron("0 3 * * *")
  async runDailyBackfill() {
    const result = await this.backfillService.runBackfillBatch();
    this.logger.log(
      `daily backfill run: processed=${result.processed} succeeded=${result.succeeded} failed=${result.failed} dailyLimit=${result.dailyLimit}`,
    );
    return result;
  }
}
