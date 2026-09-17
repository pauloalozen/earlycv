import type { Logger } from "@nestjs/common";

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
  logger: Pick<Logger, "log">;
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
    return { ok: true };
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
