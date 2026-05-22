import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import { APP_ACCESS_TOKEN_COOKIE_NAME } from "@/lib/app-session";

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
  const cookieStore = await cookies();
  const accessToken =
    cookieStore.get(APP_ACCESS_TOKEN_COOKIE_NAME)?.value ?? null;

  const headers: Record<string, string> = {
    Cookie: request.headers.get("cookie") ?? "",
    "user-agent": request.headers.get("user-agent") ?? "",
    "x-request-id": request.headers.get("x-request-id") ?? "",
  };

  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  const response = await fetch(targetUrl, {
    method: "GET",
    cache: "no-store",
    redirect: "manual",
    headers,
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
