import type { EmailProviderName, MonitorDigestEventType } from "@prisma/client";

// Truncamento genérico pra IDs de provider e mensagens de erro exibidos no
// admin — nunca a string inteira quando ela pode carregar detalhe extenso
// (stack trace, corpo de erro da AWS/Resend). `null`/`undefined` passam
// direto.
export function truncateForDisplay(
  value: string | null | undefined,
  maxLength = 48,
): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength)}…`;
}

// Resumo curto e SEGURO do metadataJson de um MonitorDigestEvent — nunca
// retorna o objeto bruto. metadataJson hoje guarda coisas bem diferentes
// por provider (Resend: só `payload.data`; SES: o envelope de evento
// inteiro, que inclui `mail.destination`/`mail.commonHeaders` — endereço
// de e-mail do destinatário, entre outras coisas) — por isso só uma
// allowlist explícita de campos conhecidos-seguros por tipo de evento,
// nunca um fallback que devolva o que sobrar. CLICKED nunca expõe a URL
// clicada (poderia, em tese, ser o link de unsubscribe assinado).
export function summarizeDigestEventMetadata(
  type: MonitorDigestEventType,
  metadata: unknown,
): string | null {
  if (!metadata || typeof metadata !== "object") {
    return null;
  }
  const data = metadata as Record<string, unknown>;

  if (type === "BOUNCED") {
    // SES: Bounce object direto na raiz do payload salvo. Resend: dentro
    // de `data` (já é o `payload.data` salvo). Tenta as duas formas,
    // nunca lança.
    const bounce = (data.bounce as Record<string, unknown> | undefined) ?? data;
    const bounceType = readSafeString(bounce, "bounceType");
    const bounceSubType = readSafeString(bounce, "bounceSubType");
    if (bounceType) {
      return bounceSubType ? `${bounceType}/${bounceSubType}` : bounceType;
    }
    return null;
  }

  if (type === "COMPLAINED") {
    const complaint =
      (data.complaint as Record<string, unknown> | undefined) ?? data;
    const feedbackType = readSafeString(complaint, "complaintFeedbackType");
    return feedbackType;
  }

  if (type === "REJECTED") {
    const reject = (data.reject as Record<string, unknown> | undefined) ?? data;
    return readSafeString(reject, "reason");
  }

  // DELIVERED/OPENED/CLICKED/SENT: nenhum resumo extra necessário — o
  // tipo do evento já é a informação, e CLICKED nunca expõe a URL.
  return null;
}

function readSafeString(
  source: Record<string, unknown>,
  key: string,
): string | null {
  const value = source[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

// Rótulos amigáveis pra timeline — nomes de evento (MonitorDigestEventType)
// não são autoexplicativos pro admin (ex.: "SENT" é confirmação
// assíncrona do provider, não o status "SENT" do MonitorDigest — ver
// comentário de semântica em admin-monitor.service.ts).
export const DIGEST_EVENT_TYPE_LABEL: Record<MonitorDigestEventType, string> = {
  SENT: "Aceito pelo provider (confirmação assíncrona)",
  DELIVERED: "Entregue",
  OPENED: "Aberto",
  CLICKED: "Clicado",
  BOUNCED: "Bounce",
  COMPLAINED: "Complaint",
  REJECTED: "Rejeitado pelo provider",
};

export function isKnownProvider(value: unknown): value is EmailProviderName {
  return value === "RESEND" || value === "SES";
}
