import { Inject, Injectable, Logger } from "@nestjs/common";
import type { ProductUpdateEventType } from "@prisma/client";
import { Prisma } from "@prisma/client";

import { APP_ENV, type AppEnv } from "../config/env.module";
import { DatabaseService } from "../database/database.service";
import {
  resolveSesEventOccurredAt,
  type SesEventPayload,
} from "../email/ses-event.util";
import { ProductUpdateSubscriptionService } from "./product-update-subscription.service";

// Mesmo raciocínio do Monitor (ver monitor-digest-webhook.service.ts) —
// Send/Reject só existem pra resolver OUTCOME_UNKNOWN.
const SES_EVENT_TYPE_MAP: Record<string, ProductUpdateEventType> = {
  Send: "SENT",
  Delivery: "DELIVERED",
  Open: "OPENED",
  Click: "CLICKED",
  Bounce: "BOUNCED",
  Complaint: "COMPLAINED",
  Reject: "REJECTED",
};

const OUTCOME_UNKNOWN_RESOLVES_TO_SENT = new Set<ProductUpdateEventType>([
  "SENT",
  "DELIVERED",
]);
const OUTCOME_UNKNOWN_RESOLVES_TO_FAILED = new Set<ProductUpdateEventType>([
  "BOUNCED",
  "COMPLAINED",
  "REJECTED",
]);

export type ProcessProductUpdateWebhookResult = {
  processed: boolean;
  reason?:
    | "duplicate"
    | "unsupported_type"
    | "missing_email_id"
    | "malformed_subscription_payload";
};

// Formato do evento "Subscription" (SES List Management) — PENDENTE DE
// VALIDAÇÃO contra um evento real da AWS (registrado como risco aberto no
// plano; confirmar antes do go-live, ver passo de configuração SNS). Campos
// aqui refletem a documentação pública da AWS para SESv2 Contact List
// subscription events; parsing é inteiramente defensivo — qualquer formato
// inesperado é ignorado com segurança (retorna processed:false), nunca
// lança.
type SesSubscriptionEventPayload = {
  eventType: "Subscription";
  subscription?: {
    contactList?: string;
    source?: string;
    newTopicPreferences?: {
      unsubscribeAll?: boolean;
      topicSubscriptionStatus?: Array<{
        topicName?: string;
        subscriptionStatus?: "OPT_IN" | "OPT_OUT";
      }>;
    };
  };
};

