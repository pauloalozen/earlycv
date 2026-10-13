import { Inject, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";

import { DatabaseService } from "../database/database.service";
import {
  buildJobUrl,
  GoogleIndexingService,
  type IndexingNotificationType,
} from "./google-indexing.service";
import { INDEXING_EXPIRED_REASON } from "./google-indexing-queue.worker";
import {
  countIndexingSentToday,
  getIndexingDailyLimit,
  startOfPacificDay,
} from "./indexing-quota";

// Prioridade de envio: menor primeiro. Remoção vem antes de tudo (vaga fora
// do ar indexada é pior que vaga nova demorando a aparecer).
export const INDEXING_PRIORITY = {
  deleted: 0,
  newJob: 10,
  backfill: 20,
} as const;

export type IndexingQueueClient = Pick<
  Prisma.TransactionClient,
  "googleIndexingQueueItem"
>;

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
      if (await enqueueOne(client, item)) changed += 1;
    }
    return changed;
  }

  async getPanel(): Promise<{
    enabled: boolean;
    dailyLimit: number;
    sentToday: number;
    remainingToday: number;
    pending: { updated: number; deleted: number };
    failed: number;
    expiredToday: number;
  }> {
    const dailyLimit = getIndexingDailyLimit();
    const [sentToday, grouped, failed, expiredToday] = await Promise.all([
      countIndexingSentToday(this.database),
      this.database.googleIndexingQueueItem.groupBy({
        by: ["type"],
        _count: { _all: true },
        where: { status: "pending" },
      }),
      this.database.googleIndexingQueueItem.count({
        where: { status: "failed" },
      }),
      this.database.googleIndexingQueueItem.count({
        where: {
          lastError: INDEXING_EXPIRED_REASON,
          processedAt: { gte: startOfPacificDay(new Date()) },
          status: "skipped",
          type: "URL_DELETED",
        },
      }),
    ]);
    const countOf = (type: IndexingNotificationType) =>
      grouped.find((row) => row.type === type)?._count._all ?? 0;

    return {
      dailyLimit,
      enabled: this.googleIndexingService.isEnabled(),
      expiredToday,
      failed,
      pending: {
        deleted: countOf("URL_DELETED"),
        updated: countOf("URL_UPDATED"),
      },
      remainingToday: Math.max(0, dailyLimit - sentToday),
      sentToday,
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
      // createdAt reinicia: é uma pendência nova (a validade do DELETED conta
      // a partir daqui).
      data: {
        attempts: 0,
        createdAt: new Date(),
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
