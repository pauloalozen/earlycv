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
import { stripHtml } from "./strip-html";
import { normalizeAdapterTitle } from "./title-normalization";

type LeverPosting = {
  categories?: {
    commitment?: string | null;
    department?: string | null;
    location?: string | null;
  } | null;
  country?: string | null;
  createdAt?: number | null;
  description?: string | null;
  descriptionPlain?: string | null;
  hostedUrl?: string | null;
  id: string;
  lists?: Array<{ content?: string | null; text?: string | null }> | null;
  text?: string | null;
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

// Lever tambem nao expoe city/state estruturados no payload publico — so
// "categories.location" como string livre (ex: "Sao Paulo, Brasil",
// "Remoto"). Mesmo parser por virgula usado no Greenhouse.
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

function inferWorkModel(
  location: string,
  title: string,
  description: string,
  workplaceType?: string | null,
) {
  if (workplaceType) {
    const normalized = workplaceType.toLowerCase();
    if (normalized === "remote") return "remote";
    if (normalized === "hybrid") return "hybrid";
    if (normalized === "on-site" || normalized === "onsite") return "onsite";
  }

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
  // "postings/{slug}" precisa vir antes do fallback "lever.co/{slug}" —
  // numa URL como api.lever.co/v0/postings/neon, uma alternancia sem essa
  // ordem casa "lever.co/v0" primeiro e extrai "v0" em vez do slug real.
  const match =
    sourceUrl.match(/postings\/([^/?]+)/) ??
    sourceUrl.match(/lever\.co\/([^/?]+)/);
  if (!match?.[1]) {
    throw new Error(
      `Invalid Lever sourceUrl: ${sourceUrl} (expected .../postings/{slug})`,
    );
  }
  return match[1];
}

function normalizeCreatedAt(value?: number | null) {
  if (!value) return new Date().toISOString();
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return new Date().toISOString();
  return date.toISOString();
}

@Injectable()
export class LeverAdapter implements IngestionSourceAdapter {
  readonly sourceType = "lever" as const;

  private readonly logger = new Logger(LeverAdapter.name);

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
    // A API do Lever, no formato mode=json, retorna um array simples — nao
    // ha envelope { data, next } nem offset funcional pra paginar (testado
    // manualmente: offset=<id da ultima vaga> nao avanca a pagina). Um
    // limit alto cobre o volume tipico de uma empresa numa unica chamada,
    // igual ao comportamento do Greenhouse (que tambem nao pagina).
    const url = new URL(`https://api.lever.co/v0/postings/${slug}`);
    url.searchParams.set("mode", "json");
    url.searchParams.set("limit", "1000");

    const response = await this.fetchWithRetry(url);

    if (response.status === 403) {
      throw new IngestionFetchError({
        context: "lever_postings_api",
        message: "Lever postings API request returned 403 forbidden",
        statusCode: 403,
      });
    }

    if (!response.ok) {
      throw new IngestionFetchError({
        context: "lever_postings_api",
        message: `Lever postings API request returned HTTP ${response.status}`,
        statusCode: response.status,
      });
    }

    const postings = (await response.json()) as LeverPosting[];
    const observations: NormalizedJobObservation[] = [];

    for (const posting of postings) {
      const canonicalKey = `lever:${slug}:${posting.id}`;

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
        const normalizedTitle = normalizeAdapterTitle(posting.text);
        const filterDecision = await this.semanticFilter.evaluate(normalizedTitle);

        if (filterDecision.result === "SKIP") {
          await this.saveDiscardedTitle({
            canonicalKey,
            externalJobId: posting.id,
            filterReason: filterDecision.reason,
            filterVersion: filterDecision.configVersion,
            ingestionRunId: context?.ingestionRunId,
            jobSourceId: jobSource.id,
            normalizedTitle,
            title: posting.text ?? `Lever posting ${posting.id}`,
          });
          continue;
        }
      }

      observations.push(this.toObservation(slug, posting, canonicalKey));
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
    posting: LeverPosting,
    canonicalKey: string,
  ): NormalizedJobObservation {
    const title = posting.text?.trim() || `Lever posting ${posting.id}`;
    const locationText = posting.categories?.location?.trim() ?? "";
    const { city, state, country } = parseLocation(locationText);

    const descriptionRaw = [
      posting.description ?? "",
      ...(posting.lists ?? []).map(
        (list) => `<h3>${list.text ?? ""}</h3>${list.content ?? ""}`,
      ),
    ]
      .filter(Boolean)
      .join("\n");

    const descriptionClean =
      [
        posting.descriptionPlain ?? "",
        ...(posting.lists ?? []).map(
          (list) => `${list.text ?? ""}\n${stripHtml(list.content ?? "")}`,
        ),
      ]
        .filter(Boolean)
        .join("\n\n")
        .trim() || title;

    const workModel = inferWorkModel(
      locationText,
      title,
      descriptionClean,
      posting.workplaceType,
    );
    const publishedAt = normalizeCreatedAt(posting.createdAt);

    return {
      canonicalKey,
      city,
      country: posting.country || country || "Brasil",
      department: posting.categories?.department?.trim() || undefined,
      descriptionClean,
      descriptionRaw,
      employmentType: posting.categories?.commitment?.trim() || undefined,
      externalJobId: posting.id,
      firstSeenAt: publishedAt,
      lastSeenAt: publishedAt,
      locationText: locationText || "Remote",
      normalizedTitle: normalizeAdapterTitle(title),
      publishedAtSource: publishedAt,
      sourceJobUrl:
        posting.hostedUrl ?? `https://jobs.lever.co/${slug}/${posting.id}`,
      state,
      status: "active",
      title,
      workModel,
    };
  }
}
