import { type NextRequest, NextResponse } from "next/server";
import { listJobSourcesPaginated } from "@/lib/admin-ingestion-api";
import { getBackofficeSessionToken } from "@/lib/backoffice-session.server";

export async function GET(req: NextRequest) {
  const token = await getBackofficeSessionToken();
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = req.nextUrl;
  const page = searchParams.get("page") ? Number(searchParams.get("page")) : undefined;
  const pageSize = searchParams.get("pageSize") ? Number(searchParams.get("pageSize")) : undefined;
  const search = searchParams.get("search") ?? undefined;
  const statusFilter = searchParams.get("statusFilter") ?? undefined;
  const typeFilter = searchParams.get("typeFilter") ?? undefined;

  try {
    const result = await listJobSourcesPaginated(
      { page, pageSize, search, statusFilter, typeFilter },
      token,
    );
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "Failed to fetch sources" }, { status: 500 });
  }
}
