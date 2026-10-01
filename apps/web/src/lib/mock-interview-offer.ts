/**
 * Oferta da Entrevista Simulada exibida nas páginas públicas. O PREÇO não
 * fica aqui: vem da API (PRICE_INTERVIEW_SIM), que também decide o valor
 * cobrado no checkout. Ver mock-interview-offer.server.ts e
 * useMockInterviewPrice.
 */
export const MOCK_INTERVIEW_OFFER = {
  path: "/simulacao-de-entrevista",
  checkoutPath: "/simulacao-de-entrevista/comprar",
  durationMinutes: 45,
  offerLabel: "Oferta de lançamento",
  refundHoursBefore: 24,
  rescheduleHoursBefore: 24,
} as const;

// 7990 -> "R$ 79,90"
export function formatMockInterviewPrice(amountInCents: number): string {
  const [reais, centavos] = (amountInCents / 100).toFixed(2).split(".");
  const withThousands = reais.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `R$ ${withThousands},${centavos}`;
}

// 7990 -> "79,90" (sem o "R$", para quando o símbolo é estilizado à parte)
export function formatMockInterviewAmount(amountInCents: number): string {
  return formatMockInterviewPrice(amountInCents).replace(/^R\$ /, "");
}

// 7990 -> "79.90" (schema.org Offer.price)
export function toSchemaPrice(amountInCents: number): string {
  return (amountInCents / 100).toFixed(2);
}
