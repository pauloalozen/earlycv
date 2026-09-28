import { NextResponse } from "next/server";

import {
  createAdminAffiliateCampaign,
  listAdminAffiliateCampaigns,
} from "@/lib/admin-affiliates-api";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const partnerId = url.searchParams.get("partnerId") ?? undefined;
  try {
    const campaigns = await listAdminAffiliateCampaigns(partnerId);
    return NextResponse.json(campaigns);
  } catch (err) {
    return NextResponse.json(
      { message: err instanceof Error ? err.message : "erro" },
      { status: 502 },
    );
  }
}

export async function POST(request: Request) {
  const payload = await request.json().catch(() => ({}));
  try {
    const campaign = await createAdminAffiliateCampaign(payload);
    return NextResponse.json(campaign);
  } catch (err) {
    return NextResponse.json(
      { message: err instanceof Error ? err.message : "erro" },
      { status: 400 },
    );
  }
}
