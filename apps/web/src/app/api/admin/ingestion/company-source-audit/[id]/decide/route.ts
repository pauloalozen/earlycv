import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { decideCompanySourceAudit } from "@/lib/admin-ingestion-api";
import { getBackofficeSessionToken } from "@/lib/backoffice-session.server";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const token = await getBackofficeSessionToken();
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const status = body?.status;
  if (status !== "approved" && status !== "rejected") {
    return NextResponse.json(
      { error: "status must be 'approved' or 'rejected'" },
      { status: 400 },
    );
  }

  try {
    const result = await decideCompanySourceAudit(
      id,
      status,
      body?.note,
      token,
    );
    return NextResponse.json(result);
  } catch {
    return NextResponse.json(
      { error: "Failed to update company source audit finding" },
      { status: 500 },
    );
  }
}
