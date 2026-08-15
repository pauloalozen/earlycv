import { Inject, Injectable, Logger } from "@nestjs/common";
import type { JobSourceType } from "@prisma/client";
import { imageSize } from "image-size";

import { DatabaseService } from "../../database/database.service";
import {
  LOGO_EXTRACTORS,
  LOGO_FETCH_SUPPORTED_ADAPTERS,
} from "./logo-extractors";

// Mesmo limiar usado pelo fallback do frontend (CompanyLogo,
// MIN_GOOD_LOGO_SIZE em apps/web/src/app/radar/company-logo.tsx) — um logo
// capturado da fonte original tambem precisa passar por essa checagem
// antes de virar Company.logoUrl, senao favicon/placeholder minusculo
// vazado por engano no HTML da fonte vira "logo oficial" pro app inteiro.
const MIN_GOOD_LOGO_SIZE = 64;
const FETCH_TIMEOUT_MS = 10_000;

// CloudFront na frente de files.inhire.app bloqueia com 403 qualquer
// download sem User-Agent de navegador de verdade — confirmado manualmente
// (nem User-Agent nenhum passa). Não é anti-scraping direcionado: bloqueia
// curl puro também. Restrito a esse host só pra baixar o arquivo de imagem
// em si — a página de carreira (fetch feito pelo extractor) continua sendo
// buscada com o UA honesto de sempre (EarlyCV-Crawler/1.0). Decisão
// confirmada com o Paulo em 2026-08-15.
const IMAGE_HOSTS_REQUIRING_BROWSER_UA = new Set(["files.inhire.app"]);
const BROWSER_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

export type LogoFetchResult =
  | { status: "completed"; logoUrl: string }
  | { status: "skipped"; reason: string }
  | { status: "failed"; errorSummary: string };

@Injectable()
export class CompanyLogoFetchService {
  private readonly logger = new Logger(CompanyLogoFetchService.name);

  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
  ) {}

  // sourceType opcional: quando ausente (disparo "todos" em lote), usa
  // qualquer fonte ativa da empresa cujo adapter tenha extractor
  // implementado. Compartilhado entre o botao "por empresa" (chamada
  // direta) e o drain de batches LOGO_FETCH (IngestionManualRunnerService).
  async fetchLogoForCompany(
    companyId: string,
    sourceType?: JobSourceType,
  ): Promise<LogoFetchResult> {
    const jobSource = await this.database.jobSource.findFirst({
      where: {
        companyId,
        isActive: true,
        sourceType: sourceType
          ? sourceType
          : { in: LOGO_FETCH_SUPPORTED_ADAPTERS },
      },
      orderBy: { updatedAt: "desc" },
    });

    if (!jobSource) {
      await this.recordAttempt(companyId);
      return {
        status: "skipped",
        reason:
          "empresa não tem fonte ativa com adapter suportado para busca de logo",
      };
    }

    const extractor = LOGO_EXTRACTORS[jobSource.sourceType];
    if (!extractor) {
      await this.recordAttempt(companyId);
      return {
        status: "skipped",
        reason: `adapter ${jobSource.sourceType} ainda não suporta busca de logo`,
      };
    }

    try {
      const candidateUrl = await extractor(jobSource.sourceUrl);
      if (!candidateUrl) {
        await this.recordAttempt(companyId);
        return {
          status: "failed",
          errorSummary: "logo não encontrado na página de carreira",
        };
      }

      const quality = await this.checkImageQuality(candidateUrl);
      if (!quality.ok) {
        await this.recordAttempt(companyId);
        return { status: "failed", errorSummary: quality.reason };
      }

      await this.recordFound(companyId, candidateUrl);
      return { status: "completed", logoUrl: candidateUrl };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "logo fetch failed";
      await this.recordAttempt(companyId);
      this.logger.warn(
        `logo fetch failed for company ${companyId}: ${message}`,
      );
      return { status: "failed", errorSummary: message };
    }
  }

  private async checkImageQuality(
    url: string,
  ): Promise<{ ok: true } | { ok: false; reason: string }> {
    const hostname = new URL(url).hostname;
    const needsBrowserUa = IMAGE_HOSTS_REQUIRING_BROWSER_UA.has(hostname);

    const response = await fetch(url, {
      headers: needsBrowserUa ? { "User-Agent": BROWSER_USER_AGENT } : {},
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) {
      return { ok: false, reason: `logo url respondeu ${response.status}` };
    }

    const buffer = new Uint8Array(await response.arrayBuffer());

    try {
      const dimensions = imageSize(buffer);
      if (!dimensions.width || !dimensions.height) {
        return {
          ok: false,
          reason: "não foi possível medir as dimensões do logo",
        };
      }
      if (
        dimensions.width < MIN_GOOD_LOGO_SIZE ||
        dimensions.height < MIN_GOOD_LOGO_SIZE
      ) {
        return {
          ok: false,
          reason: `logo pequeno demais (${dimensions.width}x${dimensions.height})`,
        };
      }
      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        reason:
          error instanceof Error
            ? error.message
            : "falha ao ler dimensões do logo",
      };
    }
  }

  // Grava a tentativa sem tocar em logoUrl — uma falha temporaria (site
  // fora do ar, layout mudou) nao deve apagar um logo bom capturado numa
  // tentativa anterior.
  private async recordAttempt(companyId: string) {
    await this.database.company.update({
      where: { id: companyId },
      data: { logoFetchedAt: new Date() },
    });
  }

  private async recordFound(companyId: string, logoUrl: string) {
    await this.database.company.update({
      where: { id: companyId },
      data: { logoUrl, logoFetchedAt: new Date() },
    });
  }
}
