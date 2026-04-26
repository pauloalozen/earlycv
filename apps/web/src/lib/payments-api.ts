"use server";

import { apiRequest } from "./api-request";

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
  paymentId: string | null;
  message: string;
};

export async function getCheckoutStatus(
  checkoutId: string,
): Promise<CheckoutStatusResponse> {
  const response = await apiRequest(
    "GET",
    `/payments/checkout/${checkoutId}/status`,
  );
  if (!response.ok) {
    throw new Error(`Failed to fetch checkout status: ${response.status}`);
  }
  return response.json() as Promise<CheckoutStatusResponse>;
}
