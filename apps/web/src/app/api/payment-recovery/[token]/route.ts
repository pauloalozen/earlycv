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
  const incomingUrl = new URL(request.url);
  const query = incomingUrl.searchParams.toString();
  const suffix = query ? `?${query}` : "";
  const targetUrl = `${getApiBaseUrl()}/payment-recovery/${token}${suffix}`;
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
    try {
      const locationUrl = new URL(location, incomingUrl);
      if (locationUrl.pathname === "/recuperar-pagamento") {
        return new NextResponse("Not Found", { status: 404 });
      }
    } catch {
      return new NextResponse("Not Found", { status: 404 });
    }
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
