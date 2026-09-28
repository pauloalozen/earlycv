import { NextResponse } from "next/server";

import {
  createAdminAffiliatePartner,
  listAdminAffiliatePartners,
} from "@/lib/admin-affiliates-api";

export async function GET() {
  try {
    const partners = await listAdminAffiliatePartners();
    return NextResponse.json(partners);
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
    const partner = await createAdminAffiliatePartner(payload);
    return NextResponse.json(partner);
  } catch (err) {
    return NextResponse.json(
      { message: err instanceof Error ? err.message : "erro" },
      { status: 400 },
    );
  }
}
