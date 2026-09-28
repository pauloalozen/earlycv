import { NextResponse } from "next/server";

import { setAdminAffiliateCodeStatus } from "@/lib/admin-affiliates-api";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const payload = await request.json().catch(() => ({}));
  try {
    const code = await setAdminAffiliateCodeStatus(id, payload.status);
    return NextResponse.json(code);
  } catch (err) {
    return NextResponse.json(
      { message: err instanceof Error ? err.message : "erro" },
      { status: 400 },
    );
  }
}
