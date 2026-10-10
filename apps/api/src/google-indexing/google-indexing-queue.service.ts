import { shouldEmitJobPosting } from "@earlycv/config/job-posting";
import { Inject, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";

import { DatabaseService } from "../database/database.service";
import {
  buildJobUrl,
  GoogleIndexingService,
  type IndexingNotificationType,
} from "./google-indexing.service";
import {
  countIndexingSentTodayByType,
  getIndexingDailyLimit,
  INDEXING_DELETED_DAILY_FLOOR,
} from "./indexing-quota";

// Prioridade dentro de cada tipo: menor primeiro. A ordem entre tipos é do
// worker (pickBatch): UPDATED de vaga nova, DELETED (com piso diário),
// UPDATED de backfill.
export const INDEXING_PRIORITY = {
  deleted: 0,
  newJob: 10,
  backfill: 20,
} as const;

export type IndexingQueueClient = Pick<
  Prisma.TransactionClient,
  "googleIndexingLog" | "googleIndexingQueueItem" | "job"
>;

// Campos que shouldEmitJobPosting precisa (mesma regra do JSON-LD no web).
export const JOB_POSTING_ELIGIBILITY_SELECT = {
  city: true,
  country: true,
  employmentType: true,
  state: true,
  workModel: true,
} satisfies Prisma.JobSelect;

// URL_UPDATED só para página com JobPosting: banco de talentos, vaga
// estrangeira ou sem localização confiável não vão para a Indexing API.
async function hasJobPosting(
  client: Pick<IndexingQueueClient, "job">,
  slug: string,
): Promise<boolean> {
  const job = await client.job.findUnique({
    select: JOB_POSTING_ELIGIBILITY_SELECT,
    where: { slug },
  });
  return job !== null && shouldEmitJobPosting(job);
}

// URL_DELETED só para vaga que o Google já recebeu: tem URL_UPDATED com
// sucesso no log. Vaga nunca notificada fecha sem pedido de remoção (o
// noindex da página encerrada e a saída do sitemap resolvem), sem gastar
// cota.
export async function wasNotifiedToGoogle(
  client: Pick<IndexingQueueClient, "googleIndexingLog">,
  slug: string,
): Promise<boolean> {
  const log = await client.googleIndexingLog.findFirst({
    select: { id: true },
    where: { slug, status: "SUCCESS", type: "URL_UPDATED" },
  });
  return log !== null;
}

export type EnqueueIndexingInput = {
  slug: string;
  type: IndexingNotificationType;
  priority: number;
};

// Enfileira notificações da Indexing API. Uma única pendência por vaga
// (pendingKey = slug): pedido novo do mesmo tipo só pode subir a prioridade;
// de tipo diferente substitui o anterior (vaga que saiu e voltou, ou o
// contrário), que já não vale mais. Aceita o client de uma transação para o
// enfileiramento sair junto com a mudança de status da vaga.
@Injectable()
export class GoogleIndexingQueueService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(GoogleIndexingService)
    private readonly googleIndexingService: GoogleIndexingService,
  ) {}

  async enqueue(
    items: EnqueueIndexingInput[],
    client: IndexingQueueClient = this.database,
  ): Promise<number> {
    let changed = 0;
    for (const item of items) {
      if (!item.slug) continue;
      if (
        item.type === "URL_UPDATED" &&
        !(await hasJobPosting(client, item.slug))
      ) {
        continue;
      }
      if (
        item.type === "URL_DELETED" &&
        !(await wasNotifiedToGoogle(client, item.slug))
      ) {
        continue;
      }
      if (await enqueueOne(client, item)) changed += 1;
    }
    return changed;
  }

  async getPanel(): Promise<{
    enabled: boolean;
    dailyLimit: number;
    sentToday: number;
    remainingToday: number;
    sentTodayByType: { updated: number; deleted: number };
    deletedDailyFloor: number;
    pending: { updated: number; deleted: number };
    failed: number;
  }> {
    const dailyLimit = getIndexingDailyLimit();
    const [sentTodayByType, grouped, failed] = await Promise.all([
      countIndexingSentTodayByType(this.database),
      this.database.googleIndexingQueueItem.groupBy({
        by: ["type"],
        _count: { _all: true },
        where: { status: "pending" },
      }),
      this.database.googleIndexingQueueItem.count({
        where: { status: "failed" },
      }),
    ]);
    const sentToday = sentTodayByType.updated + sentTodayByType.deleted;
    const countOf = (type: IndexingNotificationType) =>
      grouped.find((row) => row.type === type)?._count._all ?? 0;

    return {
      dailyLimit,
      enabled: this.googleIndexingService.isEnabled(),
      failed,
      pending: {
        deleted: countOf("URL_DELETED"),
        updated: countOf("URL_UPDATED"),
      },
      deletedDailyFloor: INDEXING_DELETED_DAILY_FLOOR,
      remainingToday: Math.max(0, dailyLimit - sentToday),
      sentToday,
      sentTodayByType,
    };
  }
}

async function enqueueOne(
  client: IndexingQueueClient,
  item: EnqueueIndexingInput,
  retried = false,
): Promise<boolean> {
  const url = buildJobUrl(item.slug);
  const existing = await client.googleIndexingQueueItem.findUnique({
    where: { pendingKey: item.slug },
  });

  if (!existing) {
    try {
      await client.googleIndexingQueueItem.create({
        data: {
          pendingKey: item.slug,
          priority: item.priority,
          slug: item.slug,
          type: item.type,
          url,
        },
      });
      return true;
    } catch (error) {
      // Outro processo criou a pendência da mesma vaga entre o findUnique e
      // o create: refaz uma vez pelo caminho de atualização.
      if (
        !retried &&
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        return enqueueOne(client, item, true);
      }
      throw error;
    }
  }

  if (existing.type !== item.type) {
    await client.googleIndexingQueueItem.update({
      data: {
        attempts: 0,
        lastError: null,
        nextAttemptAt: new Date(),
        priority: item.priority,
        type: item.type,
        url,
      },
      where: { id: existing.id },
    });
    return true;
  }

  if (item.priority < existing.priority) {
    await client.googleIndexingQueueItem.update({
      data: { priority: item.priority, url },
      where: { id: existing.id },
    });
    return true;
  }

  return false;
}
