import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import type {
  DiscoveredCompany,
  DiscoveredCompanyStatus,
  JobSourceType,
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
import { decodeHtmlEntities, normalizeCompanyName } from "./name-normalization";
import { canonicalizeSourceUrl } from "./url-normalization";
import { matchAdapterUrl } from "./web-search/adapter-url-matcher";
import { WebSearchService } from "./web-search/web-search.service";

// Espaçamento entre chamadas de probe (com jitter) — mesmo espírito do
// pacing entre itens de um batch normal (ver ingestion-manual-runner.ts),
// pra não martelar os sites externos durante a validação.
const BASE_PROBE_DELAY_MS = 900;
const JITTER_MIN_FACTOR = 0.7;
const JITTER_MAX_FACTOR = 1.3;
// Teto de segurança pra "rodar fila inteira" (sem limite escolhido no
// popup) — evita puxar um número patológico de candidatos numa chamada só.
// Não é o mecanismo de corte principal: esse agora é o número de candidatos
// escolhido no popup "Validar pendentes".
const QUEUE_HARD_CAP = 200;

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
  noTechJobsCount: number;
  stillPendingCount: number;
  validatedCount: number;
};

// board vazio (rawJobCount 0) -> NO_ACTIVE_JOBS; board com vagas mas
// nenhuma de tech (rawJobCount > 0, jobCount 0) -> NO_TECH_JOBS.
function probeStatus(
  jobCount: number,
  rawJobCount: number,
): DiscoveredCompanyStatus {
  if (jobCount > 0) return "VALIDATED";
  return rawJobCount > 0 ? "NO_TECH_JOBS" : "NO_ACTIVE_JOBS";
}

// VALIDATED, NO_TECH_JOBS e NO_ACTIVE_JOBS todos provam que o adapter/URL
// esta certo (board existe e respondeu) — so varia se tinha vaga (de tech
// ou nao) no momento do probe. INVALID fica de fora porque ali a URL nao
// resolveu ou nenhum slug bateu (promoteManual ainda permite forçar nesses
// casos com um link achado manualmente).
const PROMOTABLE_STATUSES: DiscoveredCompanyStatus[] = [
  "VALIDATED",
  "NO_TECH_JOBS",
  "NO_ACTIVE_JOBS",
];

// Orçamento de probes por candidato (validação pontual OU dentro de um
// lote de "Validar pendentes") — cobre o pior caso do chute de slug (6
// adapters x variantes do nome). É por candidato, não compartilhado entre
// candidatos do mesmo lote — ver validatePending.
const PER_CANDIDATE_PROBE_BUDGET = 60;

@Injectable()
export class DiscoveredCompaniesService {
  private readonly logger = new Logger(DiscoveredCompaniesService.name);

  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(IngestionService)
    private readonly ingestionService: IngestionService,
    @Inject(AdminIngestionImportService)
    private readonly importService: AdminIngestionImportService,
    @Inject(WebSearchService)
    private readonly webSearchService: WebSearchService,
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
      const nome = cols[0] ? decodeHtmlEntities(cols[0]) : cols[0];

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

  // candidateLimit = quantos candidatos processar nessa chamada (o popup
  // "Validar pendentes" pergunta isso: um número de rodadas ou "fila
  // inteira"). Cada candidato processado aqui recebe seu próprio orçamento
  // de busca web (1 consulta, se habilitada) — não existe mais um teto
  // compartilhado de consultas por execução: o número de candidatos JÁ é
  // esse teto, escolhido no momento do clique.
  async validatePending(
    candidateLimit?: number,
  ): Promise<ValidateCandidatesReport> {
    const candidates = await this.database.discoveredCompany.findMany({
      orderBy: { createdAt: "asc" },
      take: candidateLimit ?? QUEUE_HARD_CAP,
      where: { status: "PENDING" },
    });

    const summary: ValidateCandidatesReport = {
      checkedCount: 0,
      invalidCount: 0,
      noActiveJobsCount: 0,
      noTechJobsCount: 0,
      stillPendingCount: 0,
      validatedCount: 0,
    };

    for (const candidate of candidates) {
      // Orçamento novo por candidato — nunca deixa um candidato sem chance
      // de busca só porque candidatos anteriores no mesmo clique já
      // gastaram o orçamento (era o problema do teto compartilhado antigo).
      const searchBudget = {
        remaining: this.webSearchService.isEnabled() ? 1 : 0,
      };
      const { outcome } = await this.validateCandidate(
        candidate,
        PER_CANDIDATE_PROBE_BUDGET,
        searchBudget,
      );
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
      else if (outcome.status === "NO_TECH_JOBS")
        summary.noTechJobsCount += 1;
      else if (outcome.status === "INVALID") summary.invalidCount += 1;
    }

    return summary;
  }

