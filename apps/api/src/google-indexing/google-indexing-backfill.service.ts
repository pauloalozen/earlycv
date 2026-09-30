import { Inject, Injectable, Logger } from "@nestjs/common";
import { Prisma } from "@prisma/client";

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

  // Vagas elegiveis (ativas, com slug e enrichment concluido) e o log de
  // indexacao (GoogleIndexingLog nao tem FK pra Job de proposito — ver
  // schema — entao o cruzamento e por slug). Tudo resolvido no banco: nada
  // de carregar todas as vagas nem listas de slugs em memoria.
  private readonly eligibleFromSql = Prisma.sql`
    FROM "Job" j
    JOIN "JobEnrichment" e ON e."jobId" = j.id
    JOIN "Company" c ON c.id = j."companyId"`;

  private readonly eligibleWhereSql = Prisma.sql`
    WHERE j.slug IS NOT NULL
      AND j.status = 'active'
      AND e."enrichmentStatus" = 'COMPLETED'`;

  private readonly notNotifiedSql = Prisma.sql`
    AND NOT EXISTS (
      SELECT 1 FROM "GoogleIndexingLog" l
      WHERE l.slug = j.slug AND l.type = 'URL_UPDATED' AND l.status = 'SUCCESS'
    )`;

  // Slugs ainda sem nenhuma notificacao URL_UPDATED com sucesso, das mais
  // recentes para as mais antigas, limitado ao que o lote precisa.
  async getPendingSlugs(limit: number): Promise<string[]> {
    if (limit <= 0) return [];
    const rows = await this.database.$queryRaw<Array<{ slug: string }>>`
      SELECT j.slug ${this.eligibleFromSql} ${this.eligibleWhereSql} ${this.notNotifiedSql}
      ORDER BY j."firstSeenAt" DESC
      LIMIT ${limit}`;
    return rows.map((row) => row.slug);
  }

  private async getCounts(): Promise<{ total: number; notified: number }> {
    const [row] = await this.database.$queryRaw<
      Array<{ total: number; notified: number }>
    >`
      SELECT count(*)::int AS total,
             (count(*) FILTER (WHERE EXISTS (
               SELECT 1 FROM "GoogleIndexingLog" l
               WHERE l.slug = j.slug AND l.type = 'URL_UPDATED'
                 AND l.status = 'SUCCESS'
             )))::int AS notified
      ${this.eligibleFromSql} ${this.eligibleWhereSql}`;
    return { notified: row?.notified ?? 0, total: row?.total ?? 0 };
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
    const batch = await this.getPendingSlugs(remainingToday);
    const runStartedAt = new Date();
    let processed = 0;

    // Achado real: quando a cota DIARIA da Indexing API estoura no meio do
    // lote (ver comentario em getNotifiedTodayCount — nosso "dia" vira 3h
    // antes do dia de cota do Google), continuar batendo nos itens
    // restantes so gera falha garantida item a item, sem chance de
    // recuperar nessa mesma execucao. Corta o lote assim que detecta isso
    // em vez de gastar o resto em chamadas inuteis.
    for (const slug of batch) {
      processed += 1;
      const result = await this.googleIndexingService.notifyIndexing(slug);
      if (result.quotaExceeded) {
        this.logger.warn(
          `backfill batch interrompido: cota diaria da Indexing API estourada apos ${processed}/${batch.length} itens`,
        );
        break;
      }
    }

    const succeeded = await this.database.googleIndexingLog.count({
      where: {
        slug: { in: batch.slice(0, processed) },
        type: "URL_UPDATED",
        status: "SUCCESS",
        createdAt: { gte: runStartedAt },
      },
    });
    const failed = processed - succeeded;

    this.logger.log(
      `backfill batch complete: processed=${processed} succeeded=${succeeded} failed=${failed} notifiedToday=${notifiedToday + succeeded}/${dailyLimit} batchSize=${batch.length}`,
    );

    return {
      dailyLimit,
      failed,
      notifiedToday,
      processed,
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
    const counts = await this.getCounts();
    const dailyLimit = this.getDailyLimit();
    const notifiedToday = await this.getNotifiedTodayCount();
    const pending = counts.total - counts.notified;
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
      notified: counts.notified,
      notifiedToday,
      pending,
      totalEligible: counts.total,
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
    const pageSize = Math.min(100, Math.max(1, params.pageSize));
    const offset = (Math.max(1, params.page) - 1) * pageSize;
    // "notified" = ultima tentativa com sucesso; "failed" = ultima com erro;
    // "pending" = nunca tentada (mesma semantica de antes).
    const bucket =
      params.status === "notified"
        ? Prisma.sql`AND lt.status = 'SUCCESS'`
        : params.status === "failed"
          ? Prisma.sql`AND lt.status = 'ERROR'`
          : Prisma.sql`AND lt.slug IS NULL`;

    const rows = await this.database.$queryRaw<
      Array<{
        companyName: string;
        firstSeenAt: Date;
        id: string;
        lastAttemptAt: Date | null;
        lastAttemptStatus: string | null;
        lastError: string | null;
        slug: string;
        title: string;
        total: number;
      }>
    >`
      WITH latest AS (
        SELECT DISTINCT ON (slug) slug, status, "createdAt", "errorMsg"
        FROM "GoogleIndexingLog"
        WHERE type = 'URL_UPDATED'
        ORDER BY slug, "createdAt" DESC
      )
      SELECT j.id, j.slug, j.title, c.name AS "companyName",
             j."firstSeenAt", lt."createdAt" AS "lastAttemptAt",
             lt.status AS "lastAttemptStatus", lt."errorMsg" AS "lastError",
             (count(*) OVER ())::int AS total
      ${this.eligibleFromSql}
      LEFT JOIN latest lt ON lt.slug = j.slug
      ${this.eligibleWhereSql}
      ${bucket}
      ORDER BY j."firstSeenAt" DESC, j.id
      LIMIT ${pageSize} OFFSET ${offset}`;

    let total = rows[0]?.total ?? 0;
    if (rows.length === 0 && offset > 0) {
      // Pagina alem do fim: ainda devolve o total real do balde.
      const [row] = await this.database.$queryRaw<Array<{ total: number }>>`
        WITH latest AS (
          SELECT DISTINCT ON (slug) slug, status
          FROM "GoogleIndexingLog"
          WHERE type = 'URL_UPDATED'
          ORDER BY slug, "createdAt" DESC
        )
        SELECT count(*)::int AS total
        ${this.eligibleFromSql}
        LEFT JOIN latest lt ON lt.slug = j.slug
        ${this.eligibleWhereSql}
        ${bucket}`;
      total = row?.total ?? 0;
    }

    return {
      jobs: rows.map((row) => ({
        companyName: row.companyName,
        firstSeenAt: row.firstSeenAt,
        id: row.id,
        lastAttemptAt: row.lastAttemptAt,
        lastAttemptStatus:
          (row.lastAttemptStatus as "SUCCESS" | "ERROR" | null) ?? null,
        lastError: row.lastError,
        slug: row.slug,
        title: row.title,
      })),
      page: params.page,
      pageSize,
      total,
    };
  }
}
