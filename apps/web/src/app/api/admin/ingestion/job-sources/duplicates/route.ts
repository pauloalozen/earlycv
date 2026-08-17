import { NextResponse } from "next/server";
import { listDuplicateJobSources } from "@/lib/admin-ingestion-api";
import { getBackofficeSessionToken } from "@/lib/backoffice-session.server";

export async function GET() {
  const token = await getBackofficeSessionToken();
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await listDuplicateJobSources(token);
    return NextResponse.json(result);
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch duplicate sources" },
      { status: 500 },
    );
  }
}
