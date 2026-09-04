export type EmailDeliveryMessage = {
  html?: string;
  subject: string;
  text: string;
  to: string;
  // Cabeçalhos de e-mail extras (ex.: List-Unsubscribe / List-Unsubscribe-Post
  // pro one-click unsubscribe do RFC 8058 no digest do Monitor) — opcional,
  // ignorado por implementações que não suportam headers customizados.
  headers?: Record<string, string>;
  // Chave de idempotência do PROVIDER (Resend suporta o header
  // `Idempotency-Key`) — segunda camada de proteção contra envio duplicado,
  // além da idempotência interna do MonitorDigest: cobre o caso em que o
  // Resend aceita o envio mas a resposta não chega à nossa aplicação
  // (timeout) e o worker tenta de novo. Estável por chamador (ex.:
  // `monitor-digest:${digestId}`), nunca contém PII. Opcional — ignorado
  // por implementações sem suporte (FakeEmailDeliveryService).
  idempotencyKey?: string;
};

// providerMessageId é o identificador que o provider (hoje Resend) devolve
// no envio — correlaciona esta mensagem com os eventos de webhook
// (delivered/opened/clicked/bounced/complained) recebidos depois. null
// quando o provider não devolveu id (ex: FakeEmailDeliveryService em
// ambiente sem provider real) — quem grava esse valor deve tratar null
// como "sem correlação possível", nunca inventar um id.
export type EmailDeliveryResult = {
  providerMessageId: string | null;
};

export interface EmailDeliveryPort {
  send(message: EmailDeliveryMessage): Promise<EmailDeliveryResult>;
}

export const EMAIL_DELIVERY_PORT = Symbol("EMAIL_DELIVERY_PORT");
