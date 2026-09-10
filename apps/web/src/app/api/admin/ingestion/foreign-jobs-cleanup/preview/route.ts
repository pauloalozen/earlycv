import { NextResponse } from "next/server";
import { previewForeignJobsCleanup } from "@/lib/admin-ingestion-api";
import { getBackofficeSessionToken } from "@/lib/backoffice-session.server";

export async function GET() {
  const token = await getBackofficeSessionToken();
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await previewForeignJobsCleanup(token);
    return NextResponse.json(result);
  } catch {
    return NextResponse.json(
      { error: "Failed to preview foreign jobs cleanup" },
      { status: 500 },
    );
  }
}
