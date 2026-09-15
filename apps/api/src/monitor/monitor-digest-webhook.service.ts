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

// SES publica "Send"/"Reject" além dos 5 tipos que o Resend também tem —
// são os únicos relevantes pra resolver um MonitorDigest preso em
// OUTCOME_UNKNOWN (ver resolveOutcomeUnknownIfApplicable abaixo). Resend
// nunca precisou disso porque a resposta HTTP síncrona dele já confirma.
const SES_EVENT_TYPE_MAP: Record<string, MonitorDigestEventType> = {
  Send: "SENT",
  Delivery: "DELIVERED",
  Open: "OPENED",
  Click: "CLICKED",
  Bounce: "BOUNCED",
  Complaint: "COMPLAINED",
  Reject: "REJECTED",
};

// Exportado só pra teste — garante que
// monitor-digest-webhook.service.registry.spec.ts valide TODO nome de
// evento que este service de fato emite contra o registry versionado
// real (analysis-event-version.registry.ts), a partir da mesma fonte de
// verdade, nunca uma lista duplicada que poderia divergir e mascarar um
// evento novo sem entrada no registry (foi exatamente isso que causou o
// "business funnel event is missing from event version registry" visto
// em produção — monitor_digest_provider_accepted/rejected, os dois
// eventos novos do fluxo SES, não tinham entrada nenhuma).
export const POSTHOG_EVENT_NAME: Record<MonitorDigestEventType, string> = {
  DELIVERED: "monitor_digest_delivered",
  OPENED: "monitor_digest_opened",
  CLICKED: "monitor_digest_clicked",
  BOUNCED: "monitor_digest_bounced",
  COMPLAINED: "monitor_digest_complained",
  SENT: "monitor_digest_provider_accepted",
  REJECTED: "monitor_digest_provider_rejected",
};

// Eventos que CONFIRMAM o que aconteceu com o envio — usados só pra
// resolver um MonitorDigest que ficou em OUTCOME_UNKNOWN (timeout/erro de
// rede na resposta síncrona). SENT/DELIVERED confirmam que foi aceito;
// BOUNCED/COMPLAINED/REJECTED confirmam que não foi entregue.
const OUTCOME_UNKNOWN_RESOLVES_TO_SENT = new Set<MonitorDigestEventType>([
  "SENT",
  "DELIVERED",
]);
const OUTCOME_UNKNOWN_RESOLVES_TO_FAILED = new Set<MonitorDigestEventType>([
  "BOUNCED",
  "COMPLAINED",
  "REJECTED",
]);

export type ResendWebhookPayload = {
  type: string;
  created_at?: string;
  data?: {
    email_id?: string;
    link?: string;
    [key: string]: unknown;
  };
};

// Formato documentado pela AWS ("Contents of event data that Amazon SES
// publishes") — só os campos que este service de fato usa.
export type SesEventPayload = {
  eventType: string;
  mail?: {
    messageId?: string;
    // Timestamp de quando o e-mail foi ENVIADO — igual em todo evento
    // publicado pro mesmo e-mail (Send/Delivery/Open/Click/...), nunca o
    // momento do evento em si. Só correto usar como occurredAt pro
    // próprio evento Send/Reject (ver eventOccurredAt abaixo).
    timestamp?: string;
    // Cada tag pode ter múltiplos valores (por isso array) — nós só
    // emitimos um valor por tag ao enviar (ver email.types.ts), mas o
    // formato do lado da AWS sempre é lista.
    tags?: Record<string, string[]>;
  };
  delivery?: { timestamp?: string };
  open?: { timestamp?: string };
  click?: { link?: string; timestamp?: string };
  bounce?: { timestamp?: string };
  complaint?: { timestamp?: string };
  [key: string]: unknown;
};

