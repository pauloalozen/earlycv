import { Inject, Injectable, Logger } from "@nestjs/common";
import type { MonitorDigestFrequency } from "@prisma/client";

import { BusinessFunnelEventService } from "../analysis-observability/business-funnel-event.service";
import { DatabaseService } from "../database/database.service";
import { MonitorEntitlementService } from "./monitor-entitlement.service";
import { verifyMonitorUnsubscribeToken } from "./monitor-unsubscribe-token";

@Injectable()
export class MonitorAlertPreferenceService {
  private readonly logger = new Logger(MonitorAlertPreferenceService.name);

  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(BusinessFunnelEventService)
    private readonly funnelEvents: BusinessFunnelEventService,
    @Inject(MonitorEntitlementService)
    private readonly entitlementService: MonitorEntitlementService,
  ) {}

  // Self-heal, mesmo padrão de UserRadarProfileService.getProfile: usuário
  // que nunca configurou preferência (ex: ativou o Monitor antes desta
  // fase existir) ganha o default DAILY+enabled na primeira leitura, sem
  // exigir uma migração de dados.
  async getOrCreate(userId: string) {
    const existing = await this.database.monitorAlertPreference.findUnique({
      where: { userId },
    });
    if (existing) return existing;

    return this.database.monitorAlertPreference.upsert({
      where: { userId },
      create: { userId },
      update: {},
    });
  }

  async update(
    userId: string,
    input: { emailEnabled?: boolean; frequency?: MonitorDigestFrequency },
  ) {
    await this.getOrCreate(userId);

    return this.database.monitorAlertPreference.update({
      where: { userId },
      data: {
        ...(input.emailEnabled !== undefined
          ? { emailEnabled: input.emailEnabled }
          : {}),
        ...(input.frequency !== undefined
          ? { frequency: input.frequency }
          : {}),
      },
    });
  }

  // SÓ verifica — nunca muta nada. Usado pelo GET /monitor/unsubscribe
  // (a página de confirmação): scanners de segurança, preview de cliente
  // de e-mail e ferramentas antiphishing acessam links GET automaticamente
  // sem intenção do usuário, então GET nunca pode ter efeito colateral
  // (essa era a falha corrigida nesta revisão — GET chegou a desativar
  // e-mail sozinho). O cancelamento de fato só acontece via
  // unsubscribeByToken, chamado a partir de POST.
  verifyUnsubscribeToken(token: string): string | null {
    return verifyMonitorUnsubscribeToken(token);
  }

  // Chamado pelo POST público de unsubscribe (sem login) — inclui o
  // one-click do RFC 8058 (List-Unsubscribe-Post) e o clique manual no
  // botão de confirmação da página. Idempotente: reenviar o mesmo POST
  // (retry de cliente de e-mail, duplo clique) sempre resulta no mesmo
  // estado final e nunca falha por "já estava cancelado" — token inválido
  // -> null, pro controller devolver "link inválido" sem vazar detalhe.
  // Desativa e-mail e marca unsubscribedAt — NUNCA desliga o Monitor
  // in-app, NUNCA apaga recomendações, NUNCA muda frequency (só o
  // interruptor emailEnabled).
  async unsubscribeByToken(token: string) {
    const userId = verifyMonitorUnsubscribeToken(token);
    if (!userId) return null;

    const preference = await this.getOrCreate(userId);

    // Já cancelado: no-op real, preserva o unsubscribedAt original em vez
    // de "recancelar" com um timestamp novo a cada retry/duplo clique —
    // isso é o que "idempotente" significa de verdade aqui, não só "não
    // dá erro".
    if (!preference.emailEnabled && preference.unsubscribedAt) {
      await this.recordUnsubscribed(userId);
      return preference;
    }

    const updated = await this.database.monitorAlertPreference.update({
      where: { userId },
      data: { emailEnabled: false, unsubscribedAt: new Date() },
    });

    await this.recordUnsubscribed(userId);

    return updated;
  }

  private async recordUnsubscribed(userId: string) {
    const { reason: accessType } =
      await this.entitlementService.canUseMonitor(userId);
    await this.funnelEvents
      .record(
        {
          eventName: "monitor_digest_unsubscribed",
          eventVersion: 1,
          idempotencyKey: `monitor_digest_unsubscribed:${userId}`,
          metadata: {
            product_origin: "monitor_email",
            monitor_access_type: accessType,
          },
        },
        {
          correlationId: `monitor-unsubscribe:${userId}`,
          ip: null,
          requestId: `monitor-unsubscribe:${userId}`,
          routePath: "/api/monitor/unsubscribe",
          sessionInternalId: null,
          sessionPublicToken: null,
          userAgentHash: null,
          userId,
        },
        "backend",
      )
      .catch((err: unknown) => {
        this.logger.warn(
          `[monitor] failed to record monitor_digest_unsubscribed: ${err}`,
        );
      });
  }
}
