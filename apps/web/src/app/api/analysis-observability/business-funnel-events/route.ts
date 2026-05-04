import { NextResponse } from "next/server";

function getApiBaseUrl() {
  const base =
    process.env.API_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    "http://localhost:4000";
  return base.endsWith("/api") ? base : `${base}/api`;
}

export async function POST(request: Request) {
  const body = await request.text();

  const apiResponse = await fetch(
    `${getApiBaseUrl()}/analysis-observability/business-funnel-events`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body,
      cache: "no-store",
    },
  );

  const responseBody = await apiResponse.text();

  return new NextResponse(responseBody, {
    status: apiResponse.status,
    headers: {
      "Content-Type":
        apiResponse.headers.get("content-type") ?? "application/json",
    },
  });
}
