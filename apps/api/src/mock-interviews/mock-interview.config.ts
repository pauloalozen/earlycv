// Oferta e regras da Entrevista Simulada. O valor cobrado é decidido AQUI
// (nunca pelo front): o checkout grava este snapshot na compra e o webhook
// confere o valor pago contra ele.

export const MOCK_INTERVIEW_PRODUCT = {
  title: "Entrevista simulada ao vivo (45 min)",
  amountInCents: 7990,
  currency: "BRL",
  durationMinutes: 45,
  offerLabel: "Oferta de lançamento",
  refundHoursBefore: 24,
  rescheduleHoursBefore: 24,
  // Versão da política aceita no checkout. Mudou a regra → nova versão.
  policyVersion: "2026-10-01",
} as const;

// Prefixo do external_reference no Mercado Pago. Distingue a compra de uma
// PlanPurchase em qualquer log/painel e garante que o webhook de planos
// nunca encontre uma compra correspondente.
export const MOCK_INTERVIEW_EXTERNAL_REFERENCE_PREFIX = "mock_interview:";

export function toExternalReference(purchaseId: string): string {
  return `${MOCK_INTERVIEW_EXTERNAL_REFERENCE_PREFIX}${purchaseId}`;
}

export function purchaseIdFromExternalReference(
  externalReference: string | null | undefined,
): string | null {
  if (
    !externalReference?.startsWith(MOCK_INTERVIEW_EXTERNAL_REFERENCE_PREFIX)
  ) {
    return null;
  }
  const id = externalReference
    .slice(MOCK_INTERVIEW_EXTERNAL_REFERENCE_PREFIX.length)
    .trim();
  return id || null;
}

// Código curto exibido ao usuário e na mensagem do WhatsApp.
export function purchaseCode(purchaseId: string): string {
  return purchaseId.slice(-6).toUpperCase();
}

function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

// Número do WhatsApp do Paulo (só dígitos, com DDI). Nunca vai para o front
// antes do pagamento confirmado.
export function getWhatsappNumber(): string | null {
  const raw = process.env.MOCK_INTERVIEW_WHATSAPP_NUMBER?.trim();
  if (!raw) return null;
  const digits = digitsOnly(raw);
  return digits.length >= 10 ? digits : null;
}

export function getAdminNotificationEmail(): string | null {
  const raw = process.env.MOCK_INTERVIEW_ADMIN_EMAIL?.trim().toLowerCase();
  return raw && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw) ? raw : null;
}

export function buildWhatsappUrl(input: {
  number: string;
  purchaseId: string;
  buyerName: string | null;
}): string {
  const firstName = input.buyerName?.trim().split(/\s+/)[0];
  const text = [
    `Olá, Paulo! ${firstName ? `Aqui é ${firstName}. ` : ""}Comprei a entrevista simulada no EarlyCV.`,
    `Pedido #${purchaseCode(input.purchaseId)}`,
    "Quero combinar o horário.",
  ].join("\n");
  return `https://wa.me/${input.number}?text=${encodeURIComponent(text)}`;
}

export function resolveFrontendUrl(): string {
  return process.env.FRONTEND_URL ?? "http://localhost:3000";
}

export function resolveApiUrl(): string {
  return (
    process.env.API_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    "http://localhost:4000"
  );
}
