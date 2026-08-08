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

type GreenhouseJob = {
  absolute_url?: string | null;
  content?: string | null;
  departments?: Array<{ name?: string | null }> | null;
  id: number | string;
  location?: { name?: string | null } | null;
  title?: string | null;
  updated_at?: string | null;
};

type GreenhouseJobsResponse = {
  jobs?: GreenhouseJob[];
  meta?: { total?: number };
};

type ParsedLocation = {
  city?: string;
  country?: string;
  state?: string;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function stripHtml(value: string) {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<li>/gi, "• ")
    .replace(/<\/li>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Greenhouse nao expoe city/state estruturados — so uma string livre por
// vaga (ex: "Sao Paulo, SP, Brasil", "Remote", "Brazil"). Sem endereco
// estruturado, esse parser por virgula e a unica forma de popular
// city/state/country no NormalizedJobObservation.
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
    return { city: parts[0], country: parts[1] };
  }

  return { country: parts[0] };
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

function extractSlug(sourceUrl: string) {
  const match = sourceUrl.match(/\/boards\/([^/]+)\/jobs/);
  if (!match?.[1]) {
    throw new Error(
      `Invalid Greenhouse sourceUrl: ${sourceUrl} (expected .../boards/{slug}/jobs)`,
    );
  }
  return match[1];
}

function normalizeDate(value?: string | null) {
  if (!value) return new Date().toISOString();
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return new Date().toISOString();
  return date.toISOString();
}

@Injectable()
export class GreenhouseAdapter implements IngestionSourceAdapter {
  readonly sourceType = "greenhouse" as const;

  private readonly logger = new Logger(GreenhouseAdapter.name);

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
    const url = new URL(`https://boards-api.greenhouse.io/v1/boards/${slug}/jobs`);
    url.searchParams.set("content", "true");

    const response = await this.fetchWithRetry(url);

    if (response.status === 403) {
      throw new IngestionFetchError({
        context: "greenhouse_board_api",
        message: "Greenhouse board API request returned 403 forbidden",
        statusCode: 403,
      });
    }

    if (!response.ok) {
      throw new IngestionFetchError({
        context: "greenhouse_board_api",
        message: `Greenhouse board API request returned HTTP ${response.status}`,
        statusCode: response.status,
      });
    }

    const data = (await response.json()) as GreenhouseJobsResponse;
    const jobs = data.jobs ?? [];
    const observations: NormalizedJobObservation[] = [];

    for (const job of jobs) {
      const canonicalKey = `greenhouse:${slug}:${String(job.id)}`;

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
            externalJobId: String(job.id),
            filterReason: filterDecision.reason,
            filterVersion: filterDecision.configVersion,
            ingestionRunId: context?.ingestionRunId,
            jobSourceId: jobSource.id,
            normalizedTitle,
            title: job.title ?? `Greenhouse job ${String(job.id)}`,
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
    job: GreenhouseJob,
    canonicalKey: string,
  ): NormalizedJobObservation {
    const title = job.title?.trim() || `Greenhouse job ${String(job.id)}`;
    const locationText = job.location?.name?.trim() ?? "";
    const { city, state, country } = parseLocation(locationText);

    const descriptionRaw = job.content ?? "";
    const descriptionClean = stripHtml(descriptionRaw) || title;
    const workModel = inferWorkModel(locationText, title, descriptionClean);
    const publishedAt = normalizeDate(job.updated_at);

    return {
      canonicalKey,
      city,
      country: country || "Brasil",
      department: job.departments?.[0]?.name?.trim() || undefined,
      descriptionClean,
      descriptionRaw,
      externalJobId: String(job.id),
      firstSeenAt: publishedAt,
      lastSeenAt: publishedAt,
      locationText: locationText || "Remote",
      normalizedTitle: normalizeAdapterTitle(title),
      publishedAtSource: publishedAt,
      sourceJobUrl:
        job.absolute_url ??
        `https://job-boards.greenhouse.io/${slug}/jobs/${String(job.id)}`,
      state,
      status: "active",
      title,
      workModel,
    };
  }
}