@Injectable()
export class ProductUpdateWebhookService {
  private readonly logger = new Logger(ProductUpdateWebhookService.name);

  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(ProductUpdateSubscriptionService)
    private readonly subscriptionService: ProductUpdateSubscriptionService,
    @Inject(APP_ENV)
    private readonly env: Pick<AppEnv, "AWS_SES_PRODUCT_UPDATE_TOPIC_NAME">,
  ) {}

  // Evento SES via SNS já validado (assinatura/TopicArn) e já roteado pelo
  // dispatcher em MonitorPublicController.sesWebhook por
  // correlationType === "PRODUCT_UPDATE". snsMessageId é a chave de
  // idempotência (equivalente ao svix-id do Resend/ao mesmo mecanismo do
  // Monitor).
  async processSesEvent(
    snsMessageId: string,
    payload: SesEventPayload,
  ): Promise<ProcessProductUpdateWebhookResult> {
    const eventType = SES_EVENT_TYPE_MAP[payload.eventType];
    if (!eventType) {
      return { processed: false, reason: "unsupported_type" };
    }

    const providerMessageId = payload.mail?.messageId;
    if (!providerMessageId) {
      return { processed: false, reason: "missing_email_id" };
    }

    // Mesma ordem de correlação do Monitor: tag correlationId primeiro
    // (sobrevive mesmo sem providerMessageId persistido, caso
    // OUTCOME_UNKNOWN), providerMessageId como fallback.
    const correlationId = payload.mail?.tags?.correlationId?.[0];
    const delivery = correlationId
      ? await this.database.productUpdateDelivery.findUnique({
          where: { id: correlationId },
        })
      : await this.database.productUpdateDelivery.findFirst({
          where: { providerMessageId },
        });

    if (!delivery) {
      this.logger.warn(
        `product update ses webhook: no ProductUpdateDelivery found (correlationId=${correlationId ?? "none"}, providerMessageId=${providerMessageId}, type=${payload.eventType})`,
      );
    }

    try {
      await this.database.productUpdateEvent.create({
        data: {
          deliveryId: delivery?.id ?? null,
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

    if (delivery) {
      await this.resolveOutcomeUnknownIfApplicable(delivery, eventType);
    }

    if (
      (eventType === "BOUNCED" || eventType === "COMPLAINED") &&
      delivery?.userId
    ) {
      // Higiene local — a barreira de fato contra reenvio é o SES
      // (ListManagementOptions), isto é só auditoria/pré-filtro (ver
      // ProductUpdateSubscriptionService). userId pode ser null (usuário
      // excluído depois do envio) — nada a suprimir localmente nesse caso.
      await this.subscriptionService.markSuppressed(
        delivery.userId,
        eventType === "BOUNCED" ? "BOUNCED" : "COMPLAINED",
        resolveSesEventOccurredAt(payload),
      );
    }

    return { processed: true };
  }

  // Evento nativo do SES List Management — não amarrado a uma
  // ProductUpdateDelivery específica (não carrega mail.tags), por isso
  // roteado separadamente pelo dispatcher (ver
  // MonitorPublicController.sesWebhook) a partir do eventType, nunca do
  // correlationType.
  async processSubscriptionEvent(
    snsMessageId: string,
    payload: SesSubscriptionEventPayload,
  ): Promise<ProcessProductUpdateWebhookResult> {
    const source = payload.subscription?.source;
    if (!source) {
      this.logger.warn(
        "product update subscription webhook: payload sem subscription.source — ignorado com segurança (ver risco de formato não validado)",
      );
      return { processed: false, reason: "malformed_subscription_payload" };
    }

    const topicName = this.env.AWS_SES_PRODUCT_UPDATE_TOPIC_NAME;
    const preferences = payload.subscription?.newTopicPreferences;
    const unsubscribedAll = preferences?.unsubscribeAll === true;
    const topicStatus = preferences?.topicSubscriptionStatus?.find(
      (entry) => entry.topicName === topicName,
    )?.subscriptionStatus;

    const optedOut = unsubscribedAll || topicStatus === "OPT_OUT";
    const optedIn = !unsubscribedAll && topicStatus === "OPT_IN";
    if (!optedOut && !optedIn) {
      // Evento de um tópico diferente do nosso, ou preferências sem
      // mudança relevante — ignorado com segurança.
      return { processed: false, reason: "unsupported_type" };
    }

    try {
      await this.database.productUpdateEvent.create({
        data: {
          deliveryId: null,
          providerMessageId: null,
          providerEventId: snsMessageId,
          type: "SUBSCRIPTION",
          provider: "SES",
          metadataJson: payload as unknown as Prisma.InputJsonValue,
          occurredAt: resolveSesEventOccurredAt(
            payload as unknown as SesEventPayload,
          ),
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

    const userId = await this.subscriptionService.findUserIdByEmail(source);
    if (!userId) {
      this.logger.warn(
        `product update subscription webhook: nenhum User encontrado para o e-mail do evento (source=${source})`,
      );
      return { processed: true };
    }

    if (optedOut) {
      await this.subscriptionService.markSuppressed(
        userId,
        "SES_OPT_OUT",
        new Date(),
      );
    } else {
      await this.subscriptionService.markResubscribed(userId);
    }

    return { processed: true };
  }

  private async resolveOutcomeUnknownIfApplicable(
    delivery: { id: string; status: string },
    eventType: ProductUpdateEventType,
  ) {
    if (delivery.status !== "OUTCOME_UNKNOWN") {
      return;
    }

    if (OUTCOME_UNKNOWN_RESOLVES_TO_SENT.has(eventType)) {
      await this.database.productUpdateDelivery.update({
        where: { id: delivery.id },
        data: {
          status: "SENT",
          sentAt: new Date(),
          outcomeUnknownAt: null,
          lastError: null,
        },
      });
      return;
    }

    if (OUTCOME_UNKNOWN_RESOLVES_TO_FAILED.has(eventType)) {
      await this.database.productUpdateDelivery.update({
        where: { id: delivery.id },
        data: {
          status: "FAILED",
          outcomeUnknownAt: null,
          lastError: `outcome resolved via ${eventType} event`,
        },
      });
    }
  }
}
