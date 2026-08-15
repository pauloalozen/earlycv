import { type NextRequest, NextResponse } from "next/server";
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
  const params = new URLSearchParams();
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  const query = params.toString();

  const res = await fetch(
    `${getApiBaseUrl()}/admin/dashboard/activity-metrics${query ? `?${query}` : ""}`,
    {
      cache: "no-store",
      headers: { Authorization: `Bearer ${token}` },
    },
  );

  if (!res.ok) {
    return NextResponse.json(
      { error: "Failed to fetch activity metrics" },
      { status: res.status },
    );
  }

  const data = await res.json();
  return NextResponse.json(data);
}
