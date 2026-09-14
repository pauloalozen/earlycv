import { NextResponse } from "next/server";
import { getBackofficeSessionToken } from "@/lib/backoffice-session.server";

function getApiBaseUrl() {
  const base =
    process.env.API_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    "http://localhost:4000";
  return base.endsWith("/api") ? base : `${base}/api`;
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ jobId: string }> },
) {
  const token = await getBackofficeSessionToken();
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { jobId } = await params;
  const body = await request.json();

  const res = await fetch(`${getApiBaseUrl()}/job-curation/jobs/${jobId}`, {
    body: JSON.stringify(body),
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    method: "PUT",
  });

  if (!res.ok) {
    return NextResponse.json(
      { error: "Failed to update curation status" },
      { status: res.status },
    );
  }

  return NextResponse.json(await res.json());
}