// mail.timestamp é o momento do ENVIO, repetido idêntico em todo evento
// publicado sobre o mesmo e-mail — usá-lo direto como occurredAt fazia
// Delivery/Open/Click/Bounce/Complaint ficarem todos com o mesmo horário
// do Send original (bug real visto em produção: timeline exibindo 2
// "Aberto" e um "Clicado" no mesmo segundo do envio, e a listagem do
// admin escolhendo o evento errado como "último evento" por causa do
// empate no timestamp). Cada tipo de evento carrega seu PRÓPRIO
// timestamp no objeto homônimo (delivery.timestamp, open.timestamp,
// etc. — formato documentado pela AWS); só Send/Reject não têm um campo
// dedicado (acontecem no instante do envio mesmo), por isso caem no
// fallback de mail.timestamp. Exportado só pra teste.
export function resolveSesEventOccurredAt(payload: SesEventPayload): Date {
  const eventKey = payload.eventType.toLowerCase();
  const eventTimestamp = (
    payload as Record<string, { timestamp?: string } | undefined>
  )[eventKey]?.timestamp;
  if (eventTimestamp) {
    return new Date(eventTimestamp);
  }
  if (payload.mail?.timestamp) {
    return new Date(payload.mail.timestamp);
  }
  return new Date();
}

