import { createHash } from "node:crypto";
import { Inject, Injectable, Logger } from "@nestjs/common";
import type { EmailDispatchEventType } from "@prisma/client";
import { Prisma } from "@prisma/client";

import { APP_ENV, type AppEnv } from "../config/env.module";
import { DatabaseService } from "../database/database.service";
import {
  resolveSesEventOccurredAt,
  type SesEventPayload,
} from "../email/ses-event.util";
import {
  resolveSubscriptionContactEmail,
  resolveTopicSubscriptionChange,
  type SesSubscriptionEventPayload,
} from "../email/ses-subscription.util";

// Sem Open/Click de propósito: o Configuration Set de relacionamento não
// faz tracking (e, se um evento desses chegar mesmo assim, é ignorado — não
// o tratamos como medida de leitura).
const SES_EVENT_TYPE_MAP: Record<string, EmailDispatchEventType> = {
  Send: "SENT",
  Delivery: "DELIVERED",
  Bounce: "BOUNCED",
  Complaint: "COMPLAINED",
  Reject: "REJECTED",
};

const OUTCOME_UNKNOWN_RESOLVES_TO_SENT = new Set<EmailDispatchEventType>([
  "SENT",
  "DELIVERED",
]);
const OUTCOME_UNKNOWN_RESOLVES_TO_FAILED = new Set<EmailDispatchEventType>([
  "BOUNCED",
  "COMPLAINED",
  "REJECTED",
]);

export type ProcessEmailDispatchWebhookResult = {
  processed: boolean;
  reason?:
    | "duplicate"
    | "unsupported_type"
    | "missing_email_id"
    | "malformed_subscription_payload";
};

function hashEmailForLogging(email: string): string {
  return createHash("sha256").update(email.trim().toLowerCase()).digest("hex");
}

@Injectable()
export class EmailDispatchWebhookService {
  private readonly logger = new Logger(EmailDispatchWebhookService.name);

  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(APP_ENV)
    private readonly env: Pick<AppEnv, "AWS_SES_RELATIONSHIP_TOPIC_NAME">,
  ) {}

  // Roteado pelo dispatcher (ses-webhook-dispatch.ts) por
  // correlationType === "EMAIL_DISPATCH". snsMessageId = chave de
  // idempotência. A supressão compartilhada (bounce duro/complaint) NÃO é
  // gravada aqui — o dispatcher a grava para qualquer categoria antes de
  // rotear.
  async processSesEvent(
    snsMessageId: string,
    payload: SesEventPayload,
  ): Promise<ProcessEmailDispatchWebhookResult> {
    const eventType = SES_EVENT_TYPE_MAP[payload.eventType];
    if (!eventType) {
      return { processed: false, reason: "unsupported_type" };
    }

    const providerMessageId = payload.mail?.messageId;
    if (!providerMessageId) {
      return { processed: false, reason: "missing_email_id" };
    }

    const correlationId = payload.mail?.tags?.correlationId?.[0];
    const dispatch = correlationId
      ? await this.database.emailDispatch.findUnique({
          where: { id: correlationId },
        })
      : await this.database.emailDispatch.findFirst({
          where: { providerMessageId },
        });

    if (!dispatch) {
      this.logger.warn(
        `email dispatch ses webhook: no EmailDispatch found (correlationId=${correlationId ?? "none"}, providerMessageId=${providerMessageId}, type=${payload.eventType})`,
      );
    }

    try {
      await this.database.emailDispatchEvent.create({
        data: {
          dispatchId: dispatch?.id ?? null,
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

    // Verificável nos logs do deploy (sem e-mail/PII): tipo do evento e se
    // foi correlacionado a uma linha (dispatchId=none = envio de teste sem
    // banco ou linha apagada).
    this.logger.log(
      `email_dispatch_event type=${eventType} dispatchId=${dispatch?.id ?? "none"}`,
    );

    if (dispatch?.status === "OUTCOME_UNKNOWN") {
      if (OUTCOME_UNKNOWN_RESOLVES_TO_SENT.has(eventType)) {
        await this.database.emailDispatch.update({
          where: { id: dispatch.id },
          data: {
            status: "SENT",
            sentAt: new Date(),
            providerMessageId,
            outcomeUnknownAt: null,
            lastError: null,
          },
        });
      } else if (OUTCOME_UNKNOWN_RESOLVES_TO_FAILED.has(eventType)) {
        await this.database.emailDispatch.update({
          where: { id: dispatch.id },
          data: {
            status: "FAILED",
            outcomeUnknownAt: null,
            lastError: `outcome resolved via ${eventType} event`,
          },
        });
      }
    }

    return { processed: true };
  }

  // Descadastro/re-inscrição no tópico de RELACIONAMENTO (mesma contact
  // list do Product Updates, tópico distinto). Só reage à mudança deste
  // tópico ou a "cancelar tudo" — descadastrar de comunicados não passa
  // por aqui. Idempotente (upsert), então reentrega do SNS é inofensiva.
  async processSubscriptionEvent(
    snsMessageId: string,
    payload: SesSubscriptionEventPayload,
  ): Promise<ProcessEmailDispatchWebhookResult> {
    // Contato = mail.destination[0] (subscription.source é o mecanismo).
    const contactEmail = resolveSubscriptionContactEmail(payload);
    if (!contactEmail) {
      return { processed: false, reason: "malformed_subscription_payload" };
    }

    const change = resolveTopicSubscriptionChange(
      payload,
      this.env.AWS_SES_RELATIONSHIP_TOPIC_NAME,
    );
    if (!change) {
      return { processed: false, reason: "unsupported_type" };
    }

    const user = await this.database.user.findUnique({
      where: { email: contactEmail },
      select: { id: true },
    });
    if (!user) {
      this.logger.warn(
        `email dispatch subscription webhook: no matching User (providerEventId=${snsMessageId}, reason=no_user_for_source, sourceHash=${hashEmailForLogging(contactEmail)})`,
      );
      return { processed: true };
    }

    this.logger.log(
      `email_dispatch_subscription change=${change} userId=${user.id}`,
    );

    if (change === "OPT_OUT") {
      await this.database.relationshipEmailPreference.upsert({
        where: { userId: user.id },
        create: {
          userId: user.id,
          subscribed: false,
          unsubscribedAt: new Date(),
        },
        update: { subscribed: false, unsubscribedAt: new Date() },
      });
    } else {
      await this.database.relationshipEmailPreference.upsert({
        where: { userId: user.id },
        create: { userId: user.id, subscribed: true },
        update: { subscribed: true, unsubscribedAt: null },
      });
    }

    return { processed: true };
  }
}
