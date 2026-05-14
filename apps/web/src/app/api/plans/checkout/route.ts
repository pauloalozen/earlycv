import { NextResponse } from "next/server";

import { getCurrentAppUserFromCookies } from "@/lib/app-session.server";
import { createPlanCheckout } from "@/lib/plans-api";

const VALID_PLAN_IDS = ["starter", "pro", "turbo"] as const;
type CheckoutPlanId = (typeof VALID_PLAN_IDS)[number];

type CheckoutPayload = {
  planId?: string;
  adaptationId?: string;
};

export async function POST(request: Request) {
  const user = await getCurrentAppUserFromCookies();

  if (!user) {
    return NextResponse.json({ message: "unauthorized" }, { status: 401 });
  }

  const payload = (await request.json().catch(() => ({}))) as CheckoutPayload;

  if (!payload.planId || !VALID_PLAN_IDS.includes(payload.planId as CheckoutPlanId)) {
    return NextResponse.json({ message: "plano-invalido" }, { status: 400 });
  }

  try {
    const result = await createPlanCheckout(
      payload.planId as CheckoutPlanId,
      payload.adaptationId?.trim() || undefined,
    );

    return NextResponse.json({
      checkoutUrl: result.checkoutUrl,
      purchaseId: result.purchaseId,
      ...(result.checkoutMode ? { checkoutMode: result.checkoutMode } : {}),
    });
  } catch {
    return NextResponse.json({ message: "checkout-failed" }, { status: 502 });
  }
}