  private async validateCandidate(
    candidate: DiscoveredCompany,
    probeBudget: number,
    searchBudget: { remaining: number },
  ): Promise<{
    outcome: {
      adapterType?: (typeof IMPORTABLE_ADAPTER_TYPES)[number];
      careersUrl?: string;
      checkedAt?: Date;
      errorMessage?: string | null;
      jobCount?: number;
      rawJobCount?: number;
      resolutionMethod?: string;
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
      if (probe.ok) {
        return {
          outcome: {
            checkedAt: new Date(),
            errorMessage: null,
            jobCount: probe.jobCount,
            rawJobCount: probe.rawJobCount,
            resolutionMethod: "known",
            status: probeStatus(probe.jobCount, probe.rawJobCount),
          },
          probesUsed: 1,
        };
      }

      // A URL conhecida quebrou de verdade (nao inconclusivo) — em vez de
      // marcar INVALID direto, assume que ela pode ter sido um chute
      // errado guardado antes da busca web existir (ex: slug pre-populado
      // na importação em lote) e tenta re-resolver do zero pelo nome, como
      // se fosse um candidato "só nome". Isso faz "Validar" auto-curar
      // candidatos com careersUrl ruim salva.
      const fallback = await this.resolveFromScratch(
        candidate.name,
        probeBudget - 1,
        searchBudget,
      );
      return {
        outcome: fallback.outcome,
        probesUsed: fallback.probesUsed + 1,
      };
    }

    return this.resolveFromScratch(candidate.name, probeBudget, searchBudget);
  }

