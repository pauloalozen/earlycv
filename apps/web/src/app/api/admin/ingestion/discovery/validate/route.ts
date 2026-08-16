import { NextResponse } from "next/server";
import { getBackofficeSessionToken } from "@/lib/backoffice-session.server";

function getApiBaseUrl() {
  const base =
    process.env.API_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    "http://localhost:4000";
  return base.endsWith("/api") ? base : `${base}/api`;
}

export async function POST(request: Request) {
  const token = await getBackofficeSessionToken();
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const limit = new URL(request.url).searchParams.get("limit");
  const url = new URL(`${getApiBaseUrl()}/admin/discovery/validate`);
  if (limit) url.searchParams.set("limit", limit);

  const res = await fetch(url, {
    cache: "no-store",
    headers: { Authorization: `Bearer ${token}` },
    method: "POST",
  });

  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
