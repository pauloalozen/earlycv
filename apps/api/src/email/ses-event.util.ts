// Utilitários genéricos de evento SES (via SNS) — extraídos de
// monitor-digest-webhook.service.ts porque são de propósito genéricos de
// PROVIDER, não do Monitor: qualquer categoria que envie por SES (JOB_ALERT,
// PRODUCT_ANNOUNCEMENT) recebe o mesmo formato de evento documentado pela
// AWS ("Contents of event data that Amazon SES publishes"). Cada domínio
// (MonitorDigestWebhookService, ProductUpdateWebhookService) mantém seu
// próprio mapeamento de eventType -> enum de domínio e sua própria lógica de
// correlação — só o parsing do payload bruto é compartilhado aqui.

// Formato documentado pela AWS — só os campos que os webhooks de fato usam.
export type SesEventPayload = {
  eventType: string;
  mail?: {
    messageId?: string;
    // Timestamp de quando o e-mail foi ENVIADO — igual em todo evento
    // publicado pro mesmo e-mail (Send/Delivery/Open/Click/...), nunca o
    // momento do evento em si. Só correto usar como occurredAt pro
    // próprio evento Send/Reject (ver resolveSesEventOccurredAt abaixo).
    timestamp?: string;
    // Cada tag pode ter múltiplos valores (por isso array) — cada domínio
    // só emite um valor por tag ao enviar (ver email.types.ts), mas o
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
// do Send original (bug real visto em produção no Monitor: timeline
// exibindo 2 "Aberto" e um "Clicado" no mesmo segundo do envio). Cada tipo
// de evento carrega seu PRÓPRIO timestamp no objeto homônimo
// (delivery.timestamp, open.timestamp, etc. — formato documentado pela
// AWS); só Send/Reject não têm um campo dedicado (acontecem no instante do
// envio mesmo), por isso caem no fallback de mail.timestamp.
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
