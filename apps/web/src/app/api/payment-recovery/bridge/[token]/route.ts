import { NextResponse } from "next/server";

function getApiBaseUrl() {
  const base =
    process.env.API_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    "http://localhost:4000";

  return base.endsWith("/api") ? base : `${base}/api`;
}

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params;
  const targetUrl = `${getApiBaseUrl()}/payment-recovery/bridge/${token}`;

  const response = await fetch(targetUrl, {
    method: "GET",
    cache: "no-store",
    redirect: "manual",
    headers: {
      Cookie: request.headers.get("cookie") ?? "",
      "user-agent": request.headers.get("user-agent") ?? "",
      "x-request-id": request.headers.get("x-request-id") ?? "",
    },
  });

  const location = response.headers.get("location");
  if (location) {
    return NextResponse.redirect(location, response.status);
  }

  const text = await response.text();
  return new NextResponse(text, {
    status: response.status,
    headers: {
      "content-type": response.headers.get("content-type") ?? "application/json",
    },
  });
}
