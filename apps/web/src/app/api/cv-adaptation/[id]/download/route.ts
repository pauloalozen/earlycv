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
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  // Use getCurrentAppSession so expired tokens are refreshed automatically
  const session = await getCurrentAppSession();
  const token = session?.accessToken;

  if (!token) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const format = request.nextUrl.searchParams.get("format") ?? "pdf";

  const apiResponse = await fetch(
    `${getApiBaseUrl()}/cv-adaptation/${id}/download?format=${format}`,
    {
      headers: { Authorization: `Bearer ${token}` },
    },
  );

  if (!apiResponse.ok) {
    const error = await apiResponse.text();
    return NextResponse.json(
      { message: error },
      { status: apiResponse.status },
    );
  }

  const buffer = await apiResponse.arrayBuffer();

  if (format === "docx") {
    return new NextResponse(buffer, {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="cv-adaptado.docx"`,
      },
    });
  }

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="cv-adaptado.pdf"`,
    },
  });
}
