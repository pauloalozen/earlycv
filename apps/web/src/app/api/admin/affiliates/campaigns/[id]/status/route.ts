import { NextResponse } from "next/server";

import { setAdminAffiliateCampaignStatus } from "@/lib/admin-affiliates-api";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const payload = await request.json().catch(() => ({}));
  try {
    const campaign = await setAdminAffiliateCampaignStatus(id, payload.status);
    return NextResponse.json(campaign);
  } catch (err) {
    return NextResponse.json(
      { message: err instanceof Error ? err.message : "erro" },
      { status: 400 },
    );
  }
}
