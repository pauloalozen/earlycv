import { NextResponse } from "next/server";

import { apiRequest } from "@/lib/api-request";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { errorCode: "brick_payload_invalid", message: "Corpo inválido." },
      { status: 400 },
    );
  }
  const response = await apiRequest(
    "POST",
    `/mock-interviews/purchases/${encodeURIComponent(id)}/brick/pay`,
    body,
    60_000,
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
