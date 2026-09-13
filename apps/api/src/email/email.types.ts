// Tipos compartilhados da fachada de e-mail multi-provider (Resend + SES).
// EmailCategory decide o roteamento (ver email-routing.policy.ts) — nunca
// comparação de assunto/template/string espalhada pelo código.
export type EmailCategory =
  | "AUTHENTICATION"
  | "BILLING"
  | "JOB_ALERT"
  | "ADMIN_COMMUNICATION"; // reservado — sem uso nesta entrega

// Espelha o enum Prisma EmailProviderName.
export type EmailProviderName = "RESEND" | "SES";

export type EmailMessage = {
  to: string;
  subject: string;
  text: string;
  html?: string;
  // Cabeçalhos de e-mail extras (List-Unsubscribe/List-Unsubscribe-Post) —
  // opcional, ignorado por implementações sem suporte.
  headers?: Record<string, string>;
  // Chave de idempotência do PROVIDER — hoje só o Resend suporta
  // (header HTTP `Idempotency-Key`); SES v2 não tem equivalente nativo
  // (ver decisão em ses-email-provider.service.ts). Opcional.
  idempotencyKey?: string;
  // Tags de correlação (ex.: { digestId }) — Resend ignora; SES mapeia
  // para EmailTags no SendEmailCommand, o que faz a tag voltar em
  // `mail.tags` em TODO evento publicado (Send/Delivery/Bounce/Complaint/
  // Reject/Open/Click), permitindo correlacionar um evento assíncrono ao
  // digest de origem mesmo quando o MessageId não está disponível.
  tags?: Record<string, string>;
};

export type EmailSendOutcome = "SENT" | "FAILED" | "OUTCOME_UNKNOWN";

export type EmailSendResult = {
  outcome: EmailSendOutcome;
  provider: EmailProviderName;
  // null quando o provider não devolveu id (nunca inventar um).
  providerMessageId: string | null;
  errorCode?: string;
  errorMessage?: string;
};

export interface EmailProvider {
  readonly name: EmailProviderName;
  send(message: EmailMessage): Promise<EmailSendResult>;
}

export interface EmailRoutingPolicy {
  resolve(category: EmailCategory): EmailProvider;
}

// Fachada única — NÃO persiste nada (sem tabela EmailLog genérica nesta
// entrega). Cada domínio continua responsável pela própria persistência:
// Monitor grava em MonitorDigest/MonitorDigestEvent, pagamento em
// PaymentRecoveryEmail (fora do escopo desta migração), autenticação não
// registra envio (como hoje).
export interface EmailService {
  send(params: {
    category: EmailCategory;
    message: EmailMessage;
  }): Promise<EmailSendResult>;
}

export const EMAIL_SERVICE = Symbol("EMAIL_SERVICE");
