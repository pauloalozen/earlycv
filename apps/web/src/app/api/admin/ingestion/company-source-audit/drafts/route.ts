import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { listCompanySourceAuditDrafts } from "@/lib/admin-ingestion-api";
import { getBackofficeSessionToken } from "@/lib/backoffice-session.server";

export async function GET(request: NextRequest) {
  const token = await getBackofficeSessionToken();
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const page = Number.parseInt(
      new URL(request.url).searchParams.get("page") ?? "",
      10,
    );
    const result = await listCompanySourceAuditDrafts(
      { page: page || undefined },
      token,
    );
    return NextResponse.json(result);
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch company source audit drafts" },
      { status: 500 },
    );
  }
}
