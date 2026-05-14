"use server";

import { apiRequest } from "./api-request";

export type PlanInfo = {
  planType: "free" | "starter" | "pro" | "turbo" | "unlimited";
  creditsRemaining: number | null;
  planExpiresAt: string | null;
  isActive: boolean;
};

export type PurchaseItem = {
  id: string;
  planType: string;
  planName: string | null;
  amountInCents: number;
  currency: string;
  status: "none" | "pending" | "processing_payment" | "pending_payment" | "completed" | "failed" | "refunded";
  paidAt: string | null;
  creditsGranted: number;
  analysisCreditsGranted: number;
  mpPaymentId: string | null;
  mpPreferenceId: string | null;
  paymentReference: string;
  createdAt: string;
  pendingPaymentUrl: string | null;
};

export async function getMyPlan(): Promise<PlanInfo> {
  const response = await apiRequest("GET", "/plans/me");
  if (!response.ok) throw new Error("Failed to fetch plan info");
  return response.json() as Promise<PlanInfo>;
}

export async function listMyPurchases(): Promise<PurchaseItem[]> {
  const response = await apiRequest("GET", "/plans/purchases/me");
  if (!response.ok) throw new Error("Failed to fetch purchases");
  return response.json() as Promise<PurchaseItem[]>;
}

export async function createPlanCheckout(
  planId: "starter" | "pro" | "turbo",
  adaptationId?: string,
): Promise<{
  checkoutUrl: string;
  purchaseId: string;
  checkoutMode?: "brick";
}> {
  const response = await apiRequest("POST", "/plans/checkout", {
    planId,
    ...(adaptationId ? { adaptationId } : {}),
  });
  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Checkout failed: ${err}`);
  }
  return response.json() as Promise<{
    checkoutUrl: string;
    purchaseId: string;
    checkoutMode?: "brick";
  }>;
}
