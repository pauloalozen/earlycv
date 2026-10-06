// Espelha MockInterviewPurchaseView da API (apps/api/src/mock-interviews).
export type MockInterviewPurchaseView = {
  id: string;
  code: string;
  amountInCents: number;
  currency: string;
  paymentStatus: "pending" | "paid" | "failed" | "refunded";
  sessionStatus:
    | "AWAITING_SCHEDULING"
    | "SCHEDULED"
    | "COMPLETED"
    | "NO_SHOW"
    | "CANCELLED"
    | "REFUNDED";
  scheduledAt: string | null;
  meetingUrl: string | null;
  createdAt: string;
  paidAt: string | null;
  whatsappUrl: string | null;
  whatsappConfigured: boolean;
};

export type MockInterviewCheckoutOrigin =
  | "landing"
  | "application_offer"
  | "offer_email"
  | "showcase"
  | "other";

// ?origem= da landing/oferta -> origem registrada na compra.
export function resolveCheckoutOrigin(
  origem: string | null | undefined,
  hasApplication: boolean,
): MockInterviewCheckoutOrigin {
  if (origem === "email") return "offer_email";
  if (origem === "candidatura") return "application_offer";
  if (origem === "vitrine") return "showcase";
  return hasApplication ? "application_offer" : "landing";
}
