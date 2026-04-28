import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { getCurrentAppSession } from "@/lib/app-session.server";

function getApiBaseUrl() {
  const base =
    process.env.API_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    "http://localhost:4000";
  return base.endsWith("/api") ? base : `${base}/api`;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const session = await getCurrentAppSession();
  const token = session?.accessToken;

  if (!token) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const body = await request.text();

  const apiResponse = await fetch(
    `${getApiBaseUrl()}/cv-adaptation/${id}/redeem-credit`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      cache: "no-store",
      body,
    },
  );

  if (!apiResponse.ok) {
    const error = await apiResponse.text();
    return NextResponse.json(
      { message: error },
      { status: apiResponse.status },
    );
  }

  const json = (await apiResponse.json()) as unknown;
  return NextResponse.json(json);
}
