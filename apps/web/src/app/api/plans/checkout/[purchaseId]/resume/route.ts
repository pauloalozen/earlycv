import { NextResponse } from "next/server";

import { apiRequest } from "@/lib/api-request";

export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  context: { params: Promise<{ purchaseId: string }> },
) {
  const { purchaseId } = await context.params;
  const response = await apiRequest(
    "POST",
    `/plans/checkout/${purchaseId}/resume`,
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
