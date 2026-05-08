import { Inject, Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";

import { CvAdaptationService } from "./cv-adaptation.service";

@Injectable()
export class CvAdaptationSnapshotCleanupScheduler {
  private readonly logger = new Logger(
    CvAdaptationSnapshotCleanupScheduler.name,
  );

  constructor(
    @Inject(CvAdaptationService)
    private readonly cvAdaptationService: CvAdaptationService,
  ) {}

  @Cron("15 2 * * *")
  async runDailyCleanup() {
    const result =
      await this.cvAdaptationService.cleanupExpiredGuestSnapshots();
    this.logger.log(
      `analysis snapshot cleanup complete (deleted=${result.deleted})`,
    );
    return result;
  }
}
