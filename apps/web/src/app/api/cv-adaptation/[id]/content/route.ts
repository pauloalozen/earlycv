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

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const session = await getCurrentAppSession();
  const token = session?.accessToken;

  if (!token) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const apiResponse = await fetch(
    `${getApiBaseUrl()}/cv-adaptation/${id}/content`,
    {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    },
  );

  if (!apiResponse.ok) {
    const error = await apiResponse.text();
    return NextResponse.json(
      { message: error },
      { status: apiResponse.status },
    );
  }

  const json = (await apiResponse.json()) as {
    adaptedContentJson: unknown;
    paymentStatus: string;
    status: string;
    jobTitle: string | null;
    companyName: string | null;
  };
  return NextResponse.json(json);
}
