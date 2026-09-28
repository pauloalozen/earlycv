import { NextResponse } from "next/server";

import { getCurrentAppUserFromCookies } from "@/lib/app-session.server";
import { previewPlanCoupon } from "@/lib/plans-api";

const VALID_PLAN_IDS = ["starter", "pro", "turbo"] as const;
type CheckoutPlanId = (typeof VALID_PLAN_IDS)[number];

type PreviewPayload = {
  planId?: string;
  couponCode?: string;
};

export async function POST(request: Request) {
  const user = await getCurrentAppUserFromCookies();

  if (!user) {
    return NextResponse.json({ message: "unauthorized" }, { status: 401 });
  }

  const payload = (await request.json().catch(() => ({}))) as PreviewPayload;

  if (
    !payload.planId ||
    !VALID_PLAN_IDS.includes(payload.planId as CheckoutPlanId) ||
    !payload.couponCode?.trim()
  ) {
    return NextResponse.json({ message: "payload-invalido" }, { status: 400 });
  }

  const result = await previewPlanCoupon(
    payload.planId as CheckoutPlanId,
    payload.couponCode.trim(),
  );

  return NextResponse.json(result);
}
