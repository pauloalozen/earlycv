import { Inject, Injectable, Logger, Optional } from "@nestjs/common";
import type { JobStatus, Prisma } from "@prisma/client";

import { DatabaseService } from "../database/database.service";
import {
  type EnqueueIndexingInput,
  GoogleIndexingQueueService,
  INDEXING_PRIORITY,
  type IndexingQueueClient,
} from "../google-indexing/google-indexing-queue.service";
import { WebRevalidationService } from "../web-revalidation/web-revalidation.service";

export type JobCloseStatus = Exclude<JobStatus, "active">;

type LifecycleClient = Pick<Prisma.TransactionClient, "job"> &
  IndexingQueueClient;

type IndexingQueue = {
  enqueue(
    items: EnqueueIndexingInput[],
    client?: IndexingQueueClient,
  ): Promise<number>;
};

type WebRevalidation = Pick<WebRevalidationService, "requestJobRevalidation">;

// Postgres aceita listas grandes em IN, mas lote fixo mantém cada query
// previsível mesmo fechando uma fonte inteira.
const ID_CHUNK = 1000;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size)
    out.push(items.slice(i, i + size));
  return out;
}

// Único caminho para tirar vagas do radar (inactive, removed, pending_review)
// ou devolver ao radar (active). Além de mudar o status:
// - vaga que estava active e sai: enfileira URL_DELETED na Indexing API;
// - vaga que volta a active: enfileira URL_UPDATED (o worker só envia se ela
//   estiver pública na hora do envio);
// - pede a revalidação do cache do web (ISR de /radar/[slug]).
// Com `tx`, o enfileiramento sai na mesma transação da mudança de status e a
// revalidação fica para o chamador, depois do commit (revalidateAfterCommit).
// Classe simples (sem Nest) para os scripts usarem; JobLifecycleService é o
// wrapper injetável.
export class JobLifecycle {
  private readonly logger = new Logger("JobLifecycle");

  constructor(
    private readonly database: LifecycleClient,
    private readonly indexingQueue: IndexingQueue,
    private readonly webRevalidation: WebRevalidation | null = null,
  ) {}

  async closeJobs(input: {
    where: Prisma.JobWhereInput;
    status: JobCloseStatus;
    reason: string;
    tx?: LifecycleClient;
  }): Promise<{ count: number; slugs: string[] }> {
    const client = input.tx ?? this.database;
    const jobs = await client.job.findMany({
      select: { id: true, slug: true, status: true },
      where: { AND: [input.where, { status: { not: input.status } }] },
    });
    if (jobs.length === 0) return { count: 0, slugs: [] };

    for (const ids of chunk(
      jobs.map((job) => job.id),
      ID_CHUNK,
    )) {
      await client.job.updateMany({
        data: { status: input.status },
        where: { id: { in: ids } },
      });
    }

    await this.indexingQueue.enqueue(
      jobs
        .filter((job) => job.status === "active" && job.slug)
        .map((job) => ({
          priority: INDEXING_PRIORITY.deleted,
          slug: job.slug as string,
          type: "URL_DELETED" as const,
        })),
      client,
    );

    const slugs = jobs.flatMap((job) => (job.slug ? [job.slug] : []));
    if (!input.tx) this.revalidateAfterCommit(slugs, "inactivated");
    this.logger.log(
      `closeJobs(${input.reason}): ${jobs.length} vagas -> ${input.status}`,
    );
    return { count: jobs.length, slugs };
  }

  async activateJobs(input: {
    where: Prisma.JobWhereInput;
    reason: string;
    data?: Pick<Prisma.JobUpdateManyMutationInput, "reviewApprovedAt">;
    tx?: LifecycleClient;
  }): Promise<{ count: number; slugs: string[] }> {
    const client = input.tx ?? this.database;
    const jobs = await client.job.findMany({
      select: { id: true, slug: true },
      where: { AND: [input.where, { status: { not: "active" } }] },
    });
    if (jobs.length === 0) return { count: 0, slugs: [] };

    for (const ids of chunk(
      jobs.map((job) => job.id),
      ID_CHUNK,
    )) {
      await client.job.updateMany({
        data: { ...input.data, status: "active" },
        where: { id: { in: ids } },
      });
    }

    const slugs = jobs.flatMap((job) => (job.slug ? [job.slug] : []));
    await this.indexingQueue.enqueue(
      slugs.map((slug) => ({
        priority: INDEXING_PRIORITY.newJob,
        slug,
        type: "URL_UPDATED" as const,
      })),
      client,
    );

    if (!input.tx) this.revalidateAfterCommit(slugs, "published");
    this.logger.log(`activateJobs(${input.reason}): ${jobs.length} vagas`);
    return { count: jobs.length, slugs };
  }

  // Para quem muda o status de uma vaga dentro de um update maior (o upsert
  // da ingestão): aplica os mesmos efeitos colaterais de closeJobs/
  // activateJobs. A revalidação continua com quem chama.
  async onStatusChanged(
    input: { slug: string | null; from: JobStatus; to: JobStatus },
    client: IndexingQueueClient = this.database,
  ): Promise<void> {
    if (!input.slug || input.from === input.to) return;
    if (input.from === "active") {
      await this.indexingQueue.enqueue(
        [
          {
            priority: INDEXING_PRIORITY.deleted,
            slug: input.slug,
            type: "URL_DELETED",
          },
        ],
        client,
      );
    } else if (input.to === "active") {
      await this.indexingQueue.enqueue(
        [
          {
            priority: INDEXING_PRIORITY.newJob,
            slug: input.slug,
            type: "URL_UPDATED",
          },
        ],
        client,
      );
    }
  }

  // Nunca lança: o TTL do ISR (300s) cobre qualquer falha.
  revalidateAfterCommit(
    slugs: string[],
    reason: "inactivated" | "published",
  ): void {
    if (!this.webRevalidation) return;
    for (const slug of slugs) {
      try {
        this.webRevalidation.requestJobRevalidation(slug, reason);
      } catch (error) {
        this.logger.warn(
          `web revalidation request failed for ${slug}: ${error instanceof Error ? error.message : "unknown"}`,
        );
      }
    }
  }
}

@Injectable()
export class JobLifecycleService extends JobLifecycle {
  constructor(
    @Inject(DatabaseService) database: DatabaseService,
    @Inject(GoogleIndexingQueueService)
    indexingQueue: GoogleIndexingQueueService,
    @Optional()
    @Inject(WebRevalidationService)
    webRevalidation?: WebRevalidationService,
  ) {
    super(database, indexingQueue, webRevalidation ?? null);
  }
}
