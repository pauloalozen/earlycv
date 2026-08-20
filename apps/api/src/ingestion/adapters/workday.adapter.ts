import { Inject, Injectable, Logger } from "@nestjs/common";
import { DatabaseService } from "../../database/database.service";
import { normalizeCity, normalizeState } from "../../jobs/geo-normalizer";
import { shouldSkipDetailFetch } from "../dedup-policy";
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

type WorkdayListingJob = {
  bulletFields?: string[] | null;
  externalPath?: string | null;
  locationsText?: string | null;
  postedOn?: string | null;
  title?: string | null;
};

type WorkdayJobsResponse = {
  jobPostings?: WorkdayListingJob[];
  total?: number;
};

type WorkdayJobDetail = {
  country?: { descriptor?: string | null } | null;
  jobDescription?: string | null;
  jobPostingId?: string | null;
  jobReqId?: string | null;
  jobRequisitionLocation?: { descriptor?: string | null } | null;
  location?: string | null;
  startDate?: string | null;
  timeType?: string | null;
  title?: string | null;
};

type WorkdayJobDetailResponse = {
  jobPostingInfo?: WorkdayJobDetail;
};

type ParsedLocation = {
  city?: string;
  country?: string;
  state?: string;
};

const PAGE_LIMIT = 20;
const MAX_LISTING_PAGES = 200;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Workday nao expoe city/state estruturados alem do descritor de
// local/escritorio — tenta o mesmo parser por virgula usado no
// Greenhouse/Lever pra quando o valor vier como "Cidade, Estado".
function parseLocation(location: string): ParsedLocation {
  if (!location) return {};

  const parts = location
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length >= 3) {
    return { city: parts[0], state: parts[1], country: parts[2] };
  }
  if (parts.length === 2) {
    return { city: parts[0], state: parts[1] };
  }

  return {};
}

function inferWorkModel(location: string, title: string, description: string) {
  const text = `${location} ${title} ${description.slice(0, 500)}`.toLowerCase();

  if (
    text.includes("remote") ||
    text.includes("remoto") ||
    text.includes("telecommut")
  ) {
    return "remote";
  }
  if (text.includes("hibrido") || text.includes("hybrid")) {
    return "hybrid";
  }
  if (text.includes("presencial") || text.includes("on-site") || text.includes("onsite")) {
    return "onsite";
  }

  return undefined;
}

// sourceUrl e a URL publica da career site (ex:
// https://santander.wd3.myworkdayjobs.com/pt-BR/SantanderCareers) — o
// tenant e a instancia (wd1/wd3/wd501/...) vem do hostname, o "site" e o
// ultimo segmento do path (ignora prefixo de locale tipo /pt-BR/).
function parseWorkdaySourceUrl(sourceUrl: string) {
  const parsed = new URL(sourceUrl);
  const hostMatch = parsed.hostname
    .toLowerCase()
    .match(/^([a-z0-9-]+)\.(wd\d+)\.myworkdayjobs\.com$/);

  if (!hostMatch?.[1] || !hostMatch?.[2]) {
    throw new Error(
      `Invalid Workday sourceUrl: ${sourceUrl} (expected {tenant}.{instance}.myworkdayjobs.com/{site})`,
    );
  }

  const segments = parsed.pathname.split("/").filter(Boolean);
  const site = segments[segments.length - 1];

  if (!site) {
    throw new Error(
      `Invalid Workday sourceUrl: ${sourceUrl} (missing career site name in path)`,
    );
  }

  return { instance: hostMatch[2], site, tenant: hostMatch[1] };
}

function normalizeDate(value?: string | null) {
  if (!value) return new Date().toISOString();
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return new Date().toISOString();
  return date.toISOString();
}

@Injectable()
export class WorkdayAdapter implements IngestionSourceAdapter {
  readonly sourceType = "workday" as const;

  private readonly logger = new Logger(WorkdayAdapter.name);

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
    const { instance, site, tenant } = parseWorkdaySourceUrl(jobSource.sourceUrl);
    const baseUrl = `https://${tenant}.${instance}.myworkdayjobs.com`;
    const apiUrl = new URL(`${baseUrl}/wday/cxs/${tenant}/${site}/jobs`);

