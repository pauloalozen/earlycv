import { NextResponse } from "next/server";

import { trackCouponVisit } from "@/lib/plans-api";

type VisitPayload = {
  couponCode?: string;
  visitorId?: string;
};

// Rota pública (sem checagem de sessão) — a visita acontece antes do
// cadastro/login. Dedup real acontece no backend por visitor_id+código+dia.
export async function POST(request: Request) {
  const payload = (await request.json().catch(() => ({}))) as VisitPayload;
  const couponCode = payload.couponCode?.trim();

  if (!couponCode) {
    return NextResponse.json({ tracked: false }, { status: 400 });
  }

  const result = await trackCouponVisit(
    couponCode,
    payload.visitorId?.trim() || undefined,
  );
  return NextResponse.json(result);
}
