import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { renameCompanySourceAuditDraft } from "@/lib/admin-ingestion-api";
import { getBackofficeSessionToken } from "@/lib/backoffice-session.server";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ companyId: string }> },
) {
  const token = await getBackofficeSessionToken();
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { companyId } = await params;
  const body = await request.json().catch(() => ({}));
  const name = typeof body?.name === "string" ? body.name : "";
  if (!name.trim()) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  try {
    const result = await renameCompanySourceAuditDraft(
      companyId,
      name.trim(),
      token,
    );
    return NextResponse.json(result);
  } catch {
    return NextResponse.json(
      { error: "Failed to rename draft" },
      { status: 500 },
    );
  }
}
