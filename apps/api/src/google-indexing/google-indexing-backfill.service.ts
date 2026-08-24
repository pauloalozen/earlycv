import { Inject, Injectable, Logger } from "@nestjs/common";

import { DatabaseService } from "../database/database.service";
import { GoogleIndexingService } from "./google-indexing.service";

export const DEFAULT_BACKFILL_DAILY_LIMIT = 200;

// Vagas que passaram pelo enrichment antes de GOOGLE_INDEXING_ENABLED ligar
// nunca disparam notifyIndexing (job-enrichment.worker.ts só notifica no
// momento em que o enrichment termina) — esse passivo (~6000 vagas na
// ativação) precisa de um processo à parte pra ser coberto aos poucos,
// respeitando a cota de 200 notificações/dia da Indexing API.
@Injectable()
export class GoogleIndexingBackfillService {
  private readonly logger = new Logger(GoogleIndexingBackfillService.name);

  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(GoogleIndexingService)
    private readonly googleIndexingService: GoogleIndexingService,
  ) {}

  private getDailyLimit(): number {
    const raw = process.env.GOOGLE_INDEXING_BACKFILL_DAILY_LIMIT;
    const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
    return Number.isFinite(parsed) && parsed > 0
      ? parsed
      : DEFAULT_BACKFILL_DAILY_LIMIT;
  }

  // slugs de vagas elegíveis que já têm pelo menos uma notificação
  // URL_UPDATED com sucesso — GoogleIndexingLog não tem FK pra Job de
  // propósito (ver comentário no schema), então a interseção é feita aqui
  // em memória em vez de um NOT EXISTS no banco.
  private async getNotifiedSlugs(slugs: string[]): Promise<Set<string>> {
    if (slugs.length === 0) return new Set();

    const logs = await this.database.googleIndexingLog.findMany({
      where: { slug: { in: slugs }, type: "URL_UPDATED", status: "SUCCESS" },
      select: { slug: true },
    });
    return new Set(logs.map((log) => log.slug));
  }

  private async getEligibleJobs(): Promise<
    Array<{ slug: string; firstSeenAt: Date }>
  > {
    const jobs = await this.database.job.findMany({
      where: {
        slug: { not: null },
        status: "active",
        enrichment: { enrichmentStatus: "COMPLETED" },
      },
      select: { slug: true, firstSeenAt: true },
      orderBy: { firstSeenAt: "desc" },
    });

    return jobs
      .filter((job): job is { slug: string; firstSeenAt: Date } =>
        Boolean(job.slug),
      )
      .map((job) => ({ slug: job.slug, firstSeenAt: job.firstSeenAt }));
  }

  async getPendingSlugs(): Promise<string[]> {
    const eligible = await this.getEligibleJobs();
    const notified = await this.getNotifiedSlugs(
      eligible.map((job) => job.slug),
    );
    return eligible
      .filter((job) => !notified.has(job.slug))
      .map((job) => job.slug);
  }

  async runBackfillBatch(): Promise<{
    dailyLimit: number;
    processed: number;
    succeeded: number;
    failed: number;
  }> {
    const dailyLimit = this.getDailyLimit();
    const pendingSlugs = await this.getPendingSlugs();
    const batch = pendingSlugs.slice(0, dailyLimit);
    const runStartedAt = new Date();

    for (const slug of batch) {
      await this.googleIndexingService.notifyIndexing(slug);
    }

    const succeeded = await this.database.googleIndexingLog.count({
      where: {
        slug: { in: batch },
        type: "URL_UPDATED",
        status: "SUCCESS",
        createdAt: { gte: runStartedAt },
      },
    });
    const failed = batch.length - succeeded;

    this.logger.log(
      `backfill batch complete: processed=${batch.length} succeeded=${succeeded} failed=${failed} remainingAfter=${pendingSlugs.length - batch.length}`,
    );

    return { dailyLimit, processed: batch.length, succeeded, failed };
  }

  async getStatus(): Promise<{
    totalEligible: number;
    notified: number;
    pending: number;
    dailyLimit: number;
    estimatedDaysRemaining: number;
    ingestionJobId: string | null;
  }> {
    const eligible = await this.getEligibleJobs();
    const notified = await this.getNotifiedSlugs(
      eligible.map((job) => job.slug),
    );
    const dailyLimit = this.getDailyLimit();
    const pending = eligible.length - notified.size;
    // Resolvido por jobType (não pelo id fixo do seed) — se o job precisar
    // ser recriado manualmente algum dia, o botão "Rodar agora" continua
    // funcionando sem precisar tocar no frontend.
    const ingestionJob = await this.database.ingestionJob.findFirst({
      where: { jobType: "GOOGLE_INDEXING_BACKFILL" },
      select: { id: true },
    });

    return {
      totalEligible: eligible.length,
      notified: notified.size,
      pending,
      dailyLimit,
      estimatedDaysRemaining: Math.max(0, Math.ceil(pending / dailyLimit)),
      ingestionJobId: ingestionJob?.id ?? null,
    };
  }
}