    // O campo "total" da resposta do Workday nao e confiavel — testado ao
    // vivo com Santander e Natura, ele volta 0 (ou null) em paginas depois
    // da primeira mesmo com jobPostings cheio de vagas reais, e a propria
    // primeira pagina as vezes volta vazia de forma transitoria. Por isso
    // a paginacao aqui ignora "total" e usa so o tamanho da pagina: uma
    // pagina parcial (< PAGE_LIMIT) e o sinal real de fim de lista, e uma
    // pagina vazia leva 1 retry (com espera) antes de aceitar como fim,
    // pra nao cortar a lista cedo por causa de uma resposta instavel.
    const allJobs: WorkdayListingJob[] = [];
    let offset = 0;

    for (let page = 0; page < MAX_LISTING_PAGES; page += 1) {
      let jobs: WorkdayListingJob[] = [];

      for (let attempt = 0; attempt <= 1; attempt += 1) {
        const response = await this.fetchWithRetry(apiUrl, {
          appliedFacets: {},
          limit: PAGE_LIMIT,
          offset,
          searchText: "",
        });

        if (response.status === 403) {
          throw new IngestionFetchError({
            context: "workday_jobs_api",
            message: "Workday jobs API request returned 403 forbidden",
            statusCode: 403,
          });
        }

        if (!response.ok) {
          throw new IngestionFetchError({
            context: "workday_jobs_api",
            message: `Workday jobs API request returned HTTP ${response.status}`,
            statusCode: response.status,
          });
        }

        const data = (await response.json()) as WorkdayJobsResponse;
        jobs = data.jobPostings ?? [];

        if (jobs.length > 0 || attempt === 1) break;
        await sleep(500);
      }

      if (jobs.length === 0) break;

      allJobs.push(...jobs);
      offset += jobs.length;

      if (jobs.length < PAGE_LIMIT) break;
      await sleep(300);
    }

    const observations: NormalizedJobObservation[] = [];
    const now = new Date();

    for (const job of allJobs) {
      if (!job.externalPath) continue;

      const externalJobId =
        job.bulletFields?.[0] ??
        job.externalPath.split("/").filter(Boolean).pop() ??
        job.externalPath;
      const canonicalKey = `workday:${tenant}:${site}:${externalJobId}`;
      let existing: { lastSeenAt: Date | null } | null = null;

      if (context) {
        try {
          existing = await context.getExistingJobByCanonicalKey(canonicalKey);
          if (shouldSkipDetailFetch(existing?.lastSeenAt, now)) {
            observations.push(
              this.toListingObservation(baseUrl, site, job, externalJobId, canonicalKey),
            );
            continue;
          }
        } catch (error) {
          this.logger.warn(
            `Failed dedup lookup for ${canonicalKey}: ${error instanceof Error ? error.message : "unknown"}`,
          );
        }
      }

      if (!existing) {
        const normalizedTitle = normalizeAdapterTitle(job.title);
        const filterDecision = await this.semanticFilter.evaluate(normalizedTitle);

        if (filterDecision.result === "SKIP") {
          context?.onSemanticFilterSkip?.();
          await this.saveDiscardedTitle({
            canonicalKey,
            externalJobId,
            filterReason: filterDecision.reason,
            filterVersion: filterDecision.configVersion,
            ingestionRunId: context?.ingestionRunId,
            jobSourceId: jobSource.id,
            normalizedTitle,
            title: job.title ?? `Workday job ${externalJobId}`,
          });
          continue;
        }
      }

      try {
        const detailUrl = new URL(
          `${baseUrl}/wday/cxs/${tenant}/${site}${job.externalPath}`,
        );
        const detailResponse = await this.fetchWithRetry(detailUrl);

        if (detailResponse.status === 403) {
          throw new IngestionFetchError({
            context: "workday_job_detail",
            message: `Workday job detail request returned 403 forbidden for ${externalJobId}`,
            statusCode: 403,
          });
        }

        if (!detailResponse.ok) {
          this.logger.warn(
            `Skipping Workday detail due to HTTP ${detailResponse.status} for job ${externalJobId}`,
          );
          continue;
        }

        const detail = (await detailResponse.json()) as WorkdayJobDetailResponse;
        if (!detail.jobPostingInfo) {
          this.logger.warn(
            `Skipping Workday detail missing jobPostingInfo for job ${externalJobId}`,
          );
          continue;
        }

        observations.push(
          this.toObservation(
            baseUrl,
            site,
            job,
            detail.jobPostingInfo,
            externalJobId,
            canonicalKey,
          ),
        );
      } catch (error) {
        if (error instanceof IngestionFetchError) throw error;
        this.logger.warn(
          `Skipping Workday detail for ${externalJobId} due to error: ${error instanceof Error ? error.message : "unknown"}`,
        );
      }
    }

