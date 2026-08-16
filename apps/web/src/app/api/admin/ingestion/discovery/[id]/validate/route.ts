import { NextResponse } from "next/server";
import { getBackofficeSessionToken } from "@/lib/backoffice-session.server";

function getApiBaseUrl() {
  const base =
    process.env.API_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    "http://localhost:4000";
  return base.endsWith("/api") ? base : `${base}/api`;
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const token = await getBackofficeSessionToken();
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const res = await fetch(`${getApiBaseUrl()}/admin/discovery/${id}/validate`, {
    cache: "no-store",
    headers: { Authorization: `Bearer ${token}` },
    method: "POST",
  });

  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
