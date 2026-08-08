import { Inject, Injectable, Logger } from "@nestjs/common";
import { DatabaseService } from "../../database/database.service";
import { IngestionFetchError } from "../errors";
import { SemanticFilterService } from "../semantic-filter.service";
import type {
  IngestionCollectContext,
  IngestionSourceAdapter,
  JobSourceContext,
  NormalizedJobObservation,
} from "../types";
import { normalizeAdapterTitle } from "./title-normalization";

type AshbyJob = {
  address?: {
    postalAddress?: {
      addressCountry?: string | null;
      addressLocality?: string | null;
      addressRegion?: string | null;
    } | null;
  } | null;
  department?: string | null;
  descriptionHtml?: string | null;
  descriptionPlain?: string | null;
  employmentType?: string | null;
  id: string;
  isRemote?: boolean | null;
  jobUrl?: string | null;
  location?: string | null;
  publishedAt?: string | null;
  team?: string | null;
  title?: string | null;
  workplaceType?: string | null;
};

type AshbyBoardResponse = {
  apiVersion?: string;
  jobs?: AshbyJob[];
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Ashby ja retorna texto puro em descriptionPlain — nao precisa de strip
// de HTML, so aparar espacos e cair pro titulo se vier vazio.
function cleanDescription(value: string | null | undefined, fallback: string) {
  const trimmed = value?.trim();
  return trimmed || fallback;
}

const EMPLOYMENT_TYPE_MAP: Record<string, string> = {
  Apprenticeship: "apprentice",
  Contract: "contract",
  FullTime: "full_time",
  Intern: "internship",
  Internship: "internship",
  PartTime: "part_time",
  Temporary: "temporary",
};

function normalizeEmploymentType(value?: string | null) {
  const raw = value?.trim();
  if (!raw) return undefined;
  return EMPLOYMENT_TYPE_MAP[raw] ?? raw;
}

function normalizeWorkModel(workplaceType?: string | null, isRemote?: boolean | null) {
  if (isRemote) return "remote";

  const normalized = workplaceType?.trim().toLowerCase();
  if (normalized === "remote") return "remote";
  if (normalized === "hybrid") return "hybrid";
  if (normalized === "onsite" || normalized === "on-site") return "onsite";
  return undefined;
}

// Aceita tanto a URL da API (api.ashbyhq.com/posting-api/job-board/{slug})
// quanto a pagina publica que a pessoa encontra e cola no cadastro
// (jobs.ashbyhq.com/{slug}) — mesmo slug, muda so onde ele aparece na URL.
function extractSlug(sourceUrl: string) {
  const apiMatch = sourceUrl.match(/\/job-board\/([^/?]+)/);
  if (apiMatch?.[1]) return apiMatch[1];

  try {
    const parsed = new URL(sourceUrl);
    if (parsed.hostname.toLowerCase() === "jobs.ashbyhq.com") {
      const [slug] = parsed.pathname.split("/").filter(Boolean);
      if (slug) return slug;
    }
  } catch {
    // cai no throw abaixo
  }

  throw new Error(
    `Invalid Ashby sourceUrl: ${sourceUrl} (expected .../posting-api/job-board/{slug} or jobs.ashbyhq.com/{slug})`,
  );
}

function normalizeDate(value?: string | null) {
  if (!value) return new Date().toISOString();
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return new Date().toISOString();
  return date.toISOString();
}

@Injectable()
export class AshbyAdapter implements IngestionSourceAdapter {
  readonly sourceType = "ashby" as const;

  private readonly logger = new Logger(AshbyAdapter.name);

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
    const slug = extractSlug(jobSource.sourceUrl);
    const url = new URL(`https://api.ashbyhq.com/posting-api/job-board/${slug}`);

    const response = await this.fetchWithRetry(url);

    if (response.status === 403) {
      throw new IngestionFetchError({
        context: "ashby_board_api",
        message: "Ashby board API request returned 403 forbidden",
        statusCode: 403,
      });
    }

    if (!response.ok) {
      throw new IngestionFetchError({
        context: "ashby_board_api",
        message: `Ashby board API request returned HTTP ${response.status}`,
        statusCode: response.status,
      });
    }

    const data = (await response.json()) as AshbyBoardResponse;
    const jobs = data.jobs ?? [];
    const observations: NormalizedJobObservation[] = [];

    for (const job of jobs) {
      const canonicalKey = `ashby:${slug}:${job.id}`;

      let skipSemanticFilter = false;
      if (context) {
        try {
          const existing = await context.getExistingJobByCanonicalKey(canonicalKey);
          skipSemanticFilter = Boolean(existing);
        } catch (error) {
          this.logger.warn(
            `Failed dedup lookup for ${canonicalKey}: ${error instanceof Error ? error.message : "unknown"}`,
          );
        }
      }

      if (!skipSemanticFilter) {
        const normalizedTitle = normalizeAdapterTitle(job.title);
        const filterDecision = await this.semanticFilter.evaluate(normalizedTitle);

        if (filterDecision.result === "SKIP") {
          await this.saveDiscardedTitle({
            canonicalKey,
            externalJobId: job.id,
            filterReason: filterDecision.reason,
            filterVersion: filterDecision.configVersion,
            ingestionRunId: context?.ingestionRunId,
            jobSourceId: jobSource.id,
            normalizedTitle,
            title: job.title ?? `Ashby job ${job.id}`,
          });
          continue;
        }
      }

      observations.push(this.toObservation(slug, job, canonicalKey));
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
    job: AshbyJob,
    canonicalKey: string,
  ): NormalizedJobObservation {
    const title = job.title?.trim() || `Ashby job ${job.id}`;
    const postalAddress = job.address?.postalAddress ?? undefined;
    const locationText = job.location?.trim() || "";
    const descriptionClean = cleanDescription(job.descriptionPlain, title);
    const workModel = normalizeWorkModel(job.workplaceType, job.isRemote);
    const publishedAt = normalizeDate(job.publishedAt);

    return {
      canonicalKey,
      city: postalAddress?.addressLocality?.trim() || undefined,
      country: postalAddress?.addressCountry?.trim() || "Brasil",
      department: job.department?.trim() || job.team?.trim() || undefined,
      descriptionClean,
      descriptionRaw: job.descriptionHtml ?? "",
      employmentType: normalizeEmploymentType(job.employmentType),
      employmentTypeRaw: job.employmentType?.trim() || undefined,
      externalJobId: job.id,
      firstSeenAt: publishedAt,
      lastSeenAt: publishedAt,
      locationText: locationText || "Remote",
      normalizedTitle: normalizeAdapterTitle(title),
      publishedAtSource: publishedAt,
      sourceJobUrl:
        job.jobUrl ?? `https://jobs.ashbyhq.com/${slug}/${job.id}`,
      state: postalAddress?.addressRegion?.trim() || undefined,
      status: "active",
      title,
      workModel,
    };
  }
}
