import { NextResponse } from "next/server";
import { listCompanies } from "@/lib/admin-ingestion-api";
import { getBackofficeSessionToken } from "@/lib/backoffice-session.server";

const CSV_HEADER = ["nome", "setor", "site_url", "careers_url", "linkedin_url"];

function toCsvField(value: string | null) {
  return (value ?? "").replace(/[,\r\n]/g, " ").trim();
}

export async function GET() {
  const token = await getBackofficeSessionToken();
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const companies = await listCompanies(token);
    const rows = companies
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((company) =>
        [
          toCsvField(company.name),
          toCsvField(company.industry),
          toCsvField(company.websiteUrl),
          toCsvField(company.careersUrl),
          toCsvField(company.linkedinUrl),
        ].join(","),
      );

    const csv = [CSV_HEADER.join(","), ...rows].join("\n");

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="empresas-fontes.csv"',
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Failed to export companies" },
      { status: 500 },
    );
  }
}
