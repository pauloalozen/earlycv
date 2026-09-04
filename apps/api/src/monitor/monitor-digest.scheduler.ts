import { randomUUID } from "node:crypto";
import { Inject, Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import type { MonitorDigestFrequency } from "@prisma/client";

import { DatabaseService } from "../database/database.service";
import { IngestionLockRepository } from "../ingestion/ingestion-lock.repository";
import { MonitorDigestContentService } from "./monitor-digest-content.service";
import {
  isScheduledDailyMoment,
  isWeeklyDigestDay,
  startOfIsoWeekUtc,
  startOfUtcDay,
} from "./monitor-digest-schedule.util";
import { MonitorEntitlementService } from "./monitor-entitlement.service";

const LOCK_ID = "monitor-digest-scheduler";
const LOCK_TTL_MS = 5 * 60_000;

// Espelha o seed da migration (MonitorDigestScheduleConfig id="default")
// — só usado se a linha singleton não existir por algum motivo (defesa em
// profundidade, nunca o caminho esperado em operação normal).
const DEFAULT_SCHEDULE_CONFIG = {
  dailyHour: 11,
  dailyMinute: 0,
  weeklyDayOfWeek: 1,
  timezone: "America/Sao_Paulo",
};

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

  // Polling por minuto em vez de um único @Cron fixo: assim o horário
  // configurado em MonitorDigestScheduleConfig (editável via
  // /admin/alerta-vagas) vale sem precisar reiniciar o serviço. O custo é
  // desprezível (1 SELECT singleton + comparação de hora/minuto por
  // minuto) — mesmo raciocínio de custo do MonitorDigestWorker, que já
  // faz polling a cada 30s. Deliberadamente NÃO usa NestJS
  // SchedulerRegistry pra registrar/desregistrar um cron dinâmico: mais
  // simples de revisar e sem risco de bugar o boot do serviço.
  @Cron("0 * * * * *")
  async tick() {
    if (process.env.NODE_ENV === "test") {
      return;
    }
    const now = new Date();
    const config = await this.loadScheduleConfig();
    if (!isScheduledDailyMoment(now, config)) {
      return;
    }
    await this.discoverDue(now, config.weeklyDayOfWeek);
  }

  private async loadScheduleConfig() {
    const config = await this.database.monitorDigestScheduleConfig.findUnique({
      where: { id: "default" },
    });
    return config ?? DEFAULT_SCHEDULE_CONFIG;
  }

  async discoverDue(
    now: Date,
    weeklyDayOfWeek = 1,
  ): Promise<{ daily: number; weekly: number }> {
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
      if (isWeeklyDigestDay(now, weeklyDayOfWeek)) {
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
