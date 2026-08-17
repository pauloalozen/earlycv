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
import { normalizeAdapterTitle } from "./title-normalization";
import { normalizeVacancyType } from "./vacancy-type";

// Pandape (branding "Trabalhe Conosco") nao tem API JSON publica — listagem
// e HTML server-rendered com paginacao por PageNumber/PageSize (a UI usa
// "carregar mais", mas o parametro funciona direto na URL sem JS), e o
// detalhe embute um <script type="application/ld+json"> com JobPosting
// limpo (sem o HTML-entity-escaping que a listagem tem). Mesmo padrao do
// TalentBrew, adaptado pro markup real do Pandape.
//
// {slug}.pandape.com.br sempre redireciona (301) pra
// {slug}.pandape.infojobs.com.br — fetch() segue o redirect sozinho, entao
// nao precisa resolver a origin final na mao, so usar a origin salva em
// jobSource.sourceUrl (qualquer um dos dois dominios funciona).
const MAX_LISTING_PAGES = 200;
const LISTING_PAGE_SIZE = 20;

type PandapeJobPostingLd = {
  datePosted?: string | null;
  description?: string | null;
  employmentType?: string | null;
  jobLocation?: {
    address?: {
      addressCountry?: string | null;
      addressLocality?: string | null;
      addressRegion?: string | null;
    } | null;
  } | null;
  title?: string | null;
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

// So a listagem precisa disso — o JSON-LD do detalhe ja vem em UTF-8 puro
// (a tag <script> nao passa pelo HTML-entity-escaping do resto da pagina).
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
  // Nao-guloso ate o primeiro </a> — os cards nao tem link aninhado, entao
  // fecha exatamente no </a> do proprio card (mesma tecnica do TalentBrew).
  const cardRegex =
    /<a target="_blank" class="card card-vacancy mb-20" href="(\/Detail\/(\d+))">([\s\S]*?)<\/a>/g;

  let match: RegExpExecArray | null = cardRegex.exec(html);
  while (match) {
    const [, href, jobId, inner] = match;
    const titleMatch = inner?.match(
      /<h3 class="link font-xl mb-0 fw-600"[^>]*title="([^"]*)"/,
    );
    const locationMatch = inner?.match(
      /icon-location-pin-1"><\/i>\s*<\/div>\s*([^<]+?)\s*<\/div>/,
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

function parseCityState(location: string) {
  const [cityRaw, stateRaw] = location.split(" - ").map((part) => part.trim());
  return { city: cityRaw, state: stateRaw };
}

function inferWorkModel(location: string, title: string, description: string) {
  const text = `${location} ${title} ${description.slice(0, 500)}`.toLowerCase();

  if (text.includes("remoto") || text.includes("home office")) return "remote";
  if (text.includes("hibrido") || text.includes("híbrido")) return "hybrid";
  if (text.includes("presencial")) return "onsite";

  return undefined;
}

function getOrigin(sourceUrl: string) {
  try {
    return new URL(sourceUrl).origin;
  } catch {
    throw new Error(`Invalid Pandape sourceUrl: ${sourceUrl}`);
  }
}

function normalizeDate(value?: string | null) {
  if (!value) return new Date().toISOString();
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return new Date().toISOString();
  return date.toISOString();
}

@Injectable()
export class PandapeAdapter implements IngestionSourceAdapter {
  readonly sourceType = "pandape" as const;

  private readonly logger = new Logger(PandapeAdapter.name);

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
    const slug = new URL(origin).hostname.split(".")[0];
    const allCards: ListingCard[] = [];

    for (let page = 1; page <= MAX_LISTING_PAGES; page += 1) {
      const url = new URL(`${origin}/Vacancies`);
      url.searchParams.set("PageNumber", String(page));
      url.searchParams.set("PageSize", String(LISTING_PAGE_SIZE));

      const response = await this.fetchWithRetry(url);

      if (response.status === 403) {
        throw new IngestionFetchError({
          context: "pandape_listing",
          message: "Pandape listing request returned 403 forbidden",
          statusCode: 403,
        });
      }

      if (!response.ok) {
        throw new IngestionFetchError({
          context: "pandape_listing",
          message: `Pandape listing request returned HTTP ${response.status}`,
          statusCode: response.status,
        });
      }

      const html = await response.text();
      const cards = parseListingCards(html);
      if (cards.length === 0) break;

      allCards.push(...cards);
      if (cards.length < LISTING_PAGE_SIZE) break;
      await sleep(300);
    }

    const observations: NormalizedJobObservation[] = [];
    const now = new Date();

    for (const card of allCards) {
      const canonicalKey = `pandape:${slug}:${card.jobId}`;
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
            context: "pandape_job_detail",
            message: `Pandape job detail request returned 403 forbidden for ${card.jobId}`,
            statusCode: 403,
          });
        }

        if (!detailResponse.ok) {
          this.logger.warn(
            `Skipping Pandape detail due to HTTP ${detailResponse.status} for job ${card.jobId}`,
          );
          continue;
        }

        const detailHtml = await detailResponse.text();
        const jobPosting = this.extractJobPosting(detailHtml, detailUrl.toString());

        if (!jobPosting) {
          this.logger.warn(
            `Skipping Pandape detail missing JSON-LD JobPosting for job ${card.jobId}`,
          );
          continue;
        }

        observations.push(this.toObservation(origin, card, jobPosting, canonicalKey));
      } catch (error) {
        if (error instanceof IngestionFetchError) throw error;
        this.logger.warn(
          `Skipping Pandape detail for ${card.jobId} due to error: ${error instanceof Error ? error.message : "unknown"}`,
        );
      }
    }

    return observations;
  }

  private extractJobPosting(
    html: string,
    sourceUrl: string,
  ): PandapeJobPostingLd | null {
    const match = html.match(
      /<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/,
    );
    if (!match?.[1]) return null;

    try {
      return JSON.parse(match[1]) as PandapeJobPostingLd;
    } catch (error) {
      this.logger.warn(
        `Unable to parse Pandape JSON-LD at ${sourceUrl}: ${error instanceof Error ? error.message : "unknown"}`,
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
    const { city, state } = parseCityState(card.location);

    return {
      canonicalKey,
      city: normalizeCity(city) ?? undefined,
      country: "Brasil",
      descriptionClean: card.title,
      descriptionRaw: "",
      detailFetchSkipped: true,
      externalJobId: card.jobId,
      firstSeenAt: now,
      lastSeenAt: now,
      locationText: card.location || "Remoto",
      normalizedTitle: normalizeAdapterTitle(card.title),
      publishedAtSource: now,
      sourceJobUrl: `${origin}${card.href}`,
      state: normalizeState(state)?.sigla ?? state,
      status: "active",
      title: card.title,
    };
  }

  private toObservation(
    origin: string,
    card: ListingCard,
    jobPosting: PandapeJobPostingLd,
    canonicalKey: string,
  ): NormalizedJobObservation {
    const title = jobPosting.title?.trim() || card.title;
    const address = jobPosting.jobLocation?.address ?? undefined;
    const { city: cardCity, state: cardState } = parseCityState(card.location);
    const locationText = [
      address?.addressLocality ?? cardCity,
      address?.addressRegion ?? cardState,
    ]
      .map((value) => value?.trim())
      .filter((value): value is string => Boolean(value))
      .join(", ");

    const descriptionRaw = jobPosting.description ?? "";
    const descriptionClean = descriptionRaw || title;
    const workModel = inferWorkModel(locationText || card.location, title, descriptionClean);
    const publishedAt = normalizeDate(jobPosting.datePosted);
    const state =
      normalizeState(address?.addressRegion ?? cardState)?.sigla ??
      address?.addressRegion?.trim() ??
      cardState;

    return {
      canonicalKey,
      city: normalizeCity(address?.addressLocality ?? cardCity) ?? undefined,
      country: address?.addressCountry?.trim() || "Brasil",
      descriptionClean,
      descriptionRaw,
      employmentType: normalizeVacancyType(jobPosting.employmentType),
      employmentTypeRaw: jobPosting.employmentType?.trim() || undefined,
      externalJobId: card.jobId,
      firstSeenAt: publishedAt,
      lastSeenAt: new Date().toISOString(),
      locationText: locationText || card.location || "Remoto",
      normalizedTitle: normalizeAdapterTitle(title),
      publishedAtSource: publishedAt,
      sourceJobUrl: `${origin}${card.href}`,
      state,
      status: "active",
      title,
      workModel,
    };
  }
}
