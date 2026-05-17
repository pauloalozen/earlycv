import { BadRequestException, Inject, Injectable } from "@nestjs/common";

import { DatabaseService } from "../database/database.service";
import { normalizeCompanyName } from "./name-normalization";
import { canonicalizeSourceUrl } from "./url-normalization";

const CSV_HEADER = ["nome", "setor", "site_url", "careers_url", "linkedin_url"];

type ImportLineReport = {
  companyAction: "created" | "updated";
  companyName: string;
  inferredAdapter: "custom_html" | "gupy";
  line: number;
  message: string;
  sourceAction: "created" | "updated";
  status: "success";
};

type ImportLineError = {
  companyName: string;
  line: number;
  message: string;
  status: "error";
};

export type CompanySourcesCsvImportReport = {
  lines: Array<ImportLineError | ImportLineReport>;
  summary: {
    companiesCreated: number;
    companiesUpdated: number;
    errorCount: number;
    sourcesCreated: number;
    sourcesUpdated: number;
    successCount: number;
    totalLines: number;
  };
};

type ImportInput = {
  csvText: string;
  dryRun: boolean;
};

@Injectable()
export class AdminIngestionImportService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
  ) {}

  async importCompanySourcesCsv(
    input: ImportInput,
  ): Promise<CompanySourcesCsvImportReport> {
    const lines = input.csvText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    if (lines.length < 2) {
      throw new BadRequestException("csv must include header and at least one row");
    }

    const header = lines[0]?.split(",").map((value) => value.trim().toLowerCase());

    if (
      !header ||
      header.length !== CSV_HEADER.length ||
      header.some((item, index) => item !== CSV_HEADER[index])
    ) {
      throw new BadRequestException(
        `invalid csv header, expected: ${CSV_HEADER.join(",")}`,
      );
    }

    const report: CompanySourcesCsvImportReport = {
      lines: [],
      summary: {
        companiesCreated: 0,
        companiesUpdated: 0,
        errorCount: 0,
        sourcesCreated: 0,
        sourcesUpdated: 0,
        successCount: 0,
        totalLines: lines.length - 1,
      },
    };

    for (const [index, rawLine] of lines.slice(1).entries()) {
      const lineNumber = index + 2;
      const [nome, setor, siteUrl, careersUrl, linkedinUrl] = rawLine
        .split(",")
        .map((value) => value.trim());

      if (!nome || !careersUrl) {
        report.lines.push({
          companyName: nome || "(missing)",
          line: lineNumber,
          message: "nome and careers_url are required",
          status: "error",
        });
        report.summary.errorCount += 1;
        continue;
      }

      const normalizedName = normalizeCompanyName(nome);

      if (!normalizedName) {
        report.lines.push({
          companyName: nome,
          line: lineNumber,
          message: "failed to normalize company name",
          status: "error",
        });
        report.summary.errorCount += 1;
        continue;
      }

      let canonicalSourceUrl: string;

      try {
        canonicalSourceUrl = canonicalizeSourceUrl(careersUrl);
      } catch {
        report.lines.push({
          companyName: nome,
          line: lineNumber,
          message: "invalid careers_url",
          status: "error",
        });
        report.summary.errorCount += 1;
        continue;
      }

      const inferredAdapter = careersUrl.toLowerCase().includes("gupy")
        ? "gupy"
        : "custom_html";

      try {
        const existingCompany = await this.database.company.findUnique({
          where: { normalizedName },
        });

        const companyAction = existingCompany ? "updated" : "created";
        const companyPayload = {
          ...(setor ? { industry: setor } : {}),
          ...(siteUrl ? { websiteUrl: siteUrl } : {}),
          ...(careersUrl ? { careersUrl } : {}),
          ...(linkedinUrl ? { linkedinUrl } : {}),
          name: nome,
          normalizedName,
        };

        let companyId = existingCompany?.id ?? "";

        if (!input.dryRun) {
          const company = existingCompany
            ? await this.database.company.update({
                where: { id: existingCompany.id },
                data: companyPayload,
              })
            : await this.database.company.create({ data: companyPayload });
          companyId = company.id;
        }

        const existingSource = !input.dryRun && companyId
          ? await this.database.jobSource.findUnique({
              where: {
                companyId_sourceUrl: {
                  companyId,
                  sourceUrl: canonicalSourceUrl,
                },
              },
            })
          : null;

        const sourceAction = existingSource ? "updated" : "created";

        if (!input.dryRun && companyId) {
          const sourcePayload = {
            checkIntervalMinutes: 30,
            crawlStrategy: inferredAdapter === "gupy" ? "api" : "html",
            isActive: true,
            isFallbackAdapter: inferredAdapter !== "gupy",
            parserKey: inferredAdapter === "gupy" ? "gupy" : "custom_html",
            scheduleEnabled: false,
            sourceName: `${nome} careers`,
            sourceType: inferredAdapter,
            sourceUrl: canonicalSourceUrl,
          } as const;

          if (existingSource) {
            await this.database.jobSource.update({
              where: { id: existingSource.id },
              data: sourcePayload,
            });
          } else {
            await this.database.jobSource.create({
              data: {
                ...sourcePayload,
                companyId,
              },
            });
          }
        }

        report.lines.push({
          companyAction,
          companyName: nome,
          inferredAdapter,
          line: lineNumber,
          message: input.dryRun
            ? "validated without persistence"
            : "company and source processed",
          sourceAction,
          status: "success",
        });
        report.summary.successCount += 1;
        report.summary[companyAction === "created" ? "companiesCreated" : "companiesUpdated"] += 1;
        report.summary[sourceAction === "created" ? "sourcesCreated" : "sourcesUpdated"] += 1;
      } catch (error) {
        report.lines.push({
          companyName: nome,
          line: lineNumber,
          message: error instanceof Error ? error.message : "import failed",
          status: "error",
        });
        report.summary.errorCount += 1;
      }
    }

    return report;
  }
}
