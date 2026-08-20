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
import { normalizeVacancyType } from "./vacancy-type";

// TalentBrew (Radancy) nao tem API JSON publica — a listagem e HTML
// server-rendered (paginacao por query string ?p=N) e o detalhe embute um
// bloco <script type="application/ld+json"> com schema.org JobPosting.
// Sem lib de parsing de HTML no projeto, a extracao da listagem e via
// regex sobre o bloco de cada card; o detalhe e so JSON.parse (o script
// tag nao tem o HTML-entity-escaping que a listagem tem).
const MAX_LISTING_PAGES = 200;

type TalentBrewJobPostingLd = {
  datePosted?: string | null;
  description?: string | null;
  employmentType?: string | null;
  industry?: string | null;
  jobLocation?: Array<{
    address?: {
      addressCountry?: string | null;
      addressLocality?: string | null;
      addressRegion?: string | null;
    } | null;
  }> | null;
  title?: string | null;
  url?: string | null;
};

type ListingCard = {
  href: string;
  jobId: string;
  location: string;
  title: string;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// So a listagem HTML precisa disso — o JSON-LD do detalhe ja vem como
// texto UTF-8 normal (tag <script> nao passa por entity-escaping de HTML).
function decodeHtmlEntities(value: string) {
  return value
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) =>
      String.fromCodePoint(Number.parseInt(hex, 16)),
    )
    .replace(/&#(\d+);/g, (_, dec: string) =>
      String.fromCodePoint(Number.parseInt(dec, 10)),
    )
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .trim();
}

function parseListingCards(html: string): ListingCard[] {
  const cards: ListingCard[] = [];
  const cardRegex =
    /<a href="([^"]+)" data-job-id="(\d+)" class="results__item-link">([\s\S]*?)<\/a>/g;

  let match: RegExpExecArray | null = cardRegex.exec(html);
  while (match) {
    const [, href, jobId, inner] = match;
    const titleMatch = inner?.match(
      /<h2 class="results__item-heading">([^<]*)<\/h2>/,
    );
    const locationMatch = inner?.match(
      /<span class="job-location results__item-facet">([^<]*)<\/span>/,
    );

    if (href && jobId && titleMatch?.[1]) {
      cards.push({
        href,
        jobId,
        location: decodeHtmlEntities(locationMatch?.[1] ?? ""),
        title: decodeHtmlEntities(titleMatch[1]),
      });
    }

    match = cardRegex.exec(html);
  }

  return cards;
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

function getOrigin(sourceUrl: string) {
  try {
    return new URL(sourceUrl).origin;
  } catch {
    throw new Error(`Invalid TalentBrew sourceUrl: ${sourceUrl}`);
  }
}

function normalizeDate(value?: string | null) {
  if (!value) return new Date().toISOString();
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return new Date().toISOString();
  return date.toISOString();
}

@Injectable()
export class TalentbrewAdapter implements IngestionSourceAdapter {
  readonly sourceType = "talentbrew" as const;

  private readonly logger = new Logger(TalentbrewAdapter.name);

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
    const origin = getOrigin(jobSource.sourceUrl);
    const slug = new URL(origin).hostname;
    const allCards: ListingCard[] = [];

    for (let page = 1; page <= MAX_LISTING_PAGES; page += 1) {
      const url = new URL(`${origin}/busca-de-vagas`);
      url.searchParams.set("p", String(page));

      const response = await this.fetchWithRetry(url);

      if (response.status === 403) {
        throw new IngestionFetchError({
          context: "talentbrew_listing",
          message: "TalentBrew listing request returned 403 forbidden",
          statusCode: 403,
        });
      }

      if (!response.ok) {
        throw new IngestionFetchError({
          context: "talentbrew_listing",
          message: `TalentBrew listing request returned HTTP ${response.status}`,
          statusCode: response.status,
        });
      }

      const html = await response.text();
      const cards = parseListingCards(html);
      if (cards.length === 0) break;

      allCards.push(...cards);
      await sleep(300);
    }

    const observations: NormalizedJobObservation[] = [];
    const now = new Date();

