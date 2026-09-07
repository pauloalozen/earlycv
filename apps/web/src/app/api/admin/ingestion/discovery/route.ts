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

  const { searchParams } = new URL(request.url);
  const forwarded = new URLSearchParams();
  for (const key of ["status", "search", "page", "pageSize"]) {
    const value = searchParams.get(key);
    if (value) forwarded.set(key, value);
  }
  const qs = forwarded.toString() ? `?${forwarded.toString()}` : "";

  const res = await fetch(`${getApiBaseUrl()}/admin/discovery${qs}`, {
    cache: "no-store",
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    return NextResponse.json(
      { error: "Failed to list discovered companies" },
      { status: res.status },
    );
  }

  return NextResponse.json(await res.json());
}
