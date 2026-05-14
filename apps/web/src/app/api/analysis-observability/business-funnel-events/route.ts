import { NextResponse } from "next/server";

const MAX_POSTHOG_SESSION_ID_LENGTH = 256;

function getApiBaseUrl() {
  const base =
    process.env.API_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    "http://localhost:4000";
  return base.endsWith("/api") ? base : `${base}/api`;
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const forwardedPosthogSessionId = request.headers
    .get("x-posthog-session-id")
    ?.trim();

  let bodySessionId: string | null = null;
  if (
    forwardedPosthogSessionId &&
    forwardedPosthogSessionId.length <= MAX_POSTHOG_SESSION_ID_LENGTH
  ) {
    bodySessionId = forwardedPosthogSessionId;
  } else {
    try {
      const parsed = JSON.parse(rawBody) as {
        metadata?: { $session_id?: unknown };
      };
      const candidate = parsed.metadata?.$session_id;
      if (
        typeof candidate === "string" &&
        candidate.trim().length > 0 &&
        candidate.trim().length <= MAX_POSTHOG_SESSION_ID_LENGTH
      ) {
        bodySessionId = candidate.trim();
      }
    } catch {
      bodySessionId = null;
    }
  }

  let body = rawBody;
  try {
    const parsed = JSON.parse(rawBody) as {
      metadata?: Record<string, unknown>;
    };
    if (parsed && typeof parsed === "object" && parsed.metadata) {
      delete parsed.metadata.body;
      delete parsed.metadata.rawPayload;
      body = JSON.stringify(parsed);
    }
  } catch {
    body = rawBody;
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
