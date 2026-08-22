import { NextResponse } from "next/server";
import { runCompanySourceAudit } from "@/lib/admin-ingestion-api";
import { getBackofficeSessionToken } from "@/lib/backoffice-session.server";

export async function POST() {
  const token = await getBackofficeSessionToken();
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runCompanySourceAudit(token);
    return NextResponse.json(result);
  } catch {
    return NextResponse.json(
      { error: "Failed to run company source audit" },
      { status: 500 },
    );
  }
}
