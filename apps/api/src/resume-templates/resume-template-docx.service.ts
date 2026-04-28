import { execFile } from "node:child_process";
import { unlinkSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  OnModuleInit,
} from "@nestjs/common";
import Docxtemplater from "docxtemplater";
import PizZip from "pizzip";

import { StorageService } from "../storage/storage.service";

const execFileAsync = promisify(execFile);

type ExecFileFailure = NodeJS.ErrnoException & {
  stderr?: string;
  stdout?: string;
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DocxTemplateData {
  candidateName: string;
  phone: string;
  email: string;
  location: string;
  mainGoal: string;
  hasMainGoal: boolean;
  summary: string;
  items: Array<{
    heading: string;
    subheading: string;
    dateRange: string;
    bullets: Array<{ text: string }>;
  }>;
  competencias: Array<{ groupComp: string; comps: string }>;
  educacao: Array<{
    courseName: string;
    instituitionName: string;
    cityInstituition: string;
    conclusionCourse: string;
  }>;
  hasCertificacoes: boolean;
  hasIdiomas: boolean;
  certificacoes: Array<{
    courseName: string;
    instituitionName: string;
    cityInstituition: string;
    conclusionCourse: string;
  }>;
  idiomas: Array<{ language: string; languageLevel: string }>;
}

// ---------------------------------------------------------------------------
// Mock data for preview generation
// ---------------------------------------------------------------------------

const MOCK_DATA: DocxTemplateData = {
  candidateName: "Ana Carolina Ferreira",
  phone: "+55 11 98765-4321",
  email: "ana.ferreira@email.com",
  location: "São Paulo, SP",
  mainGoal:
    "Contribuir com minha experiência em análise de dados e inteligência de negócios para impulsionar decisões estratégicas e criar valor mensurável para o negócio.",
  hasMainGoal: true,
  summary:
    "Profissional de Dados e Analytics com 8 anos de experiência em Business Intelligence, modelagem de dados e desenvolvimento de dashboards executivos. Histórico comprovado na implementação de soluções analíticas que aumentaram a eficiência operacional em 35%. Expertise em Power BI, SQL e Python aplicados ao contexto de negócios.",
  items: [
    {
      heading: "Gerente de Business Intelligence",
      subheading: "Empresa Exemplo S.A.",
      dateRange: "Jan 2021 – Presente",
      bullets: [
        {
          text: "Liderou equipe de 6 analistas na construção de data warehouse corporativo com mais de 50 dashboards estratégicos.",
        },
        {
          text: "Reduziu em 40% o tempo de geração de relatórios gerenciais através da automação de pipelines ETL.",
        },
        {
          text: "Implementou governança de dados alinhada à LGPD, garantindo conformidade em todos os processos analíticos.",
        },
      ],
    },
    {
      heading: "Analista de Dados Sênior",
      subheading: "Tech Solutions Ltda.",
      dateRange: "Mar 2018 – Dez 2020",
      bullets: [
        {
          text: "Desenvolveu modelos preditivos com Python e scikit-learn para churn de clientes, reduzindo evasão em 22%.",
        },
        {
          text: "Criou painéis de performance comercial integrados com CRM Salesforce, utilizados por 200+ vendedores.",
        },
      ],
    },
  ],
  competencias: [
    {
      groupComp: "Business Intelligence",
      comps: "Power BI, Tableau, Qlik Sense, Looker",
    },
    {
      groupComp: "Engenharia de Dados",
      comps: "SQL, Python, PySpark, dbt, Airflow",
    },
    {
      groupComp: "Cloud & Plataformas",
      comps: "AWS, Google BigQuery, Databricks, Azure",
    },
  ],
  educacao: [
    {
      courseName: "MBA em Business Intelligence e Analytics",
      instituitionName: "FGV",
      cityInstituition: "São Paulo",
      conclusionCourse: "2019",
    },
    {
      courseName: "Bacharelado em Sistemas de Informação",
      instituitionName: "USP",
      cityInstituition: "São Paulo",
      conclusionCourse: "2016",
    },
  ],
  hasCertificacoes: true,
  hasIdiomas: true,
  certificacoes: [
    {
      courseName: "Microsoft Power BI Data Analyst (PL-300)",
      instituitionName: "Microsoft",
      cityInstituition: "",
      conclusionCourse: "2023",
    },
    {
      courseName: "Google Professional Data Engineer",
      instituitionName: "Google Cloud",
      cityInstituition: "",
      conclusionCourse: "2022",
    },
  ],
  idiomas: [
    { language: "Inglês", languageLevel: "Avançado" },
    { language: "Espanhol", languageLevel: "Intermediário" },
  ],
};

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable()
export class ResumeTemplateDocxService implements OnModuleInit {
  private readonly logger = new Logger(ResumeTemplateDocxService.name);

  constructor(
    @Inject(StorageService) private readonly storage: StorageService,
  ) {}

  async onModuleInit(): Promise<void> {
    if (process.env.NODE_ENV !== "production") {
      return;
    }

    await this.assertPdfConverterAvailable();
  }

  /**
   * Generate a preview PNG from the DOCX template filled with mock data.
   * Flow: DOCX + mock data → docxtemplater → filled DOCX → LibreOffice → PDF → pdftoppm → PNG
   */
  async generatePreview(
    docxBuffer: Buffer,
    templateId: string,
  ): Promise<string> {
    const filled = this.fillTemplate(docxBuffer, MOCK_DATA);
    const png = await this.docxToPng(filled);

    const previewKey = `templates/${templateId}/preview-${Date.now()}.png`;
    return this.storage.putObject(previewKey, png, "image/png");
  }

  /**
   * Fill the DOCX template from MinIO with real CV data and return the buffer.
   */
  async fillFromStorage(
    templateFileUrl: string,
    data: DocxTemplateData,
  ): Promise<Buffer> {
    const key = this.extractKeyFromUrl(templateFileUrl);
    const docxBuffer = await this.storage.getObject(key);
    return this.fillTemplate(docxBuffer, data);
  }

  fillTemplate(docxBuffer: Buffer, data: DocxTemplateData): Buffer {
    try {
      const zip = new PizZip(docxBuffer);
      const doc = new Docxtemplater(zip, {
        paragraphLoop: true,
        linebreaks: true,
      });

      doc.render(data);

      return doc.getZip().generate({ type: "nodebuffer" }) as Buffer;
    } catch (error) {
      const message = this.extractDocxTemplateErrorMessage(error);
      this.logger.warn(`[docx-template] invalid template: ${message}`);
      throw new BadRequestException(
        `Template DOCX invalido: ${message}. Revise as tags condicionais no arquivo e tente novamente.`,
      );
    }
  }

  private extractDocxTemplateErrorMessage(error: unknown): string {
    if (!(error instanceof Error)) {
      return "erro desconhecido";
    }

    const errorWithProperties = error as Error & {
      properties?: {
        errors?: Array<{
          properties?: {
            explanation?: string;
          };
        }>;
      };
    };

    const explanation =
      errorWithProperties.properties?.errors?.[0]?.properties?.explanation;

    if (typeof explanation === "string" && explanation.trim().length > 0) {
      return explanation.trim();
    }

    return error.message;
  }

  /** Convert a DOCX buffer to PDF via LibreOffice. */
  async docxToPdf(docxBuffer: Buffer): Promise<Buffer> {
    const id = `earlycv-pdf-${Date.now()}`;
    const docxPath = join(tmpdir(), `${id}.docx`);
    const pdfPath = join(tmpdir(), `${id}.pdf`);

    writeFileSync(docxPath, docxBuffer);

    try {
      await this.execLibreOfficeConvert(docxPath);

      return await readFile(pdfPath);
    } finally {
      for (const p of [docxPath, pdfPath]) {
        try {
          unlinkSync(p);
        } catch {
          // ignore cleanup errors
        }
      }
    }
  }

  private async docxToPng(docxBuffer: Buffer): Promise<Buffer> {
    const id = `earlycv-preview-${Date.now()}`;
    const docxPath = join(tmpdir(), `${id}.docx`);
    const pdfPath = join(tmpdir(), `${id}.pdf`);
    const pngPrefix = join(tmpdir(), id);
    const pngPath = `${pngPrefix}.png`;

    writeFileSync(docxPath, docxBuffer);

    try {
      await this.execLibreOfficeConvert(docxPath);

      await execFileAsync("pdftoppm", [
        "-r",
        "150",
        "-png",
        "-singlefile",
        pdfPath,
        pngPrefix,
      ]);

      return await readFile(pngPath);
    } finally {
      for (const p of [docxPath, pdfPath, pngPath]) {
        try {
          unlinkSync(p);
        } catch {
          // ignore cleanup errors
        }
      }
    }
  }

  private extractKeyFromUrl(url: string): string {
    const bucket = process.env.S3_BUCKET ?? "earlycv-local";
    const marker = `/${bucket}/`;
    const idx = url.indexOf(marker);
    if (idx < 0) throw new Error(`Cannot extract MinIO key from URL: ${url}`);
    return url.slice(idx + marker.length);
  }

  protected async runExecFile(
    binary: string,
    args: string[],
  ): Promise<void> {
    await execFileAsync(binary, args);
  }

  private getLibreOfficeCandidates(): string[] {
    const binaries = [
      process.env.LIBREOFFICE_BINARY?.trim(),
      "soffice",
      "libreoffice",
      "/usr/bin/soffice",
      "/usr/local/bin/soffice",
      "/usr/lib/libreoffice/program/soffice",
      "/snap/bin/libreoffice",
    ].filter((value): value is string => Boolean(value && value.length > 0));

    return [...new Set(binaries)];
  }

  private async assertPdfConverterAvailable(): Promise<void> {
    const attempts: string[] = [];

    for (const binary of this.getLibreOfficeCandidates()) {
      try {
        await this.runExecFile(binary, ["--version"]);
        this.logger.log(`[docx-convert] runtime binary detected: ${binary}`);
        return;
      } catch (error) {
        const err = error as ExecFileFailure;
        attempts.push(`${binary}: ${err.code ?? "UNKNOWN"} ${err.message}`);

        if (err.code !== "ENOENT") {
          break;
        }
      }
    }

    const pathValue = process.env.PATH ?? "<empty>";
    const details = attempts.length > 0 ? attempts.join(" | ") : "no-attempts";
    this.logger.error(
      `[docx-convert] runtime check failed; path=${pathValue}; attempts=${details}`,
    );

    throw new Error(
      "PDF converter unavailable in runtime. Configure LibreOffice in deploy image and set LIBREOFFICE_BINARY when needed.",
    );
  }

  private async execLibreOfficeConvert(docxPath: string): Promise<void> {
    const uniqueBinaries = this.getLibreOfficeCandidates();

    const args = [
      "--headless",
      "--convert-to",
      "pdf",
      "--outdir",
      tmpdir(),
      docxPath,
    ];

    const attempts: string[] = [];
    let lastError: unknown = null;

    for (const binary of uniqueBinaries) {
      try {
        await this.runExecFile(binary, args);
        return;
      } catch (error) {
        const err = error as ExecFileFailure;
        attempts.push(
          `${binary}: ${err.code ?? "UNKNOWN"} ${err.message}`,
        );
        lastError = error;

        if (err.code !== "ENOENT") {
          break;
        }
      }
    }

    const pathValue = process.env.PATH ?? "<empty>";
    const details = attempts.length > 0 ? attempts.join(" | ") : "no-attempts";

    this.logger.error(
      `[docx-convert] failed for ${docxPath}: ${lastError instanceof Error ? lastError.message : String(lastError)}; path=${pathValue}; attempts=${details}`,
    );
    throw new Error(
      "Falha ao converter CV para PDF no servidor. Tente novamente em instantes.",
    );
  }
}
