import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import type {
  CompanySourceAuditStatus,
  CompanySourceAuditTier,
} from "@/lib/admin-ingestion-api";
import { listCompanySourceAudits } from "@/lib/admin-ingestion-api";
import { getBackofficeSessionToken } from "@/lib/backoffice-session.server";

export async function GET(request: NextRequest) {
  const token = await getBackofficeSessionToken();
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  try {
    const result = await listCompanySourceAudits(
      {
        status:
          (searchParams.get("status") as CompanySourceAuditStatus | null) ??
          undefined,
        tier:
          (searchParams.get("tier") as CompanySourceAuditTier | null) ??
          undefined,
        search: searchParams.get("search") ?? undefined,
      },
      token,
    );
    return NextResponse.json(result);
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch company source audit findings" },
      { status: 500 },
    );
  }
}
