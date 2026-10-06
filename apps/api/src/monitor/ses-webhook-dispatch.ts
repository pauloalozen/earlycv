import type { Logger } from "@nestjs/common";
import type { EmailSuppressionService } from "../email/email-suppression.service";
import type { SesEventPayload } from "../email/ses-event.util";
import type { EmailDispatchWebhookService } from "../email-dispatch/email-dispatch-webhook.service";
import type { ProductUpdateWebhookService } from "../product-updates/product-update-webhook.service";
import type { MonitorDigestWebhookService } from "./monitor-digest-webhook.service";

// Extraído de MonitorPublicController.sesWebhook (a assinatura/TopicArn/
// Type=="Notification" já foram validados por quem chama) só pra permitir
// testar o ROTEAMENTO por correlationType com um envelope de evento SES
// fiel ao formato real (mail.tags como Record<string,string[]>), sem ter
// que forjar uma assinatura RSA válida de SNS num teste. Nenhuma mudança de
// comportamento: MONITOR_DIGEST continua exatamente a mesma chamada de
// antes, byte a byte.
export type SesWebhookDeps = {
  productUpdateWebhookService: Pick<
    ProductUpdateWebhookService,
    "processSesEvent" | "processSubscriptionEvent"
  >;
  webhookService: Pick<MonitorDigestWebhookService, "processSesEvent">;
  // E-mails de relacionamento (correlationType EMAIL_DISPATCH + tópico de
  // relacionamento do evento Subscription). Opcionais no tipo só para não
  // quebrar chamadores/testes antigos; o controller sempre injeta.
  emailDispatchWebhookService?: Pick<
    EmailDispatchWebhookService,
    "processSesEvent" | "processSubscriptionEvent"
  >;
  // Supressão compartilhada (bounce DURO/complaint de QUALQUER categoria).
  suppressionService?: Pick<EmailSuppressionService, "recordFromSesEvent">;
  logger: Pick<Logger, "log"> & Partial<Pick<Logger, "error">>;
};

export async function dispatchSesEvent(
  messageId: string,
  sesEvent: Record<string, unknown>,
  deps: SesWebhookDeps,
): Promise<{ ok: true }> {
  const eventType = (sesEvent as { eventType?: string }).eventType;

  if (eventType === "Subscription") {
    // Evento nativo do SES List Management (Product Updates) — não carrega
    // mail.tags/correlationType (não é sobre um envio específico), por isso
    // roteado direto pelo eventType, nunca pela lógica de correlationType
    // abaixo.
    const result =
      await deps.productUpdateWebhookService.processSubscriptionEvent(
        messageId,
        sesEvent as Parameters<
          typeof deps.productUpdateWebhookService.processSubscriptionEvent
        >[1],
      );
    if (!result.processed) {
      deps.logger.log(
        `product update subscription webhook not processed: ${result.reason}`,
      );
    }
    // Mesma contact list, tópicos distintos: cada handler reage só à
    // mudança do SEU tópico (ver ses-subscription.util.ts) — descadastrar
    // de comunicados nunca descadastra de relacionamento, nem o inverso.
    if (deps.emailDispatchWebhookService) {
      const dispatchResult =
        await deps.emailDispatchWebhookService.processSubscriptionEvent(
          messageId,
          sesEvent as Parameters<
            typeof deps.emailDispatchWebhookService.processSubscriptionEvent
          >[1],
        );
      if (!dispatchResult.processed) {
        deps.logger.log(
          `relationship subscription webhook not processed: ${dispatchResult.reason}`,
        );
      }
    }
    return { ok: true };
  }

  // Supressão compartilhada ANTES do roteamento por categoria: bounce duro
  // e complaint valem para o ENDEREÇO, qualquer que seja o tipo de e-mail
  // que os gerou. Falha aqui nunca derruba o roteamento existente (Monitor/
  // Product Updates) — fica no log e o SES mantém sua própria suppression
  // list de conta; a próxima entrega do SNS tenta de novo.
  if (deps.suppressionService) {
    try {
      await deps.suppressionService.recordFromSesEvent(
        sesEvent as SesEventPayload,
        messageId,
      );
    } catch (error) {
      deps.logger.error?.(
        `shared email suppression failed (type=${eventType}): ${
          error instanceof Error ? error.message : "unknown error"
        }`,
      );
    }
  }

  const correlationType = (
    sesEvent as { mail?: { tags?: Record<string, string[]> } }
  ).mail?.tags?.correlationType?.[0];

  if (correlationType === "PRODUCT_UPDATE") {
    const result = await deps.productUpdateWebhookService.processSesEvent(
      messageId,
      sesEvent as Parameters<
        typeof deps.productUpdateWebhookService.processSesEvent
      >[1],
    );
    if (!result.processed) {
      deps.logger.log(
        `product update ses webhook not processed: ${result.reason} (type=${eventType})`,
      );
    }
    return { ok: true };
  }

  if (correlationType === "EMAIL_DISPATCH") {
    if (!deps.emailDispatchWebhookService) {
      deps.logger.log(
        `SES webhook ignored: EMAIL_DISPATCH sem handler configurado (type=${eventType})`,
      );
      return { ok: true };
    }
    const result = await deps.emailDispatchWebhookService.processSesEvent(
      messageId,
      sesEvent as Parameters<
        typeof deps.emailDispatchWebhookService.processSesEvent
      >[1],
    );
    if (!result.processed) {
      deps.logger.log(
        `email dispatch ses webhook not processed: ${result.reason} (type=${eventType})`,
      );
    }
    return { ok: true };
  }

  if (correlationType === "PRODUCT_UPDATE_TEST") {
    // Envio de TESTE do Product Update (ver product-update-email.service.ts
    // sendTest) — nunca cria ProductUpdateDelivery, então não existe nada
    // pra correlacionar de propósito. Ignorado explicitamente aqui, ANTES
    // do fallback genérico abaixo: cair no fallback faria o log soar como
    // um problema do MONITOR_DIGEST (reason vindo de MonitorDigestWebhookService),
    // quando na verdade é um evento de teste esperado e sem relação nenhuma
    // com o Monitor.
    deps.logger.log(
      `SES webhook ignored: product update test send, no delivery to correlate (type=${eventType})`,
    );
    return { ok: true };
  }

  // correlationType === "MONITOR_DIGEST" | outro/ausente —
  // MonitorDigestWebhookService já ignora com segurança qualquer coisa que
  // não seja MONITOR_DIGEST (comportamento preexistente, inalterado).
  const result = await deps.webhookService.processSesEvent(
    messageId,
    sesEvent as Parameters<typeof deps.webhookService.processSesEvent>[1],
  );
  if (!result.processed) {
    deps.logger.log(
      `SES webhook not processed: ${result.reason} (type=${eventType})`,
    );
  }

  return { ok: true };
}
