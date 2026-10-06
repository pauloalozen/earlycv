import { NextResponse } from "next/server";

import { apiRequest } from "@/lib/api-request";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ message: "Corpo inválido." }, { status: 400 });
  }

  const response = await apiRequest("POST", "/mock-interviews/checkout", {
    acceptPolicy: body.acceptPolicy === true,
    ...(typeof body.origin === "string" ? { origin: body.origin } : {}),
    ...(typeof body.jobApplicationId === "string" && body.jobApplicationId
      ? { jobApplicationId: body.jobApplicationId }
      : {}),
  });
  const text = await response.text();
  return new NextResponse(text, {
    status: response.status,
    headers: {
      "content-type":
        response.headers.get("content-type") ?? "application/json",
    },
  });
}
