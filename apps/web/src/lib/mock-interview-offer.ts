/**
 * Oferta da Entrevista Simulada exibida nas páginas públicas.
 * O valor cobrado de fato é decidido pela API no checkout; isto aqui é só
 * texto de vitrine e precisa acompanhar o preço configurado lá.
 */
export const MOCK_INTERVIEW_OFFER = {
  path: "/simulacao-de-entrevista",
  checkoutPath: "/simulacao-de-entrevista/comprar",
  priceLabel: "R$ 79,90",
  priceDecimal: "79.90",
  durationMinutes: 45,
  offerLabel: "Oferta de lançamento",
  refundHoursBefore: 24,
  rescheduleHoursBefore: 24,
} as const;
