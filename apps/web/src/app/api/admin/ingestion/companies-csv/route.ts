import { NextResponse } from "next/server";
import { listCompaniesPaginated } from "@/lib/admin-ingestion-api";
import { getBackofficeSessionToken } from "@/lib/backoffice-session.server";

// Exportação completa por natureza, mas lida em páginas de 100 (a API
// pagina no banco) — nunca uma única consulta com todas as empresas.
const EXPORT_PAGE_SIZE = 100;
const EXPORT_MAX_PAGES = 200;

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
    const companies: Awaited<
      ReturnType<typeof listCompaniesPaginated>
    >["rows"] = [];
    for (let page = 1; page <= EXPORT_MAX_PAGES; page += 1) {
      const result = await listCompaniesPaginated(
        { page, pageSize: EXPORT_PAGE_SIZE },
        token,
      );
      companies.push(...result.rows);
      if (page >= result.totalPages) break;
    }

    const rows = companies
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