    for (const card of allCards) {
      const canonicalKey = `talentbrew:${slug}:${card.jobId}`;
      let existing: { lastSeenAt: Date | null } | null = null;

      if (context) {
        try {
          existing = await context.getExistingJobByCanonicalKey(canonicalKey);
          if (shouldSkipDetailFetch(existing?.lastSeenAt, now)) {
            observations.push(this.toListingObservation(origin, card, canonicalKey));
            continue;
          }
        } catch (error) {
          this.logger.warn(
            `Failed dedup lookup for ${canonicalKey}: ${error instanceof Error ? error.message : "unknown"}`,
          );
        }
      }

      if (!existing) {
        const normalizedTitle = normalizeAdapterTitle(card.title);
        const filterDecision = await this.semanticFilter.evaluate(normalizedTitle);

        if (filterDecision.result === "SKIP") {
          context?.onSemanticFilterSkip?.();
          await this.saveDiscardedTitle({
            canonicalKey,
            externalJobId: card.jobId,
            filterReason: filterDecision.reason,
            filterVersion: filterDecision.configVersion,
            ingestionRunId: context?.ingestionRunId,
            jobSourceId: jobSource.id,
            normalizedTitle,
            title: card.title,
          });
          continue;
        }
      }

      try {
        const detailUrl = new URL(`${origin}${card.href}`);
        const detailResponse = await this.fetchWithRetry(detailUrl);

        if (detailResponse.status === 403) {
          throw new IngestionFetchError({
            context: "talentbrew_job_detail",
            message: `TalentBrew job detail request returned 403 forbidden for ${card.jobId}`,
            statusCode: 403,
          });
        }

        if (!detailResponse.ok) {
          this.logger.warn(
            `Skipping TalentBrew detail due to HTTP ${detailResponse.status} for job ${card.jobId}`,
          );
          continue;
        }

        const detailHtml = await detailResponse.text();
        const jobPosting = this.extractJobPosting(detailHtml, detailUrl.toString());

        if (!jobPosting) {
          this.logger.warn(
            `Skipping TalentBrew detail missing JSON-LD JobPosting for job ${card.jobId}`,
          );
          continue;
        }

        observations.push(
          this.toObservation(origin, card, jobPosting, canonicalKey),
        );
      } catch (error) {
        if (error instanceof IngestionFetchError) throw error;
        this.logger.warn(
          `Skipping TalentBrew detail for ${card.jobId} due to error: ${error instanceof Error ? error.message : "unknown"}`,
        );
      }
    }

    return observations;
  }

  private extractJobPosting(
    html: string,
    sourceUrl: string,
  ): TalentBrewJobPostingLd | null {
    const match = html.match(
      /<script type="application\/ld\+json">([\s\S]*?)<\/script>/,
    );
    if (!match?.[1]) return null;

    try {
      return JSON.parse(match[1]) as TalentBrewJobPostingLd;
    } catch (error) {
      this.logger.warn(
        `Unable to parse TalentBrew JSON-LD at ${sourceUrl}: ${error instanceof Error ? error.message : "unknown"}`,
      );
      return null;
    }
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
        Accept: "text/html",
      },
      signal: AbortSignal.timeout(10_000),
    };

    const response = await fetch(url, requestInit);
    if (response.status !== 429) return response;

    await sleep(1_000);
    return fetch(url, requestInit);
  }

  private toListingObservation(
    origin: string,
    card: ListingCard,
    canonicalKey: string,
  ): NormalizedJobObservation {
    const now = new Date().toISOString();

    return {
      canonicalKey,
      country: "Brasil",
      descriptionClean: card.title,
      descriptionRaw: "",
      detailFetchSkipped: true,
      externalJobId: card.jobId,
      firstSeenAt: now,
      lastSeenAt: now,
      locationText: card.location || "Remote",
      normalizedTitle: normalizeAdapterTitle(card.title),
      publishedAtSource: now,
      sourceJobUrl: `${origin}${card.href}`,
      status: "active",
      title: card.title,
    };
  }

  private toObservation(
    origin: string,
    card: ListingCard,
    jobPosting: TalentBrewJobPostingLd,
    canonicalKey: string,
  ): NormalizedJobObservation {
    const title = jobPosting.title?.trim() || card.title;
    const address = jobPosting.jobLocation?.[0]?.address ?? undefined;
    const locationText = [
      address?.addressLocality,
      address?.addressRegion,
      address?.addressCountry,
    ]
      .map((value) => value?.trim())
      .filter((value): value is string => Boolean(value))
      .join(", ");

    const descriptionRaw = normalizeDescriptionHtml(jobPosting.description ?? "");
    const descriptionClean = stripHtml(descriptionRaw) || title;
    const workModel = inferWorkModel(locationText || card.location, title, descriptionClean);
    const publishedAt = normalizeDate(jobPosting.datePosted);
    const state =
      normalizeState(address?.addressRegion)?.sigla ??
      address?.addressRegion?.trim();

    return {
      canonicalKey,
      city: normalizeCity(address?.addressLocality) ?? undefined,
      // Sem fallback "Brasil" de propósito — ver isForeignLocation() em
      // ingestion.service.ts, que usa o vazio como sinal.
      country: address?.addressCountry?.trim(),
      department: jobPosting.industry?.trim() || undefined,
      descriptionClean,
      descriptionRaw,
      employmentType: normalizeVacancyType(jobPosting.employmentType),
      employmentTypeRaw: jobPosting.employmentType?.trim() || undefined,
      externalJobId: card.jobId,
      firstSeenAt: publishedAt,
      lastSeenAt: new Date().toISOString(),
      locationText: locationText || card.location || "Remote",
      normalizedTitle: normalizeAdapterTitle(title),
      publishedAtSource: publishedAt,
      sourceJobUrl: jobPosting.url?.trim() || `${origin}${card.href}`,
      state,
      status: "active",
      title,
      workModel,
    };
  }
}
