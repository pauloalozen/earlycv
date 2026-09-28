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
  status:
    | "none"
    | "pending"
    | "processing_payment"
    | "pending_payment"
    | "completed"
    | "failed"
    | "refunded";
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

export type AppliedCouponSummary = {
  code: { id: string; code: string };
  campaign: { id: string; name: string };
  amountInCents: number;
  creditsGranted: number;
  discountAmountInCents: number;
  bonusCreditsGranted: number;
};

export type CreatePlanCheckoutResult = {
  checkoutUrl: string | null;
  purchaseId: string | null;
  checkoutMode?: "brick" | "free_coupon_confirmation_required";
  amountInCents?: number;
  creditsGranted?: number;
  appliedCoupon?: AppliedCouponSummary | null;
};

export async function createPlanCheckout(
  planId: "starter" | "pro" | "turbo",
  adaptationId?: string,
  selectedMissingKeywords: string[] = [],
  gaClientId?: string,
  couponCode?: string,
): Promise<CreatePlanCheckoutResult> {
  const response = await apiRequest("POST", "/plans/checkout", {
    planId,
    ...(adaptationId ? { adaptationId } : {}),
    ...(selectedMissingKeywords.length > 0 ? { selectedMissingKeywords } : {}),
    ...(gaClientId ? { gaClientId } : {}),
    ...(couponCode ? { couponCode } : {}),
  });
  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Checkout failed: ${err}`);
  }
  return response.json() as Promise<CreatePlanCheckoutResult>;
}

export async function previewPlanCoupon(
  planId: "starter" | "pro" | "turbo",
  couponCode: string,
): Promise<{
  valid: boolean;
  discountAmountInCents?: number;
  bonusCreditsGranted?: number;
  reason?: string;
}> {
  const response = await apiRequest("POST", "/plans/coupon/preview", {
    planId,
    couponCode,
  });
  if (!response.ok) {
    return { valid: false, reason: "preview-failed" };
  }
  return response.json() as Promise<{
    valid: boolean;
    discountAmountInCents?: number;
    bonusCreditsGranted?: number;
    reason?: string;
  }>;
}

export async function trackCouponVisit(
  couponCode: string,
  visitorId?: string,
): Promise<{ tracked: boolean }> {
  const response = await apiRequest("POST", "/plans/coupon/visit", {
    couponCode,
    ...(visitorId ? { visitorId } : {}),
  });
  if (!response.ok) {
    return { tracked: false };
  }
  return response.json() as Promise<{ tracked: boolean }>;
}

export async function redeemFreePlanCoupon(
  planId: "starter" | "pro" | "turbo",
  couponCode: string,
): Promise<{ purchaseId: string; creditsGranted: number }> {
  const response = await apiRequest(
    "POST",
    "/plans/checkout/redeem-free-coupon",
    {
      planId,
      couponCode,
    },
  );
  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Free coupon redemption failed: ${err}`);
  }
  return response.json() as Promise<{
    purchaseId: string;
    creditsGranted: number;
  }>;
}
