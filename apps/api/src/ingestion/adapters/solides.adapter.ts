import { Inject, Injectable, Logger } from "@nestjs/common";
import { DatabaseService } from "../../database/database.service";
import { normalizeCity, normalizeState } from "../../jobs/geo-normalizer";
import { IngestionFetchError } from "../errors";
import { SemanticFilterService } from "../semantic-filter.service";
import type {
  IngestionCollectContext,
  IngestionSourceAdapter,
  JobSourceContext,
  NormalizedJobObservation,
} from "../types";
import { normalizeDescriptionHtml, stripHtml } from "./strip-html";
import { normalizeAdapterTitle } from "./title-normalization";

type SolidesNamed = { name?: string | null } | null;

type SolidesVacancy = {
  address?: {
    city?: SolidesNamed;
    country?: SolidesNamed;
    foreign_city?: string | null;
    foreign_state?: string | null;
    state?: { code?: string | null; name?: string | null } | null;
  } | null;
  city?: SolidesNamed;
  createdAt?: string | null;
  description?: string | null;
  homeOffice?: boolean | null;
  id: number;
  isHiddenJob?: boolean | null;
  jobType?: string | null;
  occupationAreas?: SolidesNamed[] | null;
  recruitmentContractType?: SolidesNamed[] | null;
  state?: { code?: string | null; name?: string | null } | null;
  title?: string | null;
};

