import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getBackofficeSessionToken } from "@/lib/backoffice-session.server";

function getApiBaseUrl() {
  const base =
    process.env.API_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    "http://localhost:4000";
  return base.endsWith("/api") ? base : `${base}/api`;
}

export async function GET(request: NextRequest) {
  const token = await getBackofficeSessionToken();
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = request.nextUrl;
  const upstream = new URL(`${getApiBaseUrl()}/jobs`);
  for (const [k, v] of searchParams.entries()) {
    upstream.searchParams.set(k, v);
  }

  const res = await fetch(upstream.toString(), {
    cache: "no-store",
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    return NextResponse.json(
      { error: "Failed to fetch jobs" },
      { status: res.status },
    );
  }

  const data = await res.json();
  return NextResponse.json(data);
}
