import { NextResponse } from "next/server";

import { createAdminAffiliateCode } from "@/lib/admin-affiliates-api";

export async function POST(request: Request) {
  const payload = await request.json().catch(() => ({}));
  try {
    const code = await createAdminAffiliateCode(payload);
    return NextResponse.json(code);
  } catch (err) {
    return NextResponse.json(
      { message: err instanceof Error ? err.message : "erro" },
      { status: 400 },
    );
  }
}
