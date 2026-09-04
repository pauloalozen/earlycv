import { Inject, Injectable, Logger } from "@nestjs/common";
import type { MonitorDigestEventType } from "@prisma/client";
import { Prisma } from "@prisma/client";

import { BusinessFunnelEventService } from "../analysis-observability/business-funnel-event.service";
import { DatabaseService } from "../database/database.service";
import { MonitorEntitlementService } from "./monitor-entitlement.service";

const RESEND_EVENT_TYPE_MAP: Record<string, MonitorDigestEventType> = {
  "email.delivered": "DELIVERED",
  "email.opened": "OPENED",
  "email.clicked": "CLICKED",
  "email.bounced": "BOUNCED",
  "email.complained": "COMPLAINED",
};

const POSTHOG_EVENT_NAME: Record<MonitorDigestEventType, string> = {
  DELIVERED: "monitor_digest_delivered",
  OPENED: "monitor_digest_opened",
  CLICKED: "monitor_digest_clicked",
  BOUNCED: "monitor_digest_bounced",
  COMPLAINED: "monitor_digest_complained",
};

export type ResendWebhookPayload = {
  type: string;
  created_at?: string;
  data?: {
    email_id?: string;
    link?: string;
    [key: string]: unknown;
  };
};

export type ProcessWebhookResult = {
  processed: boolean;
  reason?: "duplicate" | "unsupported_type" | "missing_email_id";
};

@Injectable()
export class MonitorDigestWebhookService {
  private readonly logger = new Logger(MonitorDigestWebhookService.name);

  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(BusinessFunnelEventService)
    private readonly funnelEvents: BusinessFunnelEventService,
    @Inject(MonitorEntitlementService)
    private readonly entitlementService: MonitorEntitlementService,
  ) {}

  async processEvent(
    svixId: string,
    payload: ResendWebhookPayload,
  ): Promise<ProcessWebhookResult> {
    const eventType = RESEND_EVENT_TYPE_MAP[payload.type];
    if (!eventType) {
      return { processed: false, reason: "unsupported_type" };
    }

    const providerMessageId = payload.data?.email_id;
    if (!providerMessageId) {
      return { processed: false, reason: "missing_email_id" };
    }

    const digest = await this.database.monitorDigest.findFirst({
      where: { providerMessageId },
    });

    if (!digest) {
      this.logger.warn(
        `monitor digest webhook: no MonitorDigest found for providerMessageId=${providerMessageId} (type=${payload.type})`,
      );
    }

    // providerEventId (svix-id) é único por tentativa de entrega — a
    // constraint UNIQUE, não um findUnique prévio, é quem garante
    // idempotência sob concorrência real (dois webhooks do mesmo evento
    // chegando quase ao mesmo tempo). P2002 = "already processed", nunca
    // um erro de verdade.
    try {
      await this.database.monitorDigestEvent.create({
        data: {
          digestId: digest?.id ?? null,
          providerMessageId,
          providerEventId: svixId,
          type: eventType,
          metadataJson: (payload.data ?? {}) as Prisma.InputJsonValue,
          occurredAt: payload.created_at
            ? new Date(payload.created_at)
            : new Date(),
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        return { processed: false, reason: "duplicate" };
      }
      throw error;
    }

    if ((eventType === "BOUNCED" || eventType === "COMPLAINED") && digest) {
      // Higiene de lista: bounce/complaint desativa e-mails do Monitor
      // automaticamente (protege a reputação do domínio de envio). Nunca
      // desliga o Monitor in-app nem apaga recomendações.
      await this.database.monitorAlertPreference.updateMany({
        where: { userId: digest.userId },
        data: { emailEnabled: false, unsubscribedAt: new Date() },
      });
    }

    await this.recordPosthogEvent(eventType, digest, payload);

    return { processed: true };
  }

  private async recordPosthogEvent(
    eventType: MonitorDigestEventType,
    digest: { id: string; userId: string } | null,
    payload: ResendWebhookPayload,
  ) {
    const userId = digest?.userId ?? null;
    const digestId = digest?.id ?? null;

    // Sem digest (providerMessageId órfão) não há userId pra consultar
    // entitlement — nesse caso o evento sai sem monitor_access_type, o
    // que já é esperado (também não tem digestId real).
    const accessType = userId
      ? (await this.entitlementService.canUseMonitor(userId)).reason
      : null;

    await this.funnelEvents
      .record(
        {
          eventName: POSTHOG_EVENT_NAME[eventType],
          eventVersion: 1,
          metadata: {
            digestId,
            product_origin: "monitor_email",
            ...(accessType ? { monitor_access_type: accessType } : {}),
            // Abertura é indicativa, nunca "leitura real" — Apple Mail
            // Privacy Protection e bloqueio de imagem inflam/distorcem
            // open rate. Documentado aqui pra quem for consumir o evento
            // no PostHog não reinterpretar como confirmação de leitura.
            ...(eventType === "OPENED" ? { indicative: true } : {}),
            ...(eventType === "CLICKED" && payload.data?.link
              ? { link: payload.data.link }
              : {}),
          },
        },
        {
          correlationId: `monitor-digest-webhook:${digestId ?? "unknown"}`,
          ip: null,
          requestId: `monitor-digest-webhook:${digestId ?? "unknown"}`,
          routePath: "/api/monitor/webhooks/resend",
          sessionInternalId: null,
          sessionPublicToken: null,
          userAgentHash: null,
          userId,
        },
        "backend",
      )
      .catch((err: unknown) => {
        this.logger.warn(
          `[monitor] failed to record ${POSTHOG_EVENT_NAME[eventType]}: ${err}`,
        );
      });
  }
}
