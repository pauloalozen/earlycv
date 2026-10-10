import { shouldEmitJobPosting } from "@earlycv/config/job-posting";
import { Inject, Injectable, Logger } from "@nestjs/common";
import { Prisma } from "@prisma/client";

import { DatabaseService } from "../database/database.service";
import {
  GoogleIndexingQueueService,
  INDEXING_PRIORITY,
} from "./google-indexing-queue.service";
import {
  countIndexingSentToday,
  getIndexingDailyLimit,
} from "./indexing-quota";

export { DEFAULT_INDEXING_DAILY_LIMIT as DEFAULT_BACKFILL_DAILY_LIMIT } from "./indexing-quota";

const BACKFILL_MAX_PAGES = 20;

export type IndexingStatus = "pending" | "notified" | "failed";

// Vagas que passaram pelo enrichment antes de GOOGLE_INDEXING_ENABLED ligar
// nunca foram notificadas (job-enrichment.worker.ts só enfileira no momento
// em que o enrichment termina) — esse passivo (~6000 vagas na ativação) é
// coberto aos poucos: o backfill só ENFILEIRA (prioridade de backfill, a mais
// baixa) e o GoogleIndexingQueueWorker envia respeitando a cota diária.
@Injectable()
export class GoogleIndexingBackfillService {
  private readonly logger = new Logger(GoogleIndexingBackfillService.name);

  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(GoogleIndexingQueueService)
    private readonly queueService: GoogleIndexingQueueService,
  ) {}

  private getDailyLimit(): number {
    return getIndexingDailyLimit();
  }

  // Enviadas hoje (URL_UPDATED + URL_DELETED, janela do Pacífico): é o que
  // conta contra a cota real da Indexing API.
  private async getNotifiedTodayCount(): Promise<number> {
    return countIndexingSentToday(this.database);
  }

  // Vagas elegiveis (ativas, com slug e enrichment concluido) e o log de
  // indexacao (GoogleIndexingLog nao tem FK pra Job de proposito — ver
  // schema — entao o cruzamento e por slug). Tudo resolvido no banco: nada
  // de carregar todas as vagas nem listas de slugs em memoria.
  private readonly eligibleFromSql = Prisma.sql`
    FROM "Job" j
    JOIN "JobEnrichment" e ON e."jobId" = j.id
    JOIN "Company" c ON c.id = j."companyId"`;

  // Banco de talentos sai já no SQL (é o caso comum de vaga sem
  // JobPosting); o resto de shouldEmitJobPosting é conferido em
  // getPendingSlugs, que pagina até completar o lote.
  private readonly eligibleWhereSql = Prisma.sql`
    WHERE j.slug IS NOT NULL
      AND j.status = 'active'
      AND e."enrichmentStatus" = 'COMPLETED'
      AND j."employmentType" IS DISTINCT FROM 'talent_pool'`;

  // "Notificada" = tem URL_UPDATED com sucesso DEPOIS do último URL_DELETED
  // com sucesso. Vaga inativada manda URL_DELETED (ingestion.service.ts);
  // se ela volta a ficar ativa, o URL_UPDATED antigo não vale mais — o Google
  // recebeu o pedido de remoção — e ela volta pra fila do backfill.
  private readonly notifiedSinceLastRemovalSql = Prisma.sql`EXISTS (
      SELECT 1 FROM "GoogleIndexingLog" l
      WHERE l.slug = j.slug AND l.type = 'URL_UPDATED' AND l.status = 'SUCCESS'
        AND NOT EXISTS (
          SELECT 1 FROM "GoogleIndexingLog" d
          WHERE d.slug = l.slug AND d.type = 'URL_DELETED'
            AND d.status = 'SUCCESS' AND d."createdAt" > l."createdAt"
        )
    )`;

  // Fora também quem já tem pendência na fila (enfileirada pelo enrichment
  // ou por um backfill anterior ainda não enviado).
  private readonly notNotifiedSql = Prisma.sql`
    AND NOT ${this.notifiedSinceLastRemovalSql}
    AND NOT EXISTS (
      SELECT 1 FROM "GoogleIndexingQueueItem" q WHERE q."pendingKey" = j.slug
    )`;

  // Tentativas de URL_UPDATED que contam pro status da listagem: só as
  // posteriores ao último URL_DELETED com sucesso (mesma regra acima).
  private readonly latestUpdateAttemptCte = Prisma.sql`
      WITH last_removal AS (
        SELECT slug, max("createdAt") AS "removedAt"
        FROM "GoogleIndexingLog"
        WHERE type = 'URL_DELETED' AND status = 'SUCCESS'
        GROUP BY slug
      ),
      latest AS (
        SELECT DISTINCT ON (l.slug) l.slug, l.status, l."createdAt", l."errorMsg"
        FROM "GoogleIndexingLog" l
        LEFT JOIN last_removal r ON r.slug = l.slug
        WHERE l.type = 'URL_UPDATED'
          AND (r."removedAt" IS NULL OR l."createdAt" > r."removedAt")
        ORDER BY l.slug, l."createdAt" DESC
      )`;

  // Slugs sem notificacao URL_UPDATED com sucesso valida (ver acima), das mais
  // recentes para as mais antigas, limitado ao que o lote precisa.
  async getPendingSlugs(limit: number): Promise<string[]> {
    if (limit <= 0) return [];
    // Vaga sem JobPosting nunca é enfileirada (GoogleIndexingQueueService),
    // então continua "não notificada": sem filtrar aqui, ela voltaria a
    // ocupar o começo do lote todo dia.
    const slugs: string[] = [];
    const pageSize = Math.max(limit, 100);
    for (
      let page = 0;
      page < BACKFILL_MAX_PAGES && slugs.length < limit;
      page++
    ) {
      const rows = await this.database.$queryRaw<
        Array<{
          slug: string;
          city: string | null;
          country: string | null;
          employmentType: string | null;
          state: string | null;
          workModel: string | null;
        }>
      >`
        SELECT j.slug, j.city, j.country, j."employmentType", j.state, j."workModel"
        ${this.eligibleFromSql} ${this.eligibleWhereSql} ${this.notNotifiedSql}
        ORDER BY j."firstSeenAt" DESC, j.id
        LIMIT ${pageSize} OFFSET ${page * pageSize}`;
      for (const row of rows) {
        if (slugs.length < limit && shouldEmitJobPosting(row)) {
          slugs.push(row.slug);
        }
      }
      if (rows.length < pageSize) break;
    }
    return slugs;
  }

  private async getCounts(): Promise<{ total: number; notified: number }> {
    const [row] = await this.database.$queryRaw<
      Array<{ total: number; notified: number }>
    >`
      SELECT count(*)::int AS total,
             (count(*) FILTER (WHERE ${this.notifiedSinceLastRemovalSql}))::int AS notified
      ${this.eligibleFromSql} ${this.eligibleWhereSql}`;
    return { notified: row?.notified ?? 0, total: row?.total ?? 0 };
  }

  // Enfileira até um dia de cota de vagas ainda não notificadas. O envio é
  // do GoogleIndexingQueueWorker (prioridade de backfill fica atrás de
  // remoções e de vagas novas).
  async runBackfillBatch(): Promise<{
    dailyLimit: number;
    notifiedToday: number;
    enqueued: number;
  }> {
    const dailyLimit = this.getDailyLimit();
    const notifiedToday = await this.getNotifiedTodayCount();
    const batch = await this.getPendingSlugs(dailyLimit);
    const enqueued = await this.queueService.enqueue(
      batch.map((slug) => ({
        priority: INDEXING_PRIORITY.backfill,
        slug,
        type: "URL_UPDATED" as const,
      })),
    );

    this.logger.log(
      `backfill: ${enqueued} vagas enfileiradas (notifiedToday=${notifiedToday}/${dailyLimit})`,
    );

    return { dailyLimit, enqueued, notifiedToday };
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
    // "pending" = nunca tentada desde a ultima remocao.
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
      ${this.latestUpdateAttemptCte}
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
        ${this.latestUpdateAttemptCte}
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
