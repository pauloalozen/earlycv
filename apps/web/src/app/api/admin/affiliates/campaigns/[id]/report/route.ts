import { NextResponse } from "next/server";

import { getAdminAffiliateCampaignReport } from "@/lib/admin-affiliates-api";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const report = await getAdminAffiliateCampaignReport(id);
    return NextResponse.json(report);
  } catch (err) {
    return NextResponse.json(
      { message: err instanceof Error ? err.message : "erro" },
      { status: 502 },
    );
  }
}
