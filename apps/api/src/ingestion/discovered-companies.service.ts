import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type {
  DiscoveredCompany,
  DiscoveredCompanyStatus,
} from "@prisma/client";

import { DatabaseService } from "../database/database.service";
import {
  AdminIngestionImportService,
  IMPORTABLE_ADAPTER_TYPES,
  isImportableAdapterType,
} from "./admin-ingestion-import.service";
import {
  buildCandidateUrl,
  GUESSABLE_ADAPTERS,
  generateSlugVariants,
} from "./discovery-slug";
import { IngestionService } from "./ingestion.service";
import { normalizeCompanyName } from "./name-normalization";
import { canonicalizeSourceUrl } from "./url-normalization";

// Espaçamento entre chamadas de probe (com jitter) — mesmo espírito do
// pacing entre itens de um batch normal (ver ingestion-manual-runner.ts),
// pra não martelar os sites externos durante a validação.
const BASE_PROBE_DELAY_MS = 900;
const JITTER_MIN_FACTOR = 0.7;
const JITTER_MAX_FACTOR = 1.3;
// Teto de chamadas por clique em "Validar pendentes" — o modo "só nome"
// faz até GUESSABLE_ADAPTERS.length * variantes chamadas por candidato,
// então isso limita o tempo de resposta do endpoint em vez de limitar por
// quantidade de candidatos (que seria bem mais imprevisível).
const DEFAULT_MAX_PROBES = 40;

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function jitteredDelay(baseMs: number) {
  const factor =
    JITTER_MIN_FACTOR + Math.random() * (JITTER_MAX_FACTOR - JITTER_MIN_FACTOR);
  return Math.round(baseMs * factor);
}

export type ImportCandidatesReport = {
  createdCount: number;
  errorCount: number;
  errors: { line: number; message: string }[];
  skippedCount: number;
  totalLines: number;
};

export type ValidateCandidatesReport = {
  checkedCount: number;
  invalidCount: number;
  noActiveJobsCount: number;
  stillPendingCount: number;
  validatedCount: number;
};

