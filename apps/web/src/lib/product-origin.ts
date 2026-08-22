// Espelha PRODUCT_ORIGINS do backend
// (apps/api/src/analysis-observability/product-origin.ts). Superfície
// funcional do EarlyCV que originou a ação — não é marketing/aquisição
// (isso é conversion_context/UTM). Nunca inferir: sem sinal confiável,
// "unknown".
export const PRODUCT_ORIGINS = [
  "radar",
  "analysis",
  "candidatura",
  "dashboard",
  "seo_job",
  "direct",
  "unknown",
] as const;

export type ProductOrigin = (typeof PRODUCT_ORIGINS)[number];

export function isProductOrigin(value: unknown): value is ProductOrigin {
  return (
    typeof value === "string" &&
    (PRODUCT_ORIGINS as readonly string[]).includes(value)
  );
}