// Envelope de GET /home/vacancy. Slug inexistente devolve 200 com
// `data: {}` (sem count) — e a pagina alem da ultima tambem. So a primeira
// pagina vazia desse jeito prova que o board nao existe.
type SolidesVacancyResponse = {
  data?: {
    count?: number;
    currentPage?: number;
    data?: SolidesVacancy[];
    totalPages?: number;
  };
  success?: boolean;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// API publica que o proprio board ({slug}.vagas.solides.com.br, Next.js)
// chama no navegador — sem auth. A API ignora take > 25.
const API_BASE_URL = "https://apigw.solides.com.br/jobs/v3/home/vacancy";
const PAGE_SIZE = 25;
// Teto de seguranca contra loop se totalPages vier inconsistente
// (25 x 40 = 1000 vagas, bem acima do maior board visto).
const MAX_PAGES = 40;
const PAGE_DELAY_MS = 300;

export function extractSolidesSlug(sourceUrl: string) {
  const parsed = new URL(sourceUrl);
  const match = parsed.hostname
    .toLowerCase()
    .match(/^([a-z0-9-]+)\.vagas\.solides\.com\.br$/);
  if (!match?.[1]) {
    throw new Error(
      `Invalid Solides sourceUrl: ${sourceUrl} (expected {subdomain}.vagas.solides.com.br)`,
    );
  }
  return match[1];
}

export function buildSolidesJobUrl(slug: string, vacancyId: number | string) {
  return `https://${slug}.vagas.solides.com.br/vaga/${vacancyId}`;
}

// jobType vem como "presencial" | "remoto" | "hibrido"; homeOffice e o
// flag antigo, ainda preenchido em algumas vagas.
function normalizeWorkModel(vacancy: SolidesVacancy) {
  const jobType = vacancy.jobType?.trim().toLowerCase();
  if (jobType === "remoto") return "remote";
  if (jobType === "hibrido" || jobType === "híbrido") return "hybrid";
  if (jobType === "presencial") return "onsite";
  if (vacancy.homeOffice) return "remote";
  return undefined;
}

// recruitmentContractType traz nomes livres do cadastro da empresa ("CLT",
// "PJ", "Estágio", "Temporário"...). So mapeia os inequivocos.
function normalizeEmploymentType(raw?: string) {
  const value = raw?.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
  if (!value) return undefined;
  if (value === "clt" || value.startsWith("efetivo")) return "full_time";
  if (value === "pj" || value.includes("pessoa juridica")) return "pj";
  if (value.startsWith("estagio")) return "internship";
  if (value.includes("aprendiz")) return "apprentice";
  if (value.startsWith("temporario")) return "temporary";
  if (value.includes("autonomo")) return "autonomous";
  return value;
}

function normalizeDate(value?: string | null) {
  if (!value) return new Date().toISOString();
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return new Date().toISOString();
  return date.toISOString();
}

function joinNames(items?: SolidesNamed[] | null) {
  return (items ?? [])
    .map((item) => item?.name?.trim())
    .filter((name): name is string => Boolean(name));
}

@Injectable()
export class SolidesAdapter implements IngestionSourceAdapter {
  readonly sourceType = "solides" as const;

  private readonly logger = new Logger(SolidesAdapter.name);

  constructor(
    @Inject(SemanticFilterService)
    private readonly semanticFilter: SemanticFilterService,
    @Inject(DatabaseService)
    private readonly database: DatabaseService,
  ) {}

  async collect(
    jobSource: JobSourceContext,
    context?: IngestionCollectContext,
  ): Promise<NormalizedJobObservation[]> {
    const slug = extractSolidesSlug(jobSource.sourceUrl);
    const vacancies = await this.fetchAllVacancies(slug);
    const observations: NormalizedJobObservation[] = [];

    for (const vacancy of vacancies) {
      if (vacancy.isHiddenJob) continue;

      const canonicalKey = `solides:${slug}:${vacancy.id}`;

      let skipSemanticFilter = false;
      if (context) {
        try {
          const existing =
            await context.getExistingJobByCanonicalKey(canonicalKey);
          skipSemanticFilter = Boolean(existing);
        } catch (error) {
          this.logger.warn(
            `Failed dedup lookup for ${canonicalKey}: ${error instanceof Error ? error.message : "unknown"}`,
          );
        }
      }

      if (!skipSemanticFilter) {
        const normalizedTitle = normalizeAdapterTitle(vacancy.title);
        const filterDecision =
          await this.semanticFilter.evaluate(normalizedTitle);

        if (filterDecision.result === "SKIP") {
          context?.onSemanticFilterSkip?.();
          await this.saveDiscardedTitle({
            canonicalKey,
            externalJobId: String(vacancy.id),
            filterReason: filterDecision.reason,
            filterVersion: filterDecision.configVersion,
            ingestionRunId: context?.ingestionRunId,
            jobSourceId: jobSource.id,
            normalizedTitle,
            title: vacancy.title ?? `Solides job ${vacancy.id}`,
          });
          continue;
        }
      }

      observations.push(this.toObservation(slug, vacancy, canonicalKey));
    }

    return observations;
  }

  private async fetchAllVacancies(slug: string) {
    const vacancies: SolidesVacancy[] = [];

    for (let page = 1; page <= MAX_PAGES; page++) {
      const url = new URL(API_BASE_URL);
      url.searchParams.set("slug", slug);
      url.searchParams.set("take", String(PAGE_SIZE));
      url.searchParams.set("page", String(page));

      const response = await this.fetchWithRetry(url);

      if (response.status === 403) {
        throw new IngestionFetchError({
          context: "solides_vacancies",
          message: "Solides vacancies request returned 403 forbidden",
          statusCode: 403,
        });
      }

      if (!response.ok) {
        throw new IngestionFetchError({
          context: "solides_vacancies",
          message: `Solides vacancies request returned HTTP ${response.status}`,
          statusCode: response.status,
        });
      }

      const body = (await response.json()) as SolidesVacancyResponse;
      const pageData = body.data;

      if (typeof pageData?.count !== "number") {
        if (page === 1) {
          throw new Error(`Solides board not found for slug "${slug}"`);
        }
        break;
      }

      const items = pageData.data ?? [];
      vacancies.push(...items);

      const totalPages = pageData.totalPages ?? 1;
      if (items.length === 0 || page >= totalPages) break;

      await sleep(PAGE_DELAY_MS);
    }

    return vacancies;
  }

  private async saveDiscardedTitle(data: {
    canonicalKey: string;
    externalJobId: string;
    filterReason: string;
    filterVersion: string;
    ingestionRunId?: string;
    jobSourceId: string;
    normalizedTitle: string;
    title: string;
  }): Promise<void> {
    try {
      await this.database.crawlerDiscardedTitle.upsert({
        where: { canonicalKey: data.canonicalKey },
        create: {
          canonicalKey: data.canonicalKey,
          externalJobId: data.externalJobId,
          filterReason: data.filterReason,
          filterVersion: data.filterVersion,
          ingestionRunId: data.ingestionRunId,
          jobSourceId: data.jobSourceId,
          normalizedTitle: data.normalizedTitle,
          title: data.title,
        },
        update: {
          discardedAt: new Date(),
          filterReason: data.filterReason,
          filterVersion: data.filterVersion,
          ingestionRunId: data.ingestionRunId,
        },
      });
    } catch (error) {
      this.logger.warn(
        `Failed to save CrawlerDiscardedTitle for ${data.canonicalKey}: ${error instanceof Error ? error.message : "unknown"}`,
      );
    }
  }

  private async fetchWithRetry(url: URL) {
    const requestInit: RequestInit = {
      headers: {
        "User-Agent": "EarlyCV-Crawler/1.0",
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(10_000),
    };

    const response = await fetch(url, requestInit);
    if (response.status !== 429) return response;

    await sleep(1_000);
    return fetch(url, requestInit);
  }

  private toObservation(
    slug: string,
    vacancy: SolidesVacancy,
    canonicalKey: string,
  ): NormalizedJobObservation {
    const title = vacancy.title?.trim() || `Solides job ${vacancy.id}`;
    const address = vacancy.address ?? undefined;
    const rawCity =
      vacancy.city?.name ?? address?.city?.name ?? address?.foreign_city;
    const rawState =
      vacancy.state?.code ??
      address?.state?.code ??
      vacancy.state?.name ??
      address?.foreign_state;
    // Sem fallback "Brasil" de propósito — ver isForeignLocation() em
    // jobs/geo-normalizer.ts, que usa o vazio como sinal.
    const country = address?.country?.name?.trim() || undefined;
    const locationText = [rawCity, rawState, country]
      .map((value) => value?.trim())
      .filter((value): value is string => Boolean(value))
      .join(", ");

    const descriptionRaw = normalizeDescriptionHtml(vacancy.description ?? "");
    const descriptionClean = stripHtml(descriptionRaw) || title;
    const publishedAt = normalizeDate(vacancy.createdAt);
    const contractTypes = joinNames(vacancy.recruitmentContractType);

    return {
      canonicalKey,
      city: normalizeCity(rawCity) ?? undefined,
      country,
      department: joinNames(vacancy.occupationAreas)[0] || undefined,
      descriptionClean,
      descriptionRaw,
      employmentType: normalizeEmploymentType(contractTypes[0]),
      employmentTypeRaw: contractTypes.join(", ") || undefined,
      externalJobId: String(vacancy.id),
      firstSeenAt: publishedAt,
      lastSeenAt: new Date().toISOString(),
      locationText: locationText || "Remote",
      normalizedTitle: normalizeAdapterTitle(title),
      publishedAtSource: publishedAt,
      sourceJobUrl: buildSolidesJobUrl(slug, vacancy.id),
      state: normalizeState(rawState)?.sigla ?? rawState?.trim(),
      status: "active",
      title,
      workModel: normalizeWorkModel(vacancy),
    };
  }
}
