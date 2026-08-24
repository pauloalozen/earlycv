import { Inject, Injectable, Logger } from "@nestjs/common";

import { DatabaseService } from "../database/database.service";
import { GoogleIndexingService } from "./google-indexing.service";

export const DEFAULT_BACKFILL_DAILY_LIMIT = 200;

// America/Sao_Paulo abandonou horario de verao em 2019 — offset fixo UTC-3
// o ano inteiro (mesma premissa de ingestion-job-schedule.util.ts).
const SAO_PAULO_OFFSET_MS = 3 * 60 * 60 * 1000;

function startOfSaoPauloDay(from: Date): Date {
  const shifted = new Date(from.getTime() - SAO_PAULO_OFFSET_MS);
  const startUtc = Date.UTC(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth(),
    shifted.getUTCDate(),
  );
  return new Date(startUtc + SAO_PAULO_OFFSET_MS);
}

export type IndexingStatus = "pending" | "notified" | "failed";

type EligibleJob = {
  id: string;
  slug: string;
  title: string;
  companyName: string;
  firstSeenAt: Date;
};

type LatestLog = {
  status: string;
  createdAt: Date;
  errorMsg: string | null;
};

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

  // Quantas notificações URL_UPDATED já tiveram sucesso hoje (dia
  // calendário em America/Sao_Paulo) — precisa entrar na conta antes de
  // rodar um novo lote, senão duas execuções no mesmo dia (agendada às 3h +
  // "Rodar agora" manual) somadas podem passar da cota real da Indexing
  // API, que é por dia, não por execução.
  private async getNotifiedTodayCount(): Promise<number> {
    return this.database.googleIndexingLog.count({
      where: {
        type: "URL_UPDATED",
        status: "SUCCESS",
        createdAt: { gte: startOfSaoPauloDay(new Date()) },
      },
    });
  }

  private async getEligibleJobs(): Promise<EligibleJob[]> {
    const jobs = await this.database.job.findMany({
      where: {
        slug: { not: null },
        status: "active",
        enrichment: { enrichmentStatus: "COMPLETED" },
      },
      select: {
        company: { select: { name: true } },
        firstSeenAt: true,
        id: true,
        slug: true,
        title: true,
      },
      orderBy: { firstSeenAt: "desc" },
    });

    return jobs
      .filter((job): job is typeof job & { slug: string } => job.slug !== null)
      .map((job) => ({
        companyName: job.company.name,
        firstSeenAt: job.firstSeenAt,
        id: job.id,
        slug: job.slug,
        title: job.title,
      }));
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

  // Última tentativa (sucesso ou erro) por slug — usada tanto pra separar
  // "nunca tentado" (pending) de "tentou e falhou" (failed) quanto pra
  // exibir o motivo do erro na listagem admin.
  private async getLatestAttemptBySlug(
    slugs: string[],
  ): Promise<Map<string, LatestLog>> {
    if (slugs.length === 0) return new Map();

    const logs = await this.database.googleIndexingLog.findMany({
      where: { slug: { in: slugs }, type: "URL_UPDATED" },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true, errorMsg: true, slug: true, status: true },
    });

    const bySlug = new Map<string, LatestLog>();
    for (const log of logs) {
      if (!bySlug.has(log.slug)) {
        bySlug.set(log.slug, {
          createdAt: log.createdAt,
          errorMsg: log.errorMsg,
          status: log.status,
        });
      }
    }
    return bySlug;
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
    notifiedToday: number;
    processed: number;
    succeeded: number;
    failed: number;
  }> {
    const dailyLimit = this.getDailyLimit();
    const notifiedToday = await this.getNotifiedTodayCount();
    const remainingToday = Math.max(0, dailyLimit - notifiedToday);
    const pendingSlugs = await this.getPendingSlugs();
    const batch = pendingSlugs.slice(0, remainingToday);
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
      `backfill batch complete: processed=${batch.length} succeeded=${succeeded} failed=${failed} notifiedToday=${notifiedToday + succeeded}/${dailyLimit} remainingAfter=${pendingSlugs.length - batch.length}`,
    );

    return {
      dailyLimit,
      failed,
      notifiedToday,
      processed: batch.length,
      succeeded,
    };
  }

  async getStatus(): Promise<{
    totalEligible: number;
    notified: number;
    pending: number;
    dailyLimit: number;
    notifiedToday: number;
    estimatedDaysRemaining: number;
    ingestionJobId: string | null;
  }> {
    const eligible = await this.getEligibleJobs();
    const notified = await this.getNotifiedSlugs(
      eligible.map((job) => job.slug),
    );
    const dailyLimit = this.getDailyLimit();
    const notifiedToday = await this.getNotifiedTodayCount();
    const pending = eligible.length - notified.size;
    // Resolvido por jobType (não pelo id fixo do seed) — se o job precisar
    // ser recriado manualmente algum dia, o botão "Rodar agora" continua
    // funcionando sem precisar tocar no frontend.
    const ingestionJob = await this.database.ingestionJob.findFirst({
      where: { jobType: "GOOGLE_INDEXING_BACKFILL" },
      select: { id: true },
    });

    return {
      dailyLimit,
      estimatedDaysRemaining: Math.max(0, Math.ceil(pending / dailyLimit)),
      ingestionJobId: ingestionJob?.id ?? null,
      notified: notified.size,
      notifiedToday,
      pending,
      totalEligible: eligible.length,
    };
  }

  async listJobsByIndexingStatus(params: {
    status: IndexingStatus;
    page: number;
    pageSize: number;
  }): Promise<{
    jobs: Array<{
      id: string;
      slug: string;
      title: string;
      companyName: string;
      firstSeenAt: Date;
      lastAttemptAt: Date | null;
      lastAttemptStatus: "SUCCESS" | "ERROR" | null;
      lastError: string | null;
    }>;
    total: number;
    page: number;
    pageSize: number;
  }> {
    const eligible = await this.getEligibleJobs();
    const latestBySlug = await this.getLatestAttemptBySlug(
      eligible.map((job) => job.slug),
    );

    const filtered = eligible.filter((job) => {
      const latest = latestBySlug.get(job.slug);
      if (params.status === "notified") return latest?.status === "SUCCESS";
      if (params.status === "failed") return latest?.status === "ERROR";
      return !latest;
    });

    const total = filtered.length;
    const start = (params.page - 1) * params.pageSize;
    const pageItems = filtered.slice(start, start + params.pageSize);

    return {
      jobs: pageItems.map((job) => {
        const latest = latestBySlug.get(job.slug) ?? null;
        return {
          companyName: job.companyName,
          firstSeenAt: job.firstSeenAt,
          id: job.id,
          lastAttemptAt: latest?.createdAt ?? null,
          lastAttemptStatus:
            (latest?.status as "SUCCESS" | "ERROR" | undefined) ?? null,
          lastError: latest?.errorMsg ?? null,
          slug: job.slug,
          title: job.title,
        };
      }),
      page: params.page,
      pageSize: params.pageSize,
      total,
    };
  }
}
