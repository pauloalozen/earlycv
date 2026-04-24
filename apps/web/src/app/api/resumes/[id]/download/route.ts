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

  const apiResponse = await fetch(`${getApiBaseUrl()}/resumes/${id}/download`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!apiResponse.ok) {
    const error = await apiResponse.text();
    return NextResponse.json(
      { message: error },
      { status: apiResponse.status },
    );
  }

  const buffer = await apiResponse.arrayBuffer();
  const contentDisposition =
    apiResponse.headers.get("Content-Disposition") ??
    'attachment; filename="cv.txt"';
  const contentType =
    apiResponse.headers.get("Content-Type") ?? "application/octet-stream";

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": contentDisposition,
    },
  });
}
