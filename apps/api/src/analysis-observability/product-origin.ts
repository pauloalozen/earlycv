// Superfície funcional do EarlyCV que originou a ação atual. NÃO é
// marketing/aquisição (isso é conversion_context em
// apps/api/src/auth/dto/register.dto.ts, ou UTM/source/medium) — é sobre
// qual parte do PRODUTO a pessoa estava usando quando a ação aconteceu.
//
// Conjunto fechado, nunca inferido por heurística frágil: se não houver
// sinal confiável no momento da ação, product_origin = "unknown".
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
