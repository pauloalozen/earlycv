import type { PrismaClient } from "@prisma/client";

import type { DatabaseService } from "../database/database.service";
import { GoogleIndexingService } from "../google-indexing/google-indexing.service";
import { GoogleIndexingQueueService } from "../google-indexing/google-indexing-queue.service";
import {
  JobLifecycle,
  type JobLifecycleService,
} from "../jobs/job-lifecycle.service";

// JobLifecycle para scripts (fora do Nest): mesma mudança de status e mesmo
// enfileiramento na Indexing API da API. Sem revalidação do cache do front:
// o script termina antes dos envios em segundo plano, e o TTL do ISR (300s)
// cobre.
export function buildScriptJobLifecycle(
  prisma: PrismaClient,
): JobLifecycleService {
  const database = prisma as unknown as DatabaseService;
  const indexingQueue = new GoogleIndexingQueueService(
    database,
    new GoogleIndexingService(database),
  );
  return new JobLifecycle(
    database,
    indexingQueue,
    null,
  ) as unknown as JobLifecycleService;
}
