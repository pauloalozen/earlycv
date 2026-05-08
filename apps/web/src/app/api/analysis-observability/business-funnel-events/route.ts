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
  const forwardedPosthogSessionId = request.headers
    .get("x-posthog-session-id")
    ?.trim();

  let bodySessionId: string | null = null;
  if (forwardedPosthogSessionId) {
    bodySessionId = forwardedPosthogSessionId;
  } else {
    try {
      const parsed = JSON.parse(body) as {
        metadata?: { $session_id?: unknown };
      };
      const candidate = parsed.metadata?.$session_id;
      if (typeof candidate === "string" && candidate.trim().length > 0) {
        bodySessionId = candidate.trim();
      }
    } catch {
      bodySessionId = null;
    }
  }

  const apiResponse = await fetch(
    `${getApiBaseUrl()}/analysis-observability/business-funnel-events`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(bodySessionId ? { "x-posthog-session-id": bodySessionId } : {}),
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