@Injectable()
export class DiscoveredCompaniesService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(IngestionService)
    private readonly ingestionService: IngestionService,
    @Inject(AdminIngestionImportService)
    private readonly importService: AdminIngestionImportService,
  ) {}

  async list(status?: DiscoveredCompanyStatus[]) {
    return this.database.discoveredCompany.findMany({
      orderBy: { createdAt: "desc" },
      take: 500,
      where:
        status && status.length > 0 ? { status: { in: status } } : undefined,
    });
  }

  // Aceita dois formatos de header:
  // - "nome" (1 coluna) — só o nome, valida via chute multi-adapter.
  // - "nome,setor,site_url,careers_url,tipo_adapter[,...]" — URL/adapter já
  //   conhecidos (mesmo shape da planilha), valida com 1 chamada direta.
  async importCandidatesCsv(input: {
    batchLabel?: string;
    csvText: string;
  }): Promise<ImportCandidatesReport> {
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
    const isSimple = header?.length === 1 && header[0] === "nome";
    const isFull =
      !isSimple &&
      (header?.length ?? 0) >= 5 &&
      header?.[0] === "nome" &&
      header?.[1] === "setor" &&
      header?.[2] === "site_url" &&
      header?.[3] === "careers_url" &&
      header?.[4] === "tipo_adapter";

    if (!isSimple && !isFull) {
      throw new BadRequestException(
        'invalid csv header, expected "nome" or "nome,setor,site_url,careers_url,tipo_adapter"',
      );
    }

    const report: ImportCandidatesReport = {
      createdCount: 0,
      errorCount: 0,
      errors: [],
      skippedCount: 0,
      totalLines: lines.length - 1,
    };

    for (const [index, rawLine] of lines.slice(1).entries()) {
      const lineNumber = index + 2;
      const cols = rawLine.split(",").map((value) => value.trim());
      const nome = cols[0];

      if (!nome) {
        report.errors.push({ line: lineNumber, message: "nome is required" });
        report.errorCount += 1;
        continue;
      }

      const normalizedName = normalizeCompanyName(nome);
      if (!normalizedName) {
        report.errors.push({
          line: lineNumber,
          message: "failed to normalize company name",
        });
        report.errorCount += 1;
        continue;
      }

      // Já rastreado nessa tabela, em qualquer status — nunca reprocessa.
      const existingCandidate =
        await this.database.discoveredCompany.findUnique({
          where: { normalizedName },
        });
      if (existingCandidate) {
        report.skippedCount += 1;
        continue;
      }

      // Já é Company de verdade — não é candidato novo.
      const existingCompany = await this.database.company.findUnique({
        where: { normalizedName },
      });
      if (existingCompany) {
        report.skippedCount += 1;
        continue;
      }

      let careersUrl: string | undefined;
      let adapterType: (typeof IMPORTABLE_ADAPTER_TYPES)[number] | undefined;

      if (isFull) {
        const [, setor, , careersUrlRaw, tipoAdapter] = cols;

        if (careersUrlRaw) {
          try {
            careersUrl = canonicalizeSourceUrl(careersUrlRaw);
          } catch {
            report.errors.push({
              line: lineNumber,
              message: "invalid careers_url",
            });
            report.errorCount += 1;
            continue;
          }

          const existingSource = await this.database.jobSource.findFirst({
            where: { sourceUrl: careersUrl },
          });
          if (existingSource) {
            report.skippedCount += 1;
            continue;
          }
        }

        if (tipoAdapter) {
          if (!isImportableAdapterType(tipoAdapter)) {
            report.errors.push({
              line: lineNumber,
              message: `invalid tipo_adapter "${tipoAdapter}", expected one of: ${IMPORTABLE_ADAPTER_TYPES.join(", ")}`,
            });
            report.errorCount += 1;
            continue;
          }
          adapterType = tipoAdapter;
        }

        await this.database.discoveredCompany.create({
          data: {
            adapterType,
            batchLabel: input.batchLabel,
            careersUrl,
            industry: setor || undefined,
            name: nome,
            normalizedName,
          },
        });
      } else {
        await this.database.discoveredCompany.create({
          data: {
            batchLabel: input.batchLabel,
            name: nome,
            normalizedName,
          },
        });
      }

      report.createdCount += 1;
    }

    return report;
  }

  async validatePending(
    maxProbes = DEFAULT_MAX_PROBES,
  ): Promise<ValidateCandidatesReport> {
    const candidates = await this.database.discoveredCompany.findMany({
      orderBy: { createdAt: "asc" },
      // Teto generoso — o corte real é por maxProbes, não por quantidade de
      // candidatos (ver comentário na constante).
      take: 200,
      where: { status: "PENDING" },
    });

    const summary: ValidateCandidatesReport = {
      checkedCount: 0,
      invalidCount: 0,
      noActiveJobsCount: 0,
      stillPendingCount: 0,
      validatedCount: 0,
    };

    let probesUsed = 0;

    for (const candidate of candidates) {
      if (probesUsed >= maxProbes) break;

      const { outcome, probesUsed: candidateProbes } =
        await this.validateCandidate(candidate, maxProbes - probesUsed);
      probesUsed += candidateProbes;
      summary.checkedCount += 1;

      if (outcome.status === "PENDING") {
        summary.stillPendingCount += 1;
        continue;
      }

      await this.database.discoveredCompany.update({
        data: outcome,
        where: { id: candidate.id },
      });

      if (outcome.status === "VALIDATED") summary.validatedCount += 1;
      else if (outcome.status === "NO_ACTIVE_JOBS")
        summary.noActiveJobsCount += 1;
      else if (outcome.status === "INVALID") summary.invalidCount += 1;
    }

    return summary;
  }

  private async validateCandidate(
    candidate: DiscoveredCompany,
    probeBudget: number,
  ): Promise<{
    outcome: {
      adapterType?: (typeof IMPORTABLE_ADAPTER_TYPES)[number];
      careersUrl?: string;
      checkedAt?: Date;
      errorMessage?: string | null;
      jobCount?: number;
      status: DiscoveredCompanyStatus;
    };
    probesUsed: number;
  }> {
    if (probeBudget <= 0) {
      return { outcome: { status: "PENDING" }, probesUsed: 0 };
    }

    if (candidate.careersUrl && candidate.adapterType) {
      const probe = await this.ingestionService.probeSource(
        candidate.adapterType,
        candidate.careersUrl,
      );
      await this.pace();

      if (probe.inconclusive) {
        return { outcome: { status: "PENDING" }, probesUsed: 1 };
      }
      if (!probe.ok) {
        return {
          outcome: {
            checkedAt: new Date(),
            errorMessage: probe.error ?? "probe failed",
            status: "INVALID",
          },
          probesUsed: 1,
        };
      }
      return {
        outcome: {
          checkedAt: new Date(),
          errorMessage: null,
          jobCount: probe.jobCount,
          status: probe.jobCount > 0 ? "VALIDATED" : "NO_ACTIVE_JOBS",
        },
        probesUsed: 1,
      };
    }

    // Modo "só nome": chuta slugs e testa contra os adapters adivináveis.
    const variants = generateSlugVariants(candidate.name);
    const attempted: string[] = [];
    let probesUsed = 0;

    for (const adapter of GUESSABLE_ADAPTERS) {
      for (const slug of variants) {
        if (probesUsed >= probeBudget) {
          return {
            outcome: { status: "PENDING" },
            probesUsed,
          };
        }

        const url = buildCandidateUrl(adapter, slug);
        const probe = await this.ingestionService.probeSource(adapter, url);
        await this.pace();
        probesUsed += 1;
        attempted.push(`${adapter}:${slug}`);

        if (probe.ok && probe.jobCount > 0) {
          return {
            outcome: {
              adapterType: adapter,
              careersUrl: url,
              checkedAt: new Date(),
              errorMessage: null,
              jobCount: probe.jobCount,
              status: "VALIDATED",
            },
            probesUsed,
          };
        }
      }
    }

    return {
      outcome: {
        checkedAt: new Date(),
        errorMessage: `no match found, tried: ${attempted.join(", ")}`,
        status: "INVALID",
      },
      probesUsed,
    };
  }

  private async pace() {
    // Sem pacing nos testes — sao dezenas de probes mockadas por teste
    // (combinacoes de adapter x slug), esperar de verdade so deixaria a
    // suite lenta sem testar nada a mais.
    if (process.env.NODE_ENV === "test") return;
    await sleep(jitteredDelay(BASE_PROBE_DELAY_MS));
  }

  async promote(id: string) {
    const candidate = await this.getOrThrow(id);
    const { careersUrl, adapterType } = candidate;

    if (candidate.status !== "VALIDATED") {
      throw new BadRequestException("candidate must be VALIDATED to promote");
    }
    if (!careersUrl || !adapterType) {
      throw new BadRequestException(
        "candidate is missing careersUrl/adapterType",
      );
    }

    const outcome = await this.importService.importRow({
      ativa: "true",
      careersUrl,
      dryRun: false,
      hasConfigColumns: true,
      nome: candidate.name,
      setor: candidate.industry ?? undefined,
      siteUrl: candidate.websiteUrl ?? undefined,
      tipoAdapter: adapterType,
    });

    if (outcome.status === "error") {
      throw new ConflictException(outcome.message);
    }

    return this.database.discoveredCompany.update({
      data: { linkedCompanyId: outcome.companyId, status: "IMPORTED" },
      where: { id },
    });
  }

  async dismiss(id: string) {
    const candidate = await this.getOrThrow(id);

    if (candidate.status === "IMPORTED") {
      throw new BadRequestException(
        "cannot dismiss a candidate that was already promoted",
      );
    }

    return this.database.discoveredCompany.update({
      data: { status: "DISMISSED" },
      where: { id },
    });
  }

  private async getOrThrow(id: string) {
    const candidate = await this.database.discoveredCompany.findUnique({
      where: { id },
    });
    if (!candidate) {
      throw new NotFoundException("discovered company not found");
    }
    return candidate;
  }
}
