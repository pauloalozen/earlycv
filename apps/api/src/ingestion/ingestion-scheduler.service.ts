import { Inject, Injectable } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";

import { IngestionService } from "./ingestion.service";
import { ManualIngestionBatchRepository } from "./manual-ingestion-batch.repository";

// runSourceSchedules()/runGlobalScheduleIfDue() foram removidos daqui —
// substituidos por IngestionJobSchedulerService, que le IngestionJob em
// vez de scheduleCron por fonte e globalCron em IngestionSchedulerConfig.
// Esta classe mantem recoverStaleRuns() (roda todo minuto, nao depende de
// agendamento) e runGlobalNow() (ainda usado pelo botao legado
// "Rodar global agora" do admin).
@Injectable()
export class IngestionSchedulerService {
  constructor(
    @Inject(IngestionService)
    private readonly ingestionService: IngestionService,
    @Inject(ManualIngestionBatchRepository)
    private readonly manualBatchRepository: ManualIngestionBatchRepository,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async tick() {
    if (process.env.NODE_ENV === "test") {
      return;
    }

    await this.ingestionService.recoverStaleRuns();
  }

  // Enqueues an async batch (scheduleEnabled sources only, same as the
  // automatic per-minute scheduler would pick up) instead of running
  // sources sequentially in-process. The manual batch runner cron
  // (IngestionManualRunnerService, every 10s) processes it — this call
  // returns immediately.
  async runGlobalNow(requestedByUserId?: string) {
    const run = await this.manualBatchRepository.createGlobalBatchRun({
      requestedByUserId,
    });

    return {
      batchRunId: run.id,
      status: run.status,
      totalSources: run.totalSources,
    } as const;
  }
}
