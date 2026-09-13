import { randomUUID } from "node:crypto";
import { Inject, Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import type {
  MonitorAlertBulkSegment,
  MonitorDigestFrequency,
} from "@prisma/client";

import { DatabaseService } from "../database/database.service";
import { EmailConfigService } from "../email/email-config.service";
import { IngestionLockRepository } from "../ingestion/ingestion-lock.repository";
import { MonitorDigestContentService } from "./monitor-digest-content.service";
import {
  isFrequencyDueToday,
  isScheduledDailyMoment,
  scheduledForNow,
} from "./monitor-digest-schedule.util";
import { MonitorEntitlementService } from "./monitor-entitlement.service";

const LOCK_ID = "monitor-digest-scheduler";
const LOCK_TTL_MS = 5 * 60_000;
const INTERNAL_ROLES = ["admin", "superadmin"] as const;

// Espelha o seed da migration (MonitorDigestScheduleConfig id="default")
// — só usado se a linha singleton não existir por algum motivo (defesa em
// profundidade, nunca o caminho esperado em operação normal).
const DEFAULT_SCHEDULE_CONFIG = {
  dailyHour: 11,
  dailyMinute: 0,
  frequency: "DAILY" as MonitorDigestFrequency,
  intervalAnchorDate: null as Date | null,
  weeklyDayOfWeek: 1,
  timezone: "America/Sao_Paulo",
  sesRolloutSegment: null as MonitorAlertBulkSegment | null,
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
    @Inject(EmailConfigService)
    private readonly emailConfig: EmailConfigService,
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
    if (!isFrequencyDueToday(now, config)) {
      return;
    }
    await this.discoverDue(now, config);
  }

  private async loadScheduleConfig() {
    const config = await this.database.monitorDigestScheduleConfig.findUnique({
      where: { id: "default" },
    });
    return config ?? DEFAULT_SCHEDULE_CONFIG;
  }

  // Cadência é global agora (MonitorDigestScheduleConfig.frequency) —
  // todos os usuários com e-mail ativado são descobertos juntos, numa
  // única passada, sob a mesma cadência. Não existe mais "um usuário em
  // DAILY, outro em WEEKLY" — essa granularidade por usuário foi removida
  // (ver MonitorAlertPreference, que só guarda emailEnabled agora).
  async discoverDue(
    now: Date,
    config: {
      frequency: MonitorDigestFrequency;
      // Opcional só pra não forçar todo call site de teste pré-existente
      // (que não sabe nada sobre SES) a passar este campo — undefined e
      // null têm o mesmo efeito aqui: ninguém entra na coorte do SES.
      sesRolloutSegment?: MonitorAlertBulkSegment | null;
    },
  ): Promise<{ created: number }> {
    const owner = `monitor-digest-scheduler-${randomUUID()}`;
    const acquired = await this.lockRepository.acquire(
      LOCK_ID,
      owner,
      LOCK_TTL_MS,
    );
    if (!acquired) {
      return { created: 0 };
    }

    try {
      const scheduledFor = scheduledForNow(now, config.frequency);
      const created = await this.discoverForFrequency(
        config.frequency,
        scheduledFor,
        config.sesRolloutSegment ?? null,
      );
      return { created };
    } finally {
      await this.lockRepository.release(LOCK_ID, owner);
    }
  }

  // Coorte controlada do rollout SES do digest (JOB_ALERT) — ver comentário
  // de MonitorDigestScheduleConfig.sesRolloutSegment no schema. Só decide
  // QUEM entra na coorte; se SES está desligado ou a coorte ainda não foi
  // configurada (segment=null), ninguém entra — e quem fica de fora nunca
  // cai pro Resend, é gravado SKIPPED direto (ver discoverForUser).
  //
  // Escolha deliberada de NÃO reaproveitar
  // AdminMonitorService.resolveAlertRolloutSegmentUserIds: aquele método
  // hoje só resolve ALL/PAID (o branch "else" trata qualquer segmento que
  // não seja ALL como PAID) e ainda não foi atualizado para o valor
  // INTERNAL do enum — reaproveitá-lo aqui faria um sesRolloutSegment=
  // "INTERNAL" silenciosamente resolver como PAID. Resolução própria,
  // completa para os 3 valores do enum.
  private async resolveSesRolloutCohort(
    segment: MonitorAlertBulkSegment | null,
  ): Promise<Set<string> | null> {
    if (!this.emailConfig.isSesEnabled() || segment === null) {
      return new Set();
    }

    if (segment === "ALL") {
      return null;
    }

    const where =
      segment === "INTERNAL"
        ? { internalRole: { in: [...INTERNAL_ROLES] } }
        : { planPurchases: { some: { status: "completed" as const } } }; // PAID

    const users = await this.database.user.findMany({
      where,
      select: { id: true },
    });
    return new Set(users.map((u) => u.id));
  }

  private async discoverForFrequency(
    frequency: MonitorDigestFrequency,
    scheduledFor: Date,
    sesRolloutSegment: MonitorAlertBulkSegment | null,
  ): Promise<number> {
    const preferences = await this.database.monitorAlertPreference.findMany({
      where: { emailEnabled: true },
    });

    const entitledUserIds = await this.entitlementService.filterEntitledUserIds(
      preferences.map((preference) => preference.userId),
    );
    const sesCohort = await this.resolveSesRolloutCohort(sesRolloutSegment);

    let created = 0;

    for (const preference of preferences) {
      if (!entitledUserIds.has(preference.userId)) {
        continue;
      }
      const inCohort = sesCohort === null || sesCohort.has(preference.userId);
      try {
        const didCreate = await this.discoverForUser(
          preference.userId,
          frequency,
          scheduledFor,
          inCohort,
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
    inCohort: boolean,
  ): Promise<boolean> {
    const existing = await this.database.monitorDigest.findUnique({
      where: {
        userId_frequency_scheduledFor: { userId, frequency, scheduledFor },
      },
    });
    if (existing) {
      return false;
    }

    // Fora da coorte controlada do rollout SES: grava SKIPPED direto, sem
    // calcular recomendações elegíveis (a decisão de não enviar aqui não
    // depende do conteúdo) — nunca cria PENDING, que o worker processaria
    // e bateria na recusa defensiva de DefaultEmailRoutingPolicy.resolve.
    if (!inCohort) {
      await this.database.monitorDigest.create({
        data: { userId, frequency, scheduledFor, status: "SKIPPED" },
      });
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
