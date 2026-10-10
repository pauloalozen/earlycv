import { randomUUID } from "node:crypto";

import { shouldEmitJobPosting } from "@earlycv/config/job-posting";
import { Inject, Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";

import { trackJob } from "../common/memory-diagnostics";
import { DatabaseService } from "../database/database.service";
import { IngestionLockRepository } from "../ingestion/ingestion-lock.repository";
import { PUBLIC_JOB_INTEGRITY_WHERE } from "../jobs/public-job-integrity";
import { GoogleIndexingService } from "./google-indexing.service";
import { JOB_POSTING_ELIGIBILITY_SELECT } from "./google-indexing-queue.service";
import {
  countIndexingSentToday,
  getIndexingDailyLimit,
  startOfPacificDay,
} from "./indexing-quota";

const LOCK_ID = "google-indexing-queue";
const LOCK_TTL_MS = 2 * 60 * 1000;
// Envios por execução (1 por minuto): não segura o lock, e 200/dia cabem
// folgados em 10 execuções.
export const INDEXING_SENDS_PER_RUN = 20;
export const INDEXING_MAX_ATTEMPTS = 5;
const RETRY_BASE_DELAY_MS = 5 * 60 * 1000;
const RETENTION_DAYS = 30;

// Processa a fila de GoogleIndexingQueueItem: respeita a cota diária
// (janela do Pacífico, URL_UPDATED + URL_DELETED), manda remoção antes de
// publicação e reconfere o status da vaga na hora do envio. Com
// GOOGLE_INDEXING_ENABLED desligado a fila continua recebendo pendências
// (uma por vaga), mas nada é enviado.
@Injectable()
export class GoogleIndexingQueueWorker {
  private readonly logger = new Logger(GoogleIndexingQueueWorker.name);
  private lastRetentionDay: number | null = null;

  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(GoogleIndexingService)
    private readonly googleIndexingService: GoogleIndexingService,
    @Inject(IngestionLockRepository)
    private readonly lockRepository: IngestionLockRepository,
  ) {}

  @Cron("30 * * * * *")
  async tick() {
    if (process.env.NODE_ENV === "test") return;
    await trackJob("google-indexing-queue", () => this.runOnce());
  }

  async runOnce(now = new Date()): Promise<{
    sent: number;
    skipped: number;
    failed: number;
    quotaExceeded: boolean;
  }> {
    const result = { failed: 0, quotaExceeded: false, sent: 0, skipped: 0 };
    const owner = `indexing-queue-${randomUUID()}`;
    const acquired = await this.lockRepository.acquire(
      LOCK_ID,
      owner,
      LOCK_TTL_MS,
    );
    if (!acquired) return result;

    try {
      await this.purgeOldItemsOncePerDay(now);
      if (!this.googleIndexingService.isEnabled()) return result;

      const remaining =
        getIndexingDailyLimit() -
        (await countIndexingSentToday(this.database, now));
      const batchSize = Math.min(INDEXING_SENDS_PER_RUN, remaining);
      if (batchSize <= 0) return result;

      const items = await this.database.googleIndexingQueueItem.findMany({
        orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
        take: batchSize,
        where: { nextAttemptAt: { lte: now }, status: "pending" },
      });

      for (const item of items) {
        if (!(await this.matchesCurrentStatus(item.slug, item.type))) {
          await this.finish(item.id, item.type, "skipped", now);
          result.skipped += 1;
          continue;
        }

        const sent = await this.googleIndexingService.send({
          slug: item.slug,
          type: item.type as "URL_UPDATED" | "URL_DELETED",
          url: item.url,
        });

        if (sent.ok) {
          await this.finish(item.id, item.type, "done", now);
          result.sent += 1;
          continue;
        }

        // Cota estourada não é falha da pendência: fica para o próximo dia.
        if (sent.quotaExceeded) {
          result.quotaExceeded = true;
          break;
        }

        const attempts = item.attempts + 1;
        if (attempts >= INDEXING_MAX_ATTEMPTS) {
          await this.database.googleIndexingQueueItem.updateMany({
            data: {
              attempts,
              lastError: sent.error,
              pendingKey: null,
              processedAt: now,
              status: "failed",
            },
            where: { id: item.id, status: "pending", type: item.type },
          });
          result.failed += 1;
        } else {
          await this.database.googleIndexingQueueItem.updateMany({
            data: {
              attempts,
              lastError: sent.error,
              nextAttemptAt: new Date(
                now.getTime() + RETRY_BASE_DELAY_MS * 2 ** (attempts - 1),
              ),
            },
            where: { id: item.id, status: "pending", type: item.type },
          });
        }
      }

      if (result.sent || result.skipped || result.failed) {
        this.logger.log(
          `indexing queue: sent=${result.sent} skipped=${result.skipped} failed=${result.failed} quotaExceeded=${result.quotaExceeded}`,
        );
      }
      return result;
    } finally {
      await this.lockRepository.release(LOCK_ID, owner);
    }
  }

  // UPDATED só para vaga pública (active + integridade) que tem JobPosting
  // (shouldEmitJobPosting: virou banco de talentos ou perdeu a localização
  // desde o enfileiramento, não envia); DELETED só para vaga que não está
  // mais active (ou nem existe). Mudou desde o enfileiramento: a pendência é
  // descartada sem gastar cota.
  private async matchesCurrentStatus(
    slug: string,
    type: string,
  ): Promise<boolean> {
    if (type === "URL_UPDATED") {
      const job = await this.database.job.findFirst({
        select: JOB_POSTING_ELIGIBILITY_SELECT,
        where: { ...PUBLIC_JOB_INTEGRITY_WHERE, slug, status: "active" },
      });
      return job !== null && shouldEmitJobPosting(job);
    }
    const job = await this.database.job.findUnique({
      select: { status: true },
      where: { slug },
    });
    return job === null || job.status !== "active";
  }

  // where inclui status/type: se o enqueue trocou o tipo da pendência no
  // meio do envio, a pendência (agora de outro tipo) continua na fila.
  private async finish(
    id: string,
    type: string,
    status: "done" | "skipped",
    now: Date,
  ) {
    await this.database.googleIndexingQueueItem.updateMany({
      data: { pendingKey: null, processedAt: now, status },
      where: { id, status: "pending", type },
    });
  }

  private async purgeOldItemsOncePerDay(now: Date) {
    const day = startOfPacificDay(now).getTime();
    if (this.lastRetentionDay === day) return;
    this.lastRetentionDay = day;
    const cutoff = new Date(now.getTime() - RETENTION_DAYS * 86_400_000);
    const { count } = await this.database.googleIndexingQueueItem.deleteMany({
      where: {
        processedAt: { lt: cutoff },
        status: { in: ["done", "skipped"] },
      },
    });
    if (count > 0) {
      this.logger.log(`indexing queue: ${count} pendências antigas apagadas`);
    }
  }
}
