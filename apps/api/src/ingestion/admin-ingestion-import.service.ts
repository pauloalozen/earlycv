import { BadRequestException, Inject, Injectable } from "@nestjs/common";

import { DatabaseService } from "../database/database.service";
import { normalizeCompanyName } from "./name-normalization";
import { canonicalizeSourceUrl } from "./url-normalization";

const LEGACY_CSV_HEADER = [
  "nome",
  "setor",
  "site_url",
  "careers_url",
  "linkedin_url",
];
const CSV_HEADER = [...LEGACY_CSV_HEADER, "tipo_adapter"];
// Colunas de configuração operacional (toggle "ativa" do painel,
// escalonamento, agendamento) — sem elas, todo import recriava a fonte com
// os defaults de sempre (isActive=true, scheduleEnabled=false), obrigando a
// reconfigurar cada fonte na mão de novo depois de subir pra produção.
const FULL_CSV_HEADER = [
  ...CSV_HEADER,
  "ativa",
  "escalonamento_minutos",
  "agendamento_ativo",
  "agendamento_cron",
];

// Tipos de adapter que a coluna tipo_adapter aceita explicitamente. Os
// demais valores do enum JobSourceType (kenoby, successfactors, solides,
// pandape) ainda nao tem adapter implementado — aceitar aqui so criaria
// fonte que nunca roda.
const IMPORTABLE_ADAPTER_TYPES = [
  "gupy",
  "custom_html",
  "custom_api",
  "greenhouse",
  "lever",
  "ashby",
  "inhire",
  "teamtailor",
  "talentbrew",
  "workday",
] as const;
type ImportableAdapterType = (typeof IMPORTABLE_ADAPTER_TYPES)[number];

function isImportableAdapterType(
  value: string,
): value is ImportableAdapterType {
  return (IMPORTABLE_ADAPTER_TYPES as readonly string[]).includes(value);
}

type ImportLineReport = {
  companyAction: "created" | "updated";
  companyName: string;
  inferredAdapter: ImportableAdapterType;
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

function getAdapterDefaults(adapter: ImportableAdapterType) {
  return {
    crawlStrategy: adapter === "custom_html" ? "html" : "api",
    isFallbackAdapter: adapter === "custom_html",
    parserKey: adapter,
  } as const;
}

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
      throw new BadRequestException(
        "csv must include header and at least one row",
      );
    }

    const header = lines[0]
      ?.split(",")
      .map((value) => value.trim().toLowerCase());

    const matchesHeader = (expected: string[]) =>
      header?.length === expected.length &&
      header.every((item, index) => item === expected[index]);

    // Aceita os três formatos de header já exportados historicamente: o
    // legado (5 colunas, sem tipo_adapter), o intermediário (+tipo_adapter)
    // e o atual (+ativa/escalonamento/agendamento) — nos dois primeiros,
    // adapter é inferido pela URL quando ausente, e a configuração
    // operacional cai nos defaults de sempre (isActive=true,
    // scheduleEnabled=false, checkIntervalMinutes=30).
    const hasConfigColumns = matchesHeader(FULL_CSV_HEADER);
    const hasAdapterColumn = hasConfigColumns || matchesHeader(CSV_HEADER);

    if (!hasAdapterColumn && !matchesHeader(LEGACY_CSV_HEADER)) {
      throw new BadRequestException(
        `invalid csv header, expected: ${FULL_CSV_HEADER.join(",")}`,
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
      const [
        nome,
        setor,
        siteUrl,
        careersUrl,
        linkedinUrl,
        tipoAdapter,
        ativa,
        escalonamentoMinutos,
        agendamentoAtivo,
        agendamentoCron,
      ] = rawLine.split(",").map((value) => value.trim());

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

      const explicitAdapter = hasAdapterColumn ? tipoAdapter?.trim() : "";

      if (explicitAdapter && !isImportableAdapterType(explicitAdapter)) {
        report.lines.push({
          companyName: nome,
          line: lineNumber,
          message: `invalid tipo_adapter "${explicitAdapter}", expected one of: ${IMPORTABLE_ADAPTER_TYPES.join(", ")}`,
          status: "error",
        });
        report.summary.errorCount += 1;
        continue;
      }

      const inferredAdapter: ImportableAdapterType = explicitAdapter
        ? (explicitAdapter as ImportableAdapterType)
        : careersUrl.toLowerCase().includes("gupy")
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

        const existingSource =
          !input.dryRun && companyId
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
          const adapterDefaults = getAdapterDefaults(inferredAdapter);
          const parsedInterval = hasConfigColumns
            ? Number.parseInt(escalonamentoMinutos ?? "", 10)
            : Number.NaN;
          const sourcePayload = {
            checkIntervalMinutes: Number.isFinite(parsedInterval)
              ? parsedInterval
              : 30,
            crawlStrategy: adapterDefaults.crawlStrategy,
            isActive: hasConfigColumns ? parseCsvBoolean(ativa, true) : true,
            isFallbackAdapter: adapterDefaults.isFallbackAdapter,
            parserKey: adapterDefaults.parserKey,
            scheduleCron:
              hasConfigColumns && agendamentoCron ? agendamentoCron : null,
            scheduleEnabled: hasConfigColumns
              ? parseCsvBoolean(agendamentoAtivo, false)
              : false,
            sourceName: `${nome} careers`,
            sourceType: inferredAdapter,
            sourceUrl: canonicalSourceUrl,
          };

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
        report.summary[
          companyAction === "created" ? "companiesCreated" : "companiesUpdated"
        ] += 1;
        report.summary[
          sourceAction === "created" ? "sourcesCreated" : "sourcesUpdated"
        ] += 1;
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

  // Mesmo header do importCompanySourcesCsv (FULL_CSV_HEADER) — permite
  // exportar de um ambiente (ex: homolog) e reimportar em outro (ex:
  // producao) via POST /ingestion/import-csv sem transformacao manual,
  // já com a configuração operacional (ativa/escalonamento/agendamento)
  // preservada, sem precisar reconfigurar fonte por fonte depois de subir.
  // Uma linha por JobSource (careers_url = JobSource.sourceUrl), nao por
  // Company, ja que uma empresa pode ter mais de uma fonte cadastrada.
  async exportCompanySourcesCsv(): Promise<string> {
    const sources = await this.database.jobSource.findMany({
      include: { company: true },
      orderBy: [{ company: { name: "asc" } }, { createdAt: "asc" }],
    });

    const lines = sources.map((source) =>
      [
        source.company.name,
        source.company.industry ?? "",
        source.company.websiteUrl ?? "",
        source.sourceUrl,
        source.company.linkedinUrl ?? "",
        source.sourceType,
        String(source.isActive),
        String(source.checkIntervalMinutes),
        String(source.scheduleEnabled),
        source.scheduleCron ?? "",
      ]
        .map(escapeCsvField)
        .join(","),
    );

    return [FULL_CSV_HEADER.join(","), ...lines].join("\n");
  }
}

function escapeCsvField(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function parseCsvBoolean(value: string | undefined, fallback: boolean) {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "true") return true;
  if (normalized === "false") return false;
  return fallback;
}
