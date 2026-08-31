import { randomUUID } from "node:crypto";
import { Inject, Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import type { MonitorDigestFrequency } from "@prisma/client";

import { DatabaseService } from "../database/database.service";
import { IngestionLockRepository } from "../ingestion/ingestion-lock.repository";
import { MonitorDigestContentService } from "./monitor-digest-content.service";
import {
  isWeeklyDigestDay,
  startOfIsoWeekUtc,
  startOfUtcDay,
} from "./monitor-digest-schedule.util";
import { MonitorEntitlementService } from "./monitor-entitlement.service";

const LOCK_ID = "monitor-digest-scheduler";
const LOCK_TTL_MS = 5 * 60_000;

// Descobre QUAIS digests são devidos hoje e grava as linhas
// (MonitorDigest + MonitorDigestRecommendation) com status PENDING (ou
// SKIPPED, se não houver nada elegível) — nunca envia e-mail aqui, isso é
// responsabilidade do MonitorDigestWorker. Separar "decidir o que é
// devido" de "efetivamente enviar" segue o mesmo padrão de
// IngestionJobSchedulerService/JobEnrichmentWorker: o scheduler roda uma
// vez por dia, o worker de envio roda em lote/retry com sua própria
// cadência — uma falha de envio nunca deveria travar a próxima descoberta.
@Injectable()
export class MonitorDigestScheduler {
  private readonly logger = new Logger(MonitorDigestScheduler.name);

  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(IngestionLockRepository)
    private readonly lockRepository: IngestionLockRepository,
    @Inject(MonitorDigestContentService)
    private readonly contentService: MonitorDigestContentService,
    @Inject(MonitorEntitlementService)
    private readonly entitlementService: MonitorEntitlementService,
  ) {}

  // "0 14 * * *" em UTC = 11h em America/Sao_Paulo (UTC-3, sem horário de
  // verão hoje). O processo roda em UTC (sem TZ configurada no container),
  // então o horário-alvo precisa ser convertido aqui em vez de usar um
  // CronExpression nomeado (ex: EVERY_DAY_AT_1PM), que soa como "13h" mas
  // na prática disparava 13h UTC = 10h em Brasília.
  @Cron("0 14 * * *")
  async tick() {
    if (process.env.NODE_ENV === "test") {
      return;
    }
    await this.discoverDue(new Date());
  }

  async discoverDue(now: Date): Promise<{ daily: number; weekly: number }> {
    const owner = `monitor-digest-scheduler-${randomUUID()}`;
    const acquired = await this.lockRepository.acquire(
      LOCK_ID,
      owner,
      LOCK_TTL_MS,
    );
    if (!acquired) {
      return { daily: 0, weekly: 0 };
    }

    try {
      const daily = await this.discoverForFrequency(
        "DAILY",
        startOfUtcDay(now),
      );

      let weekly = 0;
      if (isWeeklyDigestDay(now)) {
        weekly = await this.discoverForFrequency(
          "WEEKLY",
          startOfIsoWeekUtc(now),
        );
      }

      return { daily, weekly };
    } finally {
      await this.lockRepository.release(LOCK_ID, owner);
    }
  }

  private async discoverForFrequency(
    frequency: MonitorDigestFrequency,
    scheduledFor: Date,
  ): Promise<number> {
    const preferences = await this.database.monitorAlertPreference.findMany({
      where: { emailEnabled: true, frequency },
    });

    const entitledUserIds = await this.entitlementService.filterEntitledUserIds(
      preferences.map((preference) => preference.userId),
    );

    let created = 0;

    for (const preference of preferences) {
      if (!entitledUserIds.has(preference.userId)) {
        continue;
      }
      try {
        const didCreate = await this.discoverForUser(
          preference.userId,
          frequency,
          scheduledFor,
        );
        if (didCreate) created += 1;
      } catch (error) {
        this.logger.warn(
          `failed to discover monitor digest for user ${preference.userId} (${frequency}/${scheduledFor.toISOString()}): ${error instanceof Error ? error.message : "unknown"}`,
        );
      }
    }

    return created;
  }

  // Idempotência: a existência da linha (qualquer status) pra essa chave
  // já basta pra pular — nunca recalcula recomendações elegíveis pra um
  // período já decidido, mesmo que o worker ainda não tenha enviado.
  private async discoverForUser(
    userId: string,
    frequency: MonitorDigestFrequency,
    scheduledFor: Date,
  ): Promise<boolean> {
    const existing = await this.database.monitorDigest.findUnique({
      where: {
        userId_frequency_scheduledFor: { userId, frequency, scheduledFor },
      },
    });
    if (existing) {
      return false;
    }

    const eligible =
      await this.contentService.getEligibleRecommendations(userId);

    if (eligible.length === 0) {
      await this.database.monitorDigest.create({
        data: { userId, frequency, scheduledFor, status: "SKIPPED" },
      });
      return false;
    }

    await this.database.monitorDigest.create({
      data: {
        userId,
        frequency,
        scheduledFor,
        status: "PENDING",
        recommendations: {
          create: eligible.map((recommendation) => ({
            recommendationId: recommendation.id,
          })),
        },
      },
    });

    return true;
  }
}
