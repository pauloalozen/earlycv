import { NextResponse } from "next/server";

import { getCurrentAppUserFromCookies } from "@/lib/app-session.server";
import { redeemFreePlanCoupon } from "@/lib/plans-api";

const VALID_PLAN_IDS = ["starter", "pro", "turbo"] as const;
type CheckoutPlanId = (typeof VALID_PLAN_IDS)[number];

type RedeemPayload = {
  planId?: string;
  couponCode?: string;
};

export async function POST(request: Request) {
  const user = await getCurrentAppUserFromCookies();

  if (!user) {
    return NextResponse.json({ message: "unauthorized" }, { status: 401 });
  }

  const payload = (await request.json().catch(() => ({}))) as RedeemPayload;

  if (
    !payload.planId ||
    !VALID_PLAN_IDS.includes(payload.planId as CheckoutPlanId) ||
    !payload.couponCode?.trim()
  ) {
    return NextResponse.json({ message: "payload-invalido" }, { status: 400 });
  }

  try {
    const result = await redeemFreePlanCoupon(
      payload.planId as CheckoutPlanId,
      payload.couponCode.trim(),
    );
    return NextResponse.json(result);
  } catch {
    return NextResponse.json(
      { message: "resgate-indisponivel" },
      { status: 409 },
    );
  }
}
