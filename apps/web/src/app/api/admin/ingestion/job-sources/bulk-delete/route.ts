import { type NextRequest, NextResponse } from "next/server";
import { bulkDeleteJobSources } from "@/lib/admin-ingestion-api";
import { getBackofficeSessionToken } from "@/lib/backoffice-session.server";

export async function DELETE(request: NextRequest) {
  const token = await getBackofficeSessionToken();
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const ids = Array.isArray(body?.ids) ? body.ids : [];
  const removeJobs = body?.removeJobs === true;
  if (ids.length === 0) {
    return NextResponse.json({ error: "ids is required" }, { status: 400 });
  }

  try {
    const result = await bulkDeleteJobSources(ids, removeJobs, token);
    return NextResponse.json(result);
  } catch {
    return NextResponse.json(
      { error: "Failed to delete job sources" },
      { status: 500 },
    );
  }
}
