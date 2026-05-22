import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params;
  const url = new URL(request.url);
  const query = url.searchParams.toString();
  const suffix = query ? `?${query}` : "";
  return NextResponse.redirect(new URL(`/api/payment-recovery/${token}${suffix}`, url));
}
