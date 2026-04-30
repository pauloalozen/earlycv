import { NextResponse } from "next/server";

import { apiRequest } from "@/lib/api-request";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ checkoutId: string }> },
) {
  const { checkoutId } = await context.params;

  const currentUrl = new URL(request.url);
  const query = new URLSearchParams();
  const paymentId = currentUrl.searchParams.get("payment_id");
  const preferenceId = currentUrl.searchParams.get("preference_id");
  const status = currentUrl.searchParams.get("status");
  const collectionStatus = currentUrl.searchParams.get("collection_status");

  if (paymentId) query.set("payment_id", paymentId);
  if (preferenceId) query.set("preference_id", preferenceId);
  if (status) query.set("status", status);
  if (collectionStatus) query.set("collection_status", collectionStatus);

  const querySuffix = query.size > 0 ? `?${query.toString()}` : "";
  const response = await apiRequest(
    "GET",
    `/payments/checkout/${checkoutId}/status${querySuffix}`,
  );
  const text = await response.text();

  return new NextResponse(text, {
    status: response.status,
    headers: {
      "content-type":
        response.headers.get("content-type") ?? "application/json",
    },
  });
}
