// Tipos compartilhados da fachada de e-mail multi-provider (Resend + SES).
// EmailCategory decide o roteamento (ver email-routing.policy.ts) — nunca
// comparação de assunto/template/string espalhada pelo código.
//
// PRODUCT_ANNOUNCEMENT é usada pelo domínio Product Updates (comunicados
// institucionais, ver apps/api/src/product-updates/) — seleção de
// destinatários/consentimento vive lá (ProductEmailSubscription +
// ListManagementOptions do SES), nunca nesta camada de e-mail.
// MARKETING/ADMIN_COMMUNICATION continuam só como vocabulário — nenhum
// call site usa ainda, e resolvê-las (EmailConfigService.getSesSenderProfile)
// lança erro claro até que sejam implementadas de fato. Elas não liberam
// envio nenhum por existirem no type.
export type EmailCategory =
  | "AUTHENTICATION"
  | "BILLING"
  | "JOB_ALERT"
  | "PRODUCT_ANNOUNCEMENT"
  | "MARKETING" // reservado — sem uso nesta entrega
  | "ADMIN_COMMUNICATION"; // reservado — sem uso nesta entrega

// Espelha o enum Prisma EmailProviderName.
export type EmailProviderName = "RESEND" | "SES";

// Espelha o enum Prisma EmailBulkSendMode — ver comentário completo em
// MonitorDigestScheduleConfig.sesMode no schema. Vocabulário genérico do
// domínio de e-mail (não específico do Monitor), mesmo que hoje só o
// Monitor tenha um campo de configuração usando este tipo.
export type EmailBulkSendMode =
  | "LEGACY_RESEND"
  | "SES_ROLLOUT"
  | "SES_LIVE"
  | "PAUSED";

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
  // Tags de correlação do CHAMADOR (ex.: { correlationType:
  // "MONITOR_DIGEST", correlationId: digestId }) — nomes genéricos de
  // propósito, nunca "digestId" solto, porque este tipo é compartilhado
  // por toda categoria futura (PRODUCT_ANNOUNCEMENT/MARKETING terão seu
  // próprio correlationType). A fachada (DefaultEmailService) acrescenta a
  // tag `category` automaticamente antes de enviar — o chamador nunca
  // precisa (nem deve) setá-la aqui. Resend ignora; SES mapeia pra
  // EmailTags no SendEmailCommand, o que faz as tags voltarem em
  // `mail.tags` em TODO evento publicado (Send/Delivery/Bounce/Complaint/
  // Reject/Open/Click) — correlação sobrevive mesmo sem providerMessageId
  // (caso OUTCOME_UNKNOWN).
  tags?: Record<string, string>;
  // Identidade de remetente — SEMPRE resolvida por EmailRoutingPolicy.resolve
  // (a partir de EmailSenderProfile, ver abaixo) antes de chamar um
  // provider SES; nunca setada pelo chamador, nunca lida do config pelo
  // próprio SesEmailProviderService (ele só usa o que já vier aqui, sem
  // nenhum `if` por categoria). É assim que adicionar uma categoria nova
  // nunca exige mudar o provider. Resend ignora estes 3 campos (usa seu
  // próprio remetente fixo, fora do escopo desta entrega).
  from?: { email: string; name: string };
  replyTo?: string;
  configurationSet?: string;
  // Gerenciamento de lista nativo do SES v2 (SendEmailCommand
  // ListManagementOptions) — usado só pelo envio REAL de Product Updates
  // (nunca pelo envio de teste, nunca pelo Monitor/JOB_ALERT). O SES
  // resolve o placeholder {{amazonSESUnsubscribeUrl}} no corpo e recusa
  // entregar a quem estiver OPT_OUT do tópico, sem token/endpoint de
  // unsubscribe nosso. Resend/demais categorias ignoram este campo.
  listManagementOptions?: { contactListName: string; topicName: string };
};

// Identidade de remetente de UMA categoria de envio em massa — quem o
// destinatário vê e pra onde uma resposta vai. Resolvido por
// EmailConfigService.getSesSenderProfile(category) (só JOB_ALERT
// implementado nesta entrega; qualquer outra categoria lança erro claro,
// nunca libera envio por existir no type EmailCategory) e injetado pela
// EmailRoutingPolicy na mensagem — nunca lido diretamente por
// SesEmailProviderService.
export type EmailSenderProfile = {
  fromEmail: string;
  fromName: string;
  replyTo?: string;
  configurationSet: string;
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

// O que resolver(categoria) devolve: EmailCategory -> provider ->
// senderProfile -> tags, tudo numa única decisão. senderProfile/tags só
// fazem sentido pra provider SES (Resend usa seu próprio remetente fixo)
// — undefined nesse caso. DefaultEmailService só orquestra isto (merge no
// EmailMessage + chamar provider.send); não sabe qual provider é SES.
export type ResolvedEmailRoute = {
  provider: EmailProvider;
  senderProfile?: EmailSenderProfile;
  tags?: Record<string, string>;
};

export interface EmailRoutingPolicy {
  resolve(category: EmailCategory): ResolvedEmailRoute;
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
