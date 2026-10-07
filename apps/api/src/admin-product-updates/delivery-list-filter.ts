import type { Prisma, ProductUpdateEventType } from "@prisma/client";

// Drill-down dos cards de métricas da campanha (ver computeStats em
// AdminProductUpdatesService): cada filtro lista as ENTREGAS por trás do
// número do card, com o mesmo critério da contagem — status da delivery,
// delivery com pelo menos um evento do tipo, ou destinatário descadastrado
// agora (SES_OPT_OUT).
export const DELIVERY_LIST_FILTERS = [
  "sent",
  "failed",
  "outcome_unknown",
  "cancelled",
  "opened",
  "clicked",
  "bounced",
  "complained",
  "unsubscribed",
] as const;

export type DeliveryListFilter = (typeof DELIVERY_LIST_FILTERS)[number];

const STATUS_FILTERS = {
  sent: "SENT",
  failed: "FAILED",
  outcome_unknown: "OUTCOME_UNKNOWN",
  cancelled: "CANCELLED",
} as const;

const EVENT_FILTERS = {
  opened: "OPENED",
  clicked: "CLICKED",
  bounced: "BOUNCED",
  complained: "COMPLAINED",
} as const satisfies Partial<
  Record<DeliveryListFilter, ProductUpdateEventType>
>;

export function eventTypeForFilter(
  filter: DeliveryListFilter | undefined,
): ProductUpdateEventType | null {
  if (!filter || !(filter in EVENT_FILTERS)) return null;
  return EVENT_FILTERS[filter as keyof typeof EVENT_FILTERS];
}

export function buildDeliveryListWhere(
  productUpdateId: string,
  filter: DeliveryListFilter | undefined,
): Prisma.ProductUpdateDeliveryWhereInput {
  if (!filter) return { productUpdateId };

  if (filter in STATUS_FILTERS) {
    return {
      productUpdateId,
      status: STATUS_FILTERS[filter as keyof typeof STATUS_FILTERS],
    };
  }

  const eventType = eventTypeForFilter(filter);
  if (eventType) {
    return { productUpdateId, events: { some: { type: eventType } } };
  }

  // unsubscribed — mesmo critério do card (status ATUAL de opt-out).
  return {
    productUpdateId,
    user: {
      productEmailSubscription: {
        subscribed: false,
        suppressionReason: "SES_OPT_OUT",
      },
    },
  };
}

// Só o pedaço útil do payload SES do primeiro evento — nunca o JSON cru
// (traz cabeçalhos do e-mail e é pesado pra uma listagem).
export function summarizeEventMetadata(
  type: ProductUpdateEventType,
  metadata: unknown,
): string | null {
  if (!metadata || typeof metadata !== "object") return null;
  const payload = metadata as Record<
    string,
    Record<string, unknown> | undefined
  >;

  if (type === "CLICKED") {
    const link = payload.click?.link;
    return typeof link === "string" ? link : null;
  }
  if (type === "BOUNCED") {
    const parts = [
      payload.bounce?.bounceType,
      payload.bounce?.bounceSubType,
    ].filter((part): part is string => typeof part === "string");
    return parts.length > 0 ? parts.join(" / ") : null;
  }
  if (type === "COMPLAINED") {
    const feedback = payload.complaint?.complaintFeedbackType;
    return typeof feedback === "string" ? feedback : null;
  }
  return null;
}
