import { NextResponse } from "next/server";

import { apiRequest } from "@/lib/api-request";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const refresh = new URL(request.url).searchParams.get("refresh") === "1";
  const response = await apiRequest(
    "GET",
    `/mock-interviews/purchases/${encodeURIComponent(id)}${refresh ? "?refresh=true" : ""}`,
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
