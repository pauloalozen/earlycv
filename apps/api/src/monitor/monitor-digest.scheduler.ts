import { randomUUID } from "node:crypto";
import { Inject, Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import type {
  MonitorAlertBulkSegment,
  MonitorDigestFrequency,
} from "@prisma/client";

import { DatabaseService } from "../database/database.service";
import type { EmailBulkSendMode } from "../email/email.types";
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
// profundidade, nunca o caminho esperado em operação normal). sesMode
// LEGACY_RESEND aqui é o mesmo default seguro da coluna no banco —
// preserva o comportamento de produção atual mesmo nesse caminho raro.
const DEFAULT_SCHEDULE_CONFIG = {
  dailyHour: 11,
  dailyMinute: 0,
  frequency: "DAILY" as MonitorDigestFrequency,
  intervalAnchorDate: null as Date | null,
  weeklyDayOfWeek: 1,
  timezone: "America/Sao_Paulo",
  sesMode: "LEGACY_RESEND" as EmailBulkSendMode,
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
      // Ambos opcionais só pra não forçar todo call site de teste
      // pré-existente (que não sabe nada sobre SES) a passar estes campos
      // — omitidos, o efeito é idêntico ao default seguro da coluna real
      // (LEGACY_RESEND, todo elegível via Resend).
      sesMode?: EmailBulkSendMode | null;
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
        config.sesMode ?? "LEGACY_RESEND",
        config.sesRolloutSegment ?? null,
      );
      return { created };
    } finally {
      await this.lockRepository.release(LOCK_ID, owner);
    }
  }

  // Quem entra na coorte de envio deste ciclo — ver comentário completo de
  // MonitorDigestScheduleConfig.sesMode/sesRolloutSegment no schema.
  // null = todo mundo (nenhuma gate necessária); Set vazio = ninguém.
  //   LEGACY_RESEND / SES_LIVE -> todo elegível (null).
  //   PAUSED                  -> ninguém (Set vazio).
  //   SES_ROLLOUT              -> resolve o segmento (ver abaixo).
  //
  // Escolha deliberada de NÃO reaproveitar
  // AdminMonitorService.resolveAlertRolloutSegmentUserIds pra SES_ROLLOUT:
  // aquele método hoje só resolve ALL/PAID (o branch "else" trata qualquer
  // segmento que não seja ALL como PAID) e não é atualizado nesta entrega
  // — reaproveitá-lo aqui faria um sesRolloutSegment="INTERNAL"
  // silenciosamente resolver como PAID. Resolução própria, completa para
  // os 3 valores do enum.
  private async resolveCohort(
    sesMode: EmailBulkSendMode,
    segment: MonitorAlertBulkSegment | null,
  ): Promise<Set<string> | null> {
    if (sesMode === "PAUSED") {
      return new Set();
    }

    if (sesMode === "LEGACY_RESEND" || sesMode === "SES_LIVE") {
      return null;
    }

    // SES_ROLLOUT
    if (segment === null) {
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
    sesMode: EmailBulkSendMode,
    sesRolloutSegment: MonitorAlertBulkSegment | null,
  ): Promise<number> {
    const preferences = await this.database.monitorAlertPreference.findMany({
      where: { emailEnabled: true },
    });

    const entitledUserIds = await this.entitlementService.filterEntitledUserIds(
      preferences.map((preference) => preference.userId),
    );
    const cohort = await this.resolveCohort(sesMode, sesRolloutSegment);
    // lastError só pra observabilidade (o worker/admin não interpretam o
    // texto) — diferencia "pausado por modo" de "elegível mas fora da
    // coorte do rollout", os dois casos em que cohort exclui alguém.
    const outOfCohortReason =
      sesMode === "PAUSED" ? "ses_mode_paused" : "ses_rollout_outside_cohort";

    let created = 0;

    for (const preference of preferences) {
      if (!entitledUserIds.has(preference.userId)) {
        continue;
      }
      const inCohort = cohort === null || cohort.has(preference.userId);
      try {
        const didCreate = await this.discoverForUser(
          preference.userId,
          frequency,
          scheduledFor,
          inCohort,
          outOfCohortReason,
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

  // Idempotência: a existência de QUALQUER digest pra essa chave (de
  // qualquer source, inclusive um disparo manual do admin no mesmo dia)
  // já basta pra pular — nunca recalcula recomendações elegíveis pra um
  // período já decidido, mesmo que o worker ainda não tenha enviado.
  // findFirst (não findUnique): a chave só é única no banco pra
  // source=SCHEDULER (índice parcial, ver schema.prisma) — disparos
  // manuais podem acumular várias linhas pra essa mesma chave, e este
  // check precisa continuar enxergando todas elas, não só a do
  // scheduler.
  private async discoverForUser(
    userId: string,
    frequency: MonitorDigestFrequency,
    scheduledFor: Date,
    inCohort: boolean,
    outOfCohortReason: string,
  ): Promise<boolean> {
    const existing = await this.database.monitorDigest.findFirst({
      where: { userId, frequency, scheduledFor },
    });
    if (existing) {
      return false;
    }

    // Fora da coorte deste ciclo (modo pausado, ou fora do segmento do
    // rollout SES): grava SKIPPED direto, com o motivo em lastError, sem
    // calcular recomendações elegíveis (a decisão de não enviar aqui não
    // depende do conteúdo) — nunca cria PENDING, que o worker processaria
    // à toa.
    if (!inCohort) {
      await this.database.monitorDigest.create({
        data: {
          userId,
          frequency,
          scheduledFor,
          status: "SKIPPED",
          lastError: outOfCohortReason,
        },
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
