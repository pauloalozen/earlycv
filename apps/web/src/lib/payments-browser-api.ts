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

export type BrickCheckoutResponse = {
  purchaseId: string;
  amount: number;
  currency: string;
  description: string;
  status: "pending";
  originAction: "buy_credits" | "unlock_cv";
  originAdaptationId: string | null;
  payerEmail: string | null;
  checkoutMode: "brick";
};

export type BrickPayResponse = {
  purchaseId: string;
  status: "approved" | "pending";
  checkoutMode: "brick";
  redirectTo: string;
  qrCodeBase64: string | null;
  qrCodeText: string | null;
};

export type CheckoutApiError = Error & {
  status?: number;
  errorCode?: string;
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

export async function getBrickCheckoutClient(
  purchaseId: string,
): Promise<BrickCheckoutResponse> {
  const response = await fetch(`/api/payments/brick/checkout/${purchaseId}`, {
    method: "GET",
    cache: "no-store",
  });

  if (!response.ok) {
    const error = (new Error(
      "Nao foi possivel carregar os dados do checkout.",
    ) as CheckoutApiError);
    error.status = response.status;
    try {
      const payload = (await response.json()) as {
        errorCode?: string;
        message?: string;
      };
      if (payload.errorCode) error.errorCode = payload.errorCode;
      if (payload.message) error.message = payload.message;
    } catch {
      // ignore non-json error payload
    }
    throw error;
  }

  return response.json() as Promise<BrickCheckoutResponse>;
}

export async function submitBrickPaymentClient(
  purchaseId: string,
  payload: unknown,
): Promise<BrickPayResponse> {
  const response = await fetch(`/api/payments/brick/${purchaseId}/pay`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  if (!response.ok) {
    const error = (new Error(
      "Nao foi possivel validar o pagamento.",
    ) as CheckoutApiError);
    error.status = response.status;
    try {
      const parsed = (await response.json()) as {
        errorCode?: string;
        message?: string;
      };
      if (parsed.errorCode) error.errorCode = parsed.errorCode;
      if (parsed.message) error.message = parsed.message;
    } catch {
      // ignore non-json error payload
    }
    throw error;
  }

  return response.json() as Promise<BrickPayResponse>;
}
