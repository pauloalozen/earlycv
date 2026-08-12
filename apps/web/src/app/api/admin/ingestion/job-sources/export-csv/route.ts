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

  const res = await fetch(
    `${getApiBaseUrl()}/ingestion/job-sources/export-csv`,
    {
      cache: "no-store",
      headers: { Authorization: `Bearer ${token}` },
    },
  );

  if (!res.ok) {
    return NextResponse.json(
      { error: "Failed to export job sources" },
      { status: res.status },
    );
  }

  const csv = await res.text();
  return new NextResponse(csv, {
    headers: {
      "Content-Disposition": res.headers.get("Content-Disposition") ??
        'attachment; filename="job-sources.csv"',
      "Content-Type": "text/csv; charset=utf-8",
    },
  });
}