    return observations;
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

  private async fetchWithRetry(url: URL, body?: Record<string, unknown>) {
    const requestInit: RequestInit = {
      headers: {
        "User-Agent": "EarlyCV-Crawler/1.0",
        Accept: "application/json",
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      method: body ? "POST" : "GET",
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(10_000),
    };

    const response = await fetch(url, requestInit);
    if (response.status !== 429) return response;

    await sleep(1_000);
    return fetch(url, requestInit);
  }

  private toListingObservation(
    baseUrl: string,
    site: string,
    job: WorkdayListingJob,
    externalJobId: string,
    canonicalKey: string,
  ): NormalizedJobObservation {
    const title = job.title?.trim() || `Workday job ${externalJobId}`;
    const locationText = job.locationsText?.trim() || "";
    const now = new Date().toISOString();

    return {
      canonicalKey,
      country: "Brasil",
      descriptionClean: title,
      descriptionRaw: "",
      detailFetchSkipped: true,
      externalJobId,
      firstSeenAt: now,
      lastSeenAt: now,
      locationText: locationText || "Remote",
      normalizedTitle: normalizeAdapterTitle(title),
      publishedAtSource: now,
      sourceJobUrl: `${baseUrl}/${site}${job.externalPath ?? ""}`,
      status: "active",
      title,
    };
  }

  private toObservation(
    baseUrl: string,
    site: string,
    listingJob: WorkdayListingJob,
    detail: WorkdayJobDetail,
    externalJobId: string,
    canonicalKey: string,
  ): NormalizedJobObservation {
    const title = detail.title?.trim() || listingJob.title?.trim() || `Workday job ${externalJobId}`;
    const locationText =
      detail.jobRequisitionLocation?.descriptor?.trim() ||
      detail.location?.trim() ||
      listingJob.locationsText?.trim() ||
      "";
    const parsedLocation = parseLocation(locationText);
    const city = normalizeCity(parsedLocation.city) ?? undefined;
    const state =
      normalizeState(parsedLocation.state)?.sigla ?? parsedLocation.state;
    const country = detail.country?.descriptor?.trim();

    const descriptionRaw = normalizeDescriptionHtml(detail.jobDescription ?? "");
    const descriptionClean = stripHtml(descriptionRaw) || title;
    const workModel = inferWorkModel(locationText, title, descriptionClean);
    const publishedAt = normalizeDate(detail.startDate);

    return {
      canonicalKey,
      city,
      // Sem fallback "Brasil" de propósito — ver isForeignLocation() em
      // ingestion.service.ts, que usa o vazio como sinal.
      country,
      descriptionClean,
      descriptionRaw,
      employmentType: detail.timeType?.trim() || undefined,
      employmentTypeRaw: detail.timeType?.trim() || undefined,
      externalJobId,
      firstSeenAt: publishedAt,
      lastSeenAt: new Date().toISOString(),
      locationText: locationText || "Remote",
      normalizedTitle: normalizeAdapterTitle(title),
      publishedAtSource: publishedAt,
      sourceJobUrl: `${baseUrl}/${site}${listingJob.externalPath ?? ""}`,
      state,
      status: "active",
      title,
      workModel,
    };
  }
}
