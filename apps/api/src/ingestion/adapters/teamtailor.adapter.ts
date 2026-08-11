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
import { stripHtml } from "./strip-html";
import { normalizeAdapterTitle } from "./title-normalization";

type TeamtailorJobPostingAddress = {
  addressCountry?: string | null;
  addressLocality?: string | null;
  addressRegion?: string | null;
};

type TeamtailorJobPosting = {
  description?: string | null;
  jobLocation?: Array<{ address?: TeamtailorJobPostingAddress | null } | null> | null;
};

type TeamtailorItem = {
  _jobposting?: TeamtailorJobPosting | null;
  content_html?: string | null;
  date_published?: string | null;
  id: string;
  title?: string | null;
  url?: string | null;
};

// Formato JSON Feed (jsonfeed.org) — nao e um formato proprietario do
// Teamtailor, e o que "{slug}.teamtailor.com/jobs.json" retorna.
type TeamtailorJobsFeed = {
  items?: TeamtailorItem[];
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Teamtailor nao expoe employmentType/department no feed publico, e a
// localizacao vem estruturada mas sem heuristica de workModel — mesma
// deteccao por palavra-chave usada no Greenhouse.
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
  const parsed = new URL(sourceUrl);
  const match = parsed.hostname.toLowerCase().match(/^([a-z0-9-]+)\.teamtailor\.com$/);
  if (!match?.[1]) {
    throw new Error(
      `Invalid Teamtailor sourceUrl: ${sourceUrl} (expected {subdomain}.teamtailor.com)`,
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
export class TeamtailorAdapter implements IngestionSourceAdapter {
  readonly sourceType = "teamtailor" as const;

  private readonly logger = new Logger(TeamtailorAdapter.name);

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
    const url = new URL(`https://${slug}.teamtailor.com/jobs.json`);

    const response = await this.fetchWithRetry(url);

    if (response.status === 403) {
      throw new IngestionFetchError({
        context: "teamtailor_jobs_feed",
        message: "Teamtailor jobs feed request returned 403 forbidden",
        statusCode: 403,
      });
    }

    if (!response.ok) {
      throw new IngestionFetchError({
        context: "teamtailor_jobs_feed",
        message: `Teamtailor jobs feed request returned HTTP ${response.status}`,
        statusCode: response.status,
      });
    }

    const data = (await response.json()) as TeamtailorJobsFeed;
    const items = data.items ?? [];
    const observations: NormalizedJobObservation[] = [];

    for (const item of items) {
      const canonicalKey = `teamtailor:${slug}:${item.id}`;

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
        const normalizedTitle = normalizeAdapterTitle(item.title);
        const filterDecision = await this.semanticFilter.evaluate(normalizedTitle);

        if (filterDecision.result === "SKIP") {
          await this.saveDiscardedTitle({
            canonicalKey,
            externalJobId: item.id,
            filterReason: filterDecision.reason,
            filterVersion: filterDecision.configVersion,
            ingestionRunId: context?.ingestionRunId,
            jobSourceId: jobSource.id,
            normalizedTitle,
            title: item.title ?? `Teamtailor job ${item.id}`,
          });
          continue;
        }
      }

      observations.push(this.toObservation(slug, item, canonicalKey));
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
    item: TeamtailorItem,
    canonicalKey: string,
  ): NormalizedJobObservation {
    const title = item.title?.trim() || `Teamtailor job ${item.id}`;
    const address = item._jobposting?.jobLocation?.[0]?.address ?? undefined;
    const locationText = [
      address?.addressLocality,
      address?.addressRegion,
      address?.addressCountry,
    ]
      .map((value) => value?.trim())
      .filter((value): value is string => Boolean(value))
      .join(", ");

    const descriptionRaw = item.content_html ?? item._jobposting?.description ?? "";
    const descriptionClean = stripHtml(descriptionRaw) || title;
    const workModel = inferWorkModel(locationText, title, descriptionClean);
    const publishedAt = normalizeDate(item.date_published);
    const state =
      normalizeState(address?.addressRegion)?.sigla ??
      address?.addressRegion?.trim();

    return {
      canonicalKey,
      city: normalizeCity(address?.addressLocality) ?? undefined,
      // Sem fallback "Brasil" de propósito — ver isForeignLocation() em
      // ingestion.service.ts, que usa o vazio como sinal.
      country: address?.addressCountry?.trim(),
      descriptionClean,
      descriptionRaw,
      externalJobId: item.id,
      firstSeenAt: publishedAt,
      lastSeenAt: new Date().toISOString(),
      locationText: locationText || "Remote",
      normalizedTitle: normalizeAdapterTitle(title),
      publishedAtSource: publishedAt,
      sourceJobUrl:
        item.url ?? `https://${slug}.teamtailor.com/jobs/${item.id}`,
      state,
      status: "active",
      title,
      workModel,
    };
  }
}
