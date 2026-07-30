import { NextResponse } from "next/server";
import { getBackofficeSessionToken } from "@/lib/backoffice-session.server";

function getApiBaseUrl() {
  const base =
    process.env.API_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    "http://localhost:4000";
  return base.endsWith("/api") ? base : `${base}/api`;
}

export async function GET() {
  const token = await getBackofficeSessionToken();
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const res = await fetch(`${getApiBaseUrl()}/ingestion/enrichment/config`, {
    cache: "no-store",
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    return NextResponse.json(
      { error: "Failed to fetch enrichment config" },
      { status: res.status },
    );
  }

  return NextResponse.json(await res.json());
}

export async function PUT(request: Request) {
  const token = await getBackofficeSessionToken();
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.text();

  const res = await fetch(`${getApiBaseUrl()}/ingestion/enrichment/config`, {
    body,
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    method: "PUT",
  });

  if (!res.ok) {
    return NextResponse.json(
      { error: "Failed to update enrichment config" },
      { status: res.status },
    );
  }

  return NextResponse.json(await res.json());
}