  // Modo "só nome": tenta achar a URL certa buscando "{nome} vagas" e
  // casando o primeiro resultado que aponte pra um board conhecido, antes
  // de cair no chute de slug x adapter (lento, N tentativas x 6 adapters).
  private async resolveFromScratch(
    name: string,
    probeBudget: number,
    searchBudget: { remaining: number },
  ): Promise<{
    outcome: {
      adapterType?: (typeof IMPORTABLE_ADAPTER_TYPES)[number];
      careersUrl?: string;
      checkedAt?: Date;
      errorMessage?: string | null;
      jobCount?: number;
      rawJobCount?: number;
      resolutionMethod?: string;
      status: DiscoveredCompanyStatus;
    };
    probesUsed: number;
  }> {
    if (probeBudget <= 0) {
      return { outcome: { status: "PENDING" }, probesUsed: 0 };
    }

    // 1 unica consulta, custa do orçamento de busca (searchBudget),
    // separado do probeBudget.
    if (searchBudget.remaining > 0 && this.webSearchService.isEnabled()) {
      searchBudget.remaining -= 1;
      const resolved = await this.resolveViaWebSearch(name);

      if (resolved) {
        const probe = await this.ingestionService.probeSource(
          resolved.sourceType,
          resolved.careersUrl,
        );
        await this.pace();

        if (probe.ok) {
          return {
            outcome: {
              adapterType: resolved.sourceType,
              careersUrl: resolved.careersUrl,
              checkedAt: new Date(),
              errorMessage: null,
              jobCount: probe.jobCount,
              rawJobCount: probe.rawJobCount,
              resolutionMethod: "web_search",
              status: probeStatus(probe.jobCount, probe.rawJobCount),
            },
            probesUsed: 1,
          };
        }
        // Probe na URL achada pela busca falhou/inconclusivo — não assume
        // que a busca errou, só cai pro chute de slug como rede de
        // segurança em vez de já marcar INVALID.
      }
    }

    // Fallback: chuta slugs e testa contra os adapters adivináveis.
    const variants = generateSlugVariants(name);
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

        // rawJobCount > 0 com jobCount 0 ja prova que o slug/adapter esta
        // certo (board existe e tem vagas) — so nao tem vaga de tech, entao
        // para de chutar em vez de continuar tentando outros adapters.
        if (probe.ok && probe.rawJobCount > 0) {
          return {
            outcome: {
              adapterType: adapter,
              careersUrl: url,
              checkedAt: new Date(),
              errorMessage: null,
              jobCount: probe.jobCount,
              rawJobCount: probe.rawJobCount,
              resolutionMethod: "slug_guess",
              status: probeStatus(probe.jobCount, probe.rawJobCount),
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

  // Busca "{nome} vagas" e retorna o primeiro resultado cuja URL bate um
  // domínio de adapter conhecido (gupy.io, boards.greenhouse.io, etc.) — é
  // o equivalente automatizado de jogar "empresa vagas" no Google e pegar
  // o link certo nos primeiros resultados.
  private async resolveViaWebSearch(name: string) {
    try {
      const results = await this.webSearchService.search(`${name} vagas`);
      for (const result of results) {
        const matched = matchAdapterUrl(result.url);
        if (matched) return matched;
      }
    } catch (error) {
      this.logger.warn(
        `web search failed for "${name}": ${error instanceof Error ? error.message : "unknown"}`,
      );
    }
    return null;
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

    if (!PROMOTABLE_STATUSES.includes(candidate.status)) {
      throw new BadRequestException(
        `candidate must be one of ${PROMOTABLE_STATUSES.join(", ")} to promote`,
      );
    }
    if (!careersUrl || !adapterType) {
      throw new BadRequestException(
        "candidate is missing careersUrl/adapterType",
      );
    }

    return this.importCandidateAsSource(candidate, careersUrl, adapterType);
  }

  // Promove todos os candidatos promotáveis de uma vez (botão "Criar todas
  // as fontes" na Fila) — segue promovendo mesmo se algum falhar no meio,
  // pra um erro isolado (ex: URL derrubada nesse meio tempo) não travar o
  // resto do lote.
  async promoteAll() {
    const candidates = await this.database.discoveredCompany.findMany({
      orderBy: { createdAt: "asc" },
      where: { status: { in: PROMOTABLE_STATUSES } },
    });

    const report = {
      errors: [] as { id: string; message: string; name: string }[],
      failedCount: 0,
      promotedCount: 0,
      totalCount: candidates.length,
    };

    for (const candidate of candidates) {
      try {
        await this.promote(candidate.id);
        report.promotedCount += 1;
      } catch (error) {
        report.failedCount += 1;
        report.errors.push({
          id: candidate.id,
          message: error instanceof Error ? error.message : "promote failed",
          name: candidate.name,
        });
      }
    }

    return report;
  }

  // Cria a fonte com uma URL/adapter informados manualmente — pra quando o
  // candidato foi descartado (DISMISSED) ou ficou INVALID (nada bateu, nem
  // busca nem chute de slug) mas você achou o board de vagas na mão.
  // Funciona pra qualquer status exceto IMPORTED.
  async promoteManual(
    id: string,
    input: { adapterType: string; careersUrl: string },
  ) {
    const candidate = await this.getOrThrow(id);

    if (candidate.status === "IMPORTED") {
      throw new BadRequestException(
        "candidate was already promoted to a source",
      );
    }
    if (!isImportableAdapterType(input.adapterType)) {
      throw new BadRequestException(
        `invalid adapterType, expected one of: ${IMPORTABLE_ADAPTER_TYPES.join(", ")}`,
      );
    }

    let careersUrl: string;
    try {
      careersUrl = canonicalizeSourceUrl(input.careersUrl);
    } catch {
      throw new BadRequestException("invalid careersUrl");
    }

    return this.importCandidateAsSource(
      candidate,
      careersUrl,
      input.adapterType,
      "manual",
    );
  }

  private async importCandidateAsSource(
    candidate: DiscoveredCompany,
    careersUrl: string,
    adapterType: JobSourceType,
    resolutionMethod?: string,
  ) {
    // Dedup de verdade contra fonte já cadastrada: o dedup do importRow é
    // escopado por (companyId, sourceUrl), então dois candidatos com nomes
    // diferentes (ex: "Usiminas" e "Usiminas Tech") que resolvem pra mesma
    // URL passariam batido e criariam Company+JobSource duplicados. Aqui a
    // busca é global (qualquer company) — se já existe, só linka o
    // candidato na company existente em vez de duplicar.
    const existingSource = await this.database.jobSource.findFirst({
      include: { company: true },
      where: { sourceUrl: careersUrl },
    });
    if (existingSource) {
      return this.database.discoveredCompany.update({
        data: {
          adapterType,
          careersUrl,
          errorMessage: `already registered as a source under "${existingSource.company.name}"`,
          linkedCompanyId: existingSource.companyId,
          status: "IMPORTED",
          ...(resolutionMethod ? { resolutionMethod } : {}),
        },
        where: { id: candidate.id },
      });
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
      data: {
        adapterType,
        careersUrl,
        linkedCompanyId: outcome.companyId,
        status: "IMPORTED",
        ...(resolutionMethod ? { resolutionMethod } : {}),
      },
      where: { id: candidate.id },
    });
  }

  // Validação pontual de 1 candidato (botão na linha da Fila) — roda o
  // mesmo validateCandidate() do "Validar pendentes" em lote, mas pra
  // qualquer status (não só PENDING) e com orçamento generoso, pra dar pra
  // reprocessar um item específico depois de um ajuste manual ou só pra
  // testar de novo.
  async validateOne(id: string) {
    const candidate = await this.getOrThrow(id);

    if (candidate.status === "IMPORTED") {
      throw new BadRequestException(
        "cannot re-validate a candidate that was already promoted",
      );
    }

    const searchBudget = {
      remaining: this.webSearchService.isEnabled() ? 1 : 0,
    };
    const { outcome } = await this.validateCandidate(
      candidate,
      PER_CANDIDATE_PROBE_BUDGET,
      searchBudget,
    );

    if (outcome.status === "PENDING") {
      throw new ConflictException(
        "probe was inconclusive (rate limit/timeout) — try again",
      );
    }

    return this.database.discoveredCompany.update({
      data: outcome,
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
