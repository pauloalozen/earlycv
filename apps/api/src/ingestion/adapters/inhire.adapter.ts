import { Inject, Injectable, Logger } from "@nestjs/common";
import { DatabaseService } from "../../database/database.service";
import { shouldSkipDetailFetch } from "../dedup-policy";
import { IngestionFetchError } from "../errors";
import { SemanticFilterService } from "../semantic-filter.service";
import type {
  IngestionCollectContext,
  IngestionSourceAdapter,
  JobSourceContext,
  NormalizedJobObservation,
} from "../types";
import { stripHtml } from "./strip-html";
import { normalizeAdapterTitle } from "./title-normalization";

type InHireListingJob = {
  displayName?: string | null;
  jobId: string;
  location?: string | null;
  status?: string | null;
  workplaceType?: string | null;
};

type InHireListingResponse = {
  jobsPage?: InHireListingJob[];
};

type InHireJobDetail = {
  contractType?: string[] | null;
  description?: string | null;
  displayName?: string | null;
  jobId: string;
  location?: string | null;
  locationComplement?: string | null;
  publishedAt?: string | null;
  status?: string | null;
  workplaceType?: string | null;
};

type ParsedLocation = {
  city?: string;
  country?: string;
  state?: string;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// InHire tambem so da location como string livre (ex: "Barueri, SP, BR").
// Mesmo parser por virgula do Greenhouse/Lever.
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

function normalizeWorkModel(workplaceType?: string | null) {
  const normalized = workplaceType?.trim().toLowerCase();
  if (normalized === "remote") return "remote";
  if (normalized === "hybrid") return "hybrid";
  if (normalized === "on-site" || normalized === "onsite") return "onsite";
  return undefined;
}

function extractSlug(sourceUrl: string) {
  const parsed = new URL(sourceUrl);
  const match = parsed.hostname.toLowerCase().match(/^([a-z0-9-]+)\.inhire\.app$/);
  if (!match?.[1]) {
    throw new Error(
      `Invalid InHire sourceUrl: ${sourceUrl} (expected {subdomain}.inhire.app)`,
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

const API_BASE_URL = "https://api.inhire.app/job-posts/public/pages";

@Injectable()
export class InHireAdapter implements IngestionSourceAdapter {
  readonly sourceType = "inhire" as const;

  private readonly logger = new Logger(InHireAdapter.name);

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
    const listingResponse = await this.fetchWithRetry(new URL(API_BASE_URL), slug);

    if (listingResponse.status === 403) {
      throw new IngestionFetchError({
        context: "inhire_public_pages",
        message: "InHire public pages request returned 403 forbidden",
        statusCode: 403,
      });
    }

    if (!listingResponse.ok) {
      throw new IngestionFetchError({
        context: "inhire_public_pages",
        message: `InHire public pages request returned HTTP ${listingResponse.status}`,
        statusCode: listingResponse.status,
      });
    }

    const listingData = (await listingResponse.json()) as InHireListingResponse;
    const jobs = (listingData.jobsPage ?? []).filter(
      (job) => !job.status || job.status === "published",
    );
    const observations: NormalizedJobObservation[] = [];
    const now = new Date();

    for (const job of jobs) {
      const canonicalKey = `inhire:${slug}:${job.jobId}`;
      let existing: { lastSeenAt: Date | null } | null = null;

      if (context) {
        try {
          existing = await context.getExistingJobByCanonicalKey(canonicalKey);
          if (shouldSkipDetailFetch(existing?.lastSeenAt, now)) {
            observations.push(
              this.toListingObservation(slug, job, canonicalKey),
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
        const normalizedTitle = normalizeAdapterTitle(job.displayName);
        const filterDecision = await this.semanticFilter.evaluate(normalizedTitle);

        if (filterDecision.result === "SKIP") {
          await this.saveDiscardedTitle({
            canonicalKey,
            externalJobId: job.jobId,
            filterReason: filterDecision.reason,
            filterVersion: filterDecision.configVersion,
            ingestionRunId: context?.ingestionRunId,
            jobSourceId: jobSource.id,
            normalizedTitle,
            title: job.displayName ?? `InHire job ${job.jobId}`,
          });
          continue;
        }
      }

      try {
        const detailResponse = await this.fetchWithRetry(
          new URL(`${API_BASE_URL}/${job.jobId}`),
          slug,
        );

        if (detailResponse.status === 403) {
          throw new IngestionFetchError({
            context: "inhire_job_detail",
            message: `InHire job detail request returned 403 forbidden for ${job.jobId}`,
            statusCode: 403,
          });
        }

        if (!detailResponse.ok) {
          this.logger.warn(
            `Skipping InHire detail due to HTTP ${detailResponse.status} for job ${job.jobId}`,
          );
          continue;
        }

        const detail = (await detailResponse.json()) as InHireJobDetail;
        observations.push(this.toObservation(slug, detail, canonicalKey));
      } catch (error) {
        if (error instanceof IngestionFetchError) throw error;
        this.logger.warn(
          `Skipping InHire detail for ${job.jobId} due to error: ${error instanceof Error ? error.message : "unknown"}`,
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

  private async fetchWithRetry(url: URL, tenant: string) {
    const requestInit: RequestInit = {
      headers: {
        "User-Agent": "EarlyCV-Crawler/1.0",
        Accept: "application/json",
        "X-Tenant": tenant,
      },
      signal: AbortSignal.timeout(10_000),
    };

    const response = await fetch(url, requestInit);
    if (response.status !== 429) return response;

    await sleep(1_000);
    return fetch(url, requestInit);
  }

  private toListingObservation(
    slug: string,
    job: InHireListingJob,
    canonicalKey: string,
  ): NormalizedJobObservation {
    const title = job.displayName?.trim() || `InHire job ${job.jobId}`;
    const locationText = job.location?.trim() || "";
    const { city, state, country } = parseLocation(locationText);
    const now = new Date().toISOString();

    return {
      canonicalKey,
      city,
      country: country || "Brasil",
      descriptionClean: title,
      descriptionRaw: "",
      detailFetchSkipped: true,
      externalJobId: job.jobId,
      firstSeenAt: now,
      lastSeenAt: now,
      locationText: locationText || "Remote",
      normalizedTitle: normalizeAdapterTitle(title),
      publishedAtSource: now,
      sourceJobUrl: `https://${slug}.inhire.app/vagas/${job.jobId}`,
      state,
      status: "active",
      title,
      workModel: normalizeWorkModel(job.workplaceType),
    };
  }

  private toObservation(
    slug: string,
    detail: InHireJobDetail,
    canonicalKey: string,
  ): NormalizedJobObservation {
    const title = detail.displayName?.trim() || `InHire job ${detail.jobId}`;
    const locationText = [detail.location, detail.locationComplement]
      .map((value) => value?.trim())
      .filter((value): value is string => Boolean(value))
      .join(" - ");
    const { city, state, country } = parseLocation(detail.location?.trim() ?? "");

    const descriptionRaw = detail.description ?? "";
    const descriptionClean = stripHtml(descriptionRaw) || title;
    const publishedAt = normalizeDate(detail.publishedAt);

    return {
      canonicalKey,
      city,
      country: country || "Brasil",
      descriptionClean,
      descriptionRaw,
      employmentType: detail.contractType?.[0]?.toLowerCase() || undefined,
      employmentTypeRaw: detail.contractType?.join(", ") || undefined,
      externalJobId: detail.jobId,
      firstSeenAt: publishedAt,
      lastSeenAt: publishedAt,
      locationText: locationText || "Remote",
      normalizedTitle: normalizeAdapterTitle(title),
      publishedAtSource: publishedAt,
      sourceJobUrl: `https://${slug}.inhire.app/vagas/${detail.jobId}`,
      state,
      status: "active",
      title,
      workModel: normalizeWorkModel(detail.workplaceType),
    };
  }
}