export type ProcessWebhookResult = {
  processed: boolean;
  reason?:
    | "duplicate"
    | "unsupported_type"
    | "missing_email_id"
    | "unsupported_correlation_type";
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
          provider: "RESEND",
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
      // desliga o Monitor in-app nem apaga recomendações. suppressionReason
      // distingue isso de um unsubscribe voluntário (ver
      // MonitorAlertPreferenceService.unsubscribeByToken) — os dois usam
      // emailEnabled=false + unsubscribedAt idênticos, sem essa coluna o
      // admin não tinha como separar "cancelou" de "e-mail rejeitado".
      await this.database.monitorAlertPreference.updateMany({
        where: { userId: digest.userId },
        data: {
          emailEnabled: false,
          unsubscribedAt: new Date(),
          suppressionReason: eventType === "BOUNCED" ? "BOUNCED" : "COMPLAINED",
        },
      });
    }

    await this.recordPosthogEvent(eventType, digest, "RESEND", {
      link: payload.data?.link,
      routePath: "/api/monitor/webhooks/resend",
    });

    return { processed: true };
  }

  // Evento SES via SNS (ver monitor-public.controller.ts e
  // ses-webhook-verifier.ts — assinatura/TopicArn já validados antes de
  // chegar aqui). snsMessageId é a chave de idempotência (equivalente ao
  // svix-id do Resend): SNS pode reentregar a mesma notificação, sempre
  // com o mesmo MessageId de topo.
  async processSesEvent(
    snsMessageId: string,
    payload: SesEventPayload,
  ): Promise<ProcessWebhookResult> {
    const eventType = SES_EVENT_TYPE_MAP[payload.eventType];
    if (!eventType) {
      return { processed: false, reason: "unsupported_type" };
    }

    // Este webhook só processa e-mails do Monitor (correlationType ===
    // "MONITOR_DIGEST", setado em monitor-digest-email.service.ts). Toda
    // categoria de envio em massa via SES usa o mesmo Configuration
    // Set/tópico SNS (ver EmailConfigService.getSesSenderProfile) — um
    // correlationType ausente ou de outra categoria (futuro
    // PRODUCT_ANNOUNCEMENT/MARKETING/ADMIN_COMMUNICATION) é ignorado com
    // segurança aqui: nunca tenta localizar MonitorDigest, nunca grava
    // MonitorDigestEvent, nunca responde erro — cada categoria futura terá
    // seu próprio processamento de evento, quando existir.
    const correlationType = payload.mail?.tags?.correlationType?.[0];
    if (correlationType !== "MONITOR_DIGEST") {
      return { processed: false, reason: "unsupported_correlation_type" };
    }

    const providerMessageId = payload.mail?.messageId;
    if (!providerMessageId) {
      return { processed: false, reason: "missing_email_id" };
    }

    // Correlação: tag correlationId primeiro (sobrevive mesmo se
    // providerMessageId nunca foi persistido — caso clássico de
    // OUTCOME_UNKNOWN, onde a resposta síncrona do SendEmailCommand se
    // perdeu antes de gravarmos o MessageId), providerMessageId como
    // fallback (mesmo padrão do Resend).
    const correlationId = payload.mail?.tags?.correlationId?.[0];
    const digest = correlationId
      ? await this.database.monitorDigest.findUnique({
          where: { id: correlationId },
        })
      : await this.database.monitorDigest.findFirst({
          where: { providerMessageId },
        });

    if (!digest) {
      this.logger.warn(
        `ses digest webhook: no MonitorDigest found (tag correlationId=${correlationId ?? "none"}, providerMessageId=${providerMessageId}, type=${payload.eventType})`,
      );
    }

    try {
      await this.database.monitorDigestEvent.create({
        data: {
          digestId: digest?.id ?? null,
          providerMessageId,
          providerEventId: snsMessageId,
          type: eventType,
          provider: "SES",
          metadataJson: payload as unknown as Prisma.InputJsonValue,
          occurredAt: resolveSesEventOccurredAt(payload),
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

    if (digest) {
      await this.resolveOutcomeUnknownIfApplicable(digest, eventType);
    }

    if ((eventType === "BOUNCED" || eventType === "COMPLAINED") && digest) {
      // Mesma higiene de lista que o Resend já faz (ver comentário acima).
      await this.database.monitorAlertPreference.updateMany({
        where: { userId: digest.userId },
        data: {
          emailEnabled: false,
          unsubscribedAt: new Date(),
          suppressionReason: eventType === "BOUNCED" ? "BOUNCED" : "COMPLAINED",
        },
      });
    }

    await this.recordPosthogEvent(eventType, digest, "SES", {
      link: payload.click?.link,
      routePath: "/api/monitor/webhooks/ses",
    });

    return { processed: true };
  }

  // Só age se o digest ainda estiver em OUTCOME_UNKNOWN — pra qualquer
  // outro status (já SENT/FAILED/SKIPPED), o evento só é registrado em
  // MonitorDigestEvent (acima) pra observabilidade, sem mexer no status.
  // Isto é o que evita o digest ficar preso esperando a janela do
  // MonitorDigestOutcomeReconciler quando o provider já respondeu.
  private async resolveOutcomeUnknownIfApplicable(
    digest: { id: string; status: string; sentAt: Date | null },
    eventType: MonitorDigestEventType,
  ) {
    if (digest.status !== "OUTCOME_UNKNOWN") {
      return;
    }

    if (OUTCOME_UNKNOWN_RESOLVES_TO_SENT.has(eventType)) {
      await this.database.monitorDigest.update({
        where: { id: digest.id },
        data: {
          status: "SENT",
          sentAt: digest.sentAt ?? new Date(),
          provider: "SES",
          outcomeUnknownAt: null,
          lastError: null,
        },
      });
      return;
    }

    if (OUTCOME_UNKNOWN_RESOLVES_TO_FAILED.has(eventType)) {
      await this.database.monitorDigest.update({
        where: { id: digest.id },
        data: {
          status: "FAILED",
          provider: "SES",
          outcomeUnknownAt: null,
          lastError: `outcome resolved via ${eventType} event`,
        },
      });
    }
  }

  private async recordPosthogEvent(
    eventType: MonitorDigestEventType,
    digest: { id: string; userId: string } | null,
    provider: "RESEND" | "SES",
    extra: { link?: string; routePath: string },
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
            provider,
            product_origin: "monitor_email",
            ...(accessType ? { monitor_access_type: accessType } : {}),
            // Abertura é indicativa, nunca "leitura real" — Apple Mail
            // Privacy Protection e bloqueio de imagem inflam/distorcem
            // open rate. Documentado aqui pra quem for consumir o evento
            // no PostHog não reinterpretar como confirmação de leitura.
            ...(eventType === "OPENED" ? { indicative: true } : {}),
            ...(eventType === "CLICKED" && extra.link
              ? { link: extra.link }
              : {}),
          },
        },
        {
          correlationId: `monitor-digest-webhook:${digestId ?? "unknown"}`,
          ip: null,
          requestId: `monitor-digest-webhook:${digestId ?? "unknown"}`,
          routePath: extra.routePath,
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
