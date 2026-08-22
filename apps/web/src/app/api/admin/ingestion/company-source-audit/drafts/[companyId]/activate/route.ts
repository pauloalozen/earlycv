import { NextResponse } from "next/server";
import { activateCompanySourceAuditDraft } from "@/lib/admin-ingestion-api";
import { getBackofficeSessionToken } from "@/lib/backoffice-session.server";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ companyId: string }> },
) {
  const token = await getBackofficeSessionToken();
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { companyId } = await params;
  try {
    const result = await activateCompanySourceAuditDraft(companyId, token);
    return NextResponse.json(result);
  } catch {
    return NextResponse.json(
      { error: "Failed to activate draft" },
      { status: 500 },
    );
  }
}
