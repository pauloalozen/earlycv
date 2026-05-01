export type NextAction =
  | "show_success"
  | "keep_waiting"
  | "show_failure"
  | "retry_payment";

export type CheckoutStatusResponse = {
  checkoutId: string;
  status: "pending" | "approved" | "failed";
  nextAction: NextAction;
  type: "plan" | "adaptation";
  planPurchased: string | null;
  planName: string | null;
  creditsGranted: number | null;
  analysisCreditsGranted: number | null;
  adaptationId: string | null;
  originAction: "buy_credits" | "unlock_cv";
  originAdaptationId: string | null;
  autoUnlockProcessedAt: string | null;
  autoUnlockError: string | null;
  adaptationUnlocked: boolean;
  paymentId: string | null;
  message: string;
};

export async function getCheckoutStatusClient(
  checkoutId: string,
  params?: {
    paymentId?: string | null;
    preferenceId?: string | null;
    status?: string | null;
    collectionStatus?: string | null;
  },
): Promise<CheckoutStatusResponse> {
  const query = new URLSearchParams();
  if (params?.paymentId) query.set("payment_id", params.paymentId);
  if (params?.preferenceId) query.set("preference_id", params.preferenceId);
  if (params?.status) query.set("status", params.status);
  if (params?.collectionStatus) {
    query.set("collection_status", params.collectionStatus);
  }

  const suffix = query.size > 0 ? `?${query.toString()}` : "";

  const response = await fetch(
    `/api/payments/checkout/${checkoutId}/status${suffix}`,
    {
      method: "GET",
      cache: "no-store",
    },
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch checkout status: ${response.status}`);
  }

  return response.json() as Promise<CheckoutStatusResponse>;
}

export async function resumeCheckoutClient(
  purchaseId: string,
): Promise<{ checkoutUrl: string }> {
  const response = await fetch(`/api/plans/checkout/${purchaseId}/resume`, {
    method: "POST",
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("Nao foi possivel retomar o pagamento.");
  }

  return response.json() as Promise<{ checkoutUrl: string }>;
}
