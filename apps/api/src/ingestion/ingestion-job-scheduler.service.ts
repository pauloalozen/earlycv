import { randomUUID } from "node:crypto";
import { Inject, Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";

import { DatabaseService } from "../database/database.service";
import { IngestionJobDispatchService } from "./ingestion-job-dispatch.service";
import { IngestionLockRepository } from "./ingestion-lock.repository";

// dispatchJob roda de forma sincrona ate concluir (cria o batch ou chama
// o worker de enriquecimento) antes de atualizar nextRunAt — sem lock, um
// job lento (ex: enriquecimento com muitos itens) que ultrapasse 1 minuto
// seria selecionado de novo pelo proximo tick e disparado em duplicidade.
const JOB_DISPATCH_LOCK_TTL_MS = 10 * 60_000;

// Substitui runSourceSchedules()/runGlobalScheduleIfDue() do
// IngestionSchedulerService legado: em vez de ler scheduleCron por
// JobSource e globalCron/enrichmentCronExpression em
// IngestionSchedulerConfig, agora tudo passa por IngestionJob —
// entidade nomeada, com escopo e frequencia em linguagem humana.
@Injectable()
export class IngestionJobSchedulerService {
  private readonly logger = new Logger(IngestionJobSchedulerService.name);

  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(IngestionJobDispatchService)
    private readonly dispatchService: IngestionJobDispatchService,
    @Inject(IngestionLockRepository)
    private readonly lockRepository: IngestionLockRepository,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async tick() {
    if (process.env.NODE_ENV === "test") {
      return;
    }

    const now = new Date();
    const dueJobs = await this.findDueJobs(now);
    const owner = `ingestion-job-scheduler-${randomUUID()}`;

    for (const job of dueJobs) {
      const lockId = `ingestion-job:${job.id}`;
      const acquired = await this.lockRepository.acquire(
        lockId,
        owner,
        JOB_DISPATCH_LOCK_TTL_MS,
      );

      if (!acquired) {
        continue;
      }

      try {
        await this.dispatchService.dispatchJob(job, "SCHEDULE");
      } catch (error) {
        this.logger.warn(
          `failed to dispatch ingestion job ${job.id}: ${error instanceof Error ? error.message : "unknown"}`,
        );
      } finally {
        await this.lockRepository.release(lockId, owner);
      }
    }
  }

  findDueJobs(now: Date) {
    return this.database.ingestionJob.findMany({
      where: {
        isEnabled: true,
        nextRunAt: { lte: now },
        scheduleType: { not: "MANUAL" },
      },
    });
  }
}
