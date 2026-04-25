"use server";

import { apiRequest } from "./api-request";

export type PlanInfo = {
  planType: "free" | "starter" | "pro" | "turbo" | "unlimited";
  creditsRemaining: number | null;
  planExpiresAt: string | null;
  isActive: boolean;
};

export async function getMyPlan(): Promise<PlanInfo> {
  const response = await apiRequest("GET", "/plans/me");
  if (!response.ok) throw new Error("Failed to fetch plan info");
  return response.json() as Promise<PlanInfo>;
}

export async function createPlanCheckout(
  planId: "starter" | "pro" | "turbo",
  adaptationId?: string,
): Promise<{ checkoutUrl: string; purchaseId: string }> {
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
  }>;
}
