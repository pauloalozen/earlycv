import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { applyForeignJobsCleanup } from "@/lib/admin-ingestion-api";
import { getBackofficeSessionToken } from "@/lib/backoffice-session.server";

export async function POST(request: NextRequest) {
  const token = await getBackofficeSessionToken();
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const dryRun = body?.dryRun !== false;

  try {
    const result = await applyForeignJobsCleanup(dryRun, token);
    return NextResponse.json(result);
  } catch {
    return NextResponse.json(
      { error: "Failed to apply foreign jobs cleanup" },
      { status: 500 },
    );
  }
}
