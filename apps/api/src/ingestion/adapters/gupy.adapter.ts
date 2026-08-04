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

type GupyApiJob = {
  addressCity?: string | null;
  addressCountry?: string | null;
  addressState?: string | null;
  departmentName?: string | null;
  description?: string | null;
  id: number | string;
  name?: string | null;
  prerequisites?: string | null;
  publishedAt?: string | null;
  remoteWorking?: boolean | null;
  responsibilities?: string | null;
  roleName?: string | null;
  type?: string | null;
  workplaceType?: string | null;
};

type GupyApiResponse = {
  results?: GupyApiJob[];
  total?: number;
};

type GupyBoardJob = {
  department?: string | null;
  id: number | string;
  title?: string | null;
  type?: string | null;
  workplace?: {
    address?: {
      city?: string | null;
      country?: string | null;
      state?: string | null;
      stateShortName?: string | null;
    };
    workplaceType?: string | null;
  };
};

type GupyDetailPayload = {
  props?: {
    pageProps?: {
      job?: {
        addressCity?: string | null;
        addressCountry?: string | null;
        addressStateShortName?: string | null;
        description?: string | null;
        id?: number | string;
        jobType?: string | null;
        name?: string | null;
        prerequisites?: string | null;
        publishedAt?: string | null;
        responsibilities?: string | null;
        workplaceType?: string | null;
      };
      jobs?: GupyBoardJob[];
    };
  };
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function stripHtml(value: string) {
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeWorkModel(
  value?: string | null,
  remoteWorking?: boolean | null,
) {
  if (remoteWorking) return "remote";
  if (value === "hybrid") return "hybrid";
  if (value === "on-site") return "onsite";
  if (value === "remote") return "remote";
  return undefined;
}

const EMPLOYMENT_TYPE_MAP: Record<string, string> = {
  vacancy_type_effective: "full_time",
  vacancy_type_internship: "internship",
  vacancy_type_apprentice: "apprentice",
  vacancy_type_temporary: "temporary",
  vacancy_type_talent_pool: "talent_pool",
  vacancy_legal_entity: "pj",
  vacancy_type_autonomous: "autonomous",
  full_time: "full_time",
};

function normalizeEmploymentType(value?: string | null) {
  const raw = value?.trim();
  if (!raw) return undefined;
  return EMPLOYMENT_TYPE_MAP[raw] ?? raw;
}

function normalizeTitle(value?: string | null) {
  return (value ?? "")
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .toLowerCase();
}

function getSubdomainFromSourceUrl(sourceUrl: string) {
  const parsed = new URL(sourceUrl);
  const match = parsed.hostname.toLowerCase().match(/^([a-z0-9-]+)\.gupy\.io$/);
  if (!match?.[1])
    throw new Error("gupy sourceUrl must point to {subdomain}.gupy.io");
  return match[1];
}

function normalizeDate(value?: string | null) {
  if (!value) return new Date().toISOString();
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return new Date().toISOString();
  return date.toISOString();
}

function wrapSection(title: string, html?: string | null) {
  const content = html?.trim();
  if (!content) {
    return null;
  }

  return `<section><h2>${title}</h2>${content}</section>`;
}

@Injectable()
export class GupyAdapter implements IngestionSourceAdapter {
  readonly sourceType = "gupy" as const;

  private readonly logger = new Logger(GupyAdapter.name);
  private readonly limit = 10;

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
    const subdomain = getSubdomainFromSourceUrl(jobSource.sourceUrl);
    const baseUrl = `https://${subdomain}.gupy.io/api/v1/jobs`;
    const observations: NormalizedJobObservation[] = [];

    let offset = 0;
    let total = Number.POSITIVE_INFINITY;

    while (offset < total) {
      const page = await this.fetchPage(baseUrl, offset);
      if (!page) {
        if (offset === 0) {
          return this.collectFromBoardHtml(subdomain, jobSource.id, context);
        }
        break;
      }

      const jobs = page.results ?? [];
      total = page.total ?? jobs.length;

      for (const job of jobs) {
        observations.push(this.toObservation(subdomain, job));
      }

      offset += jobs.length;
      if (jobs.length === 0) break;
      if (offset < total) await sleep(500);
    }

    return observations;
  }

  private async fetchPage(baseUrl: string, offset: number) {
    const url = new URL(baseUrl);
    url.searchParams.set("status", "published");
    url.searchParams.set("publicationType", "external");
    url.searchParams.set("fields", "all");
    url.searchParams.set("limit", String(this.limit));
    url.searchParams.set("offset", String(offset));

    const response = await this.fetchWithRetry(url);

    if (response.status === 403) {
      throw new IngestionFetchError({
        context: "gupy_board_api",
        message: "Gupy board API request returned 403 forbidden",
        statusCode: 403,
      });
    }

    if (!response.ok) {
      this.logger.warn(
        `Skipping Gupy page due to HTTP ${response.status} at offset ${offset}`,
      );
      return null;
    }

    return (await response.json()) as GupyApiResponse;
  }

  private async collectFromBoardHtml(
    subdomain: string,
    jobSourceId: string,
    context?: IngestionCollectContext,
  ) {
    const boardUrl = `https://${subdomain}.gupy.io/jobs`;
    const boardResponse = await this.fetchWithRetry(new URL(boardUrl));

    if (!boardResponse.ok) {
      if (boardResponse.status === 403) {
        throw new IngestionFetchError({
          context: "gupy_board_html",
          message: "Gupy board HTML request returned 403 forbidden",
          statusCode: 403,
        });
      }
      throw new Error(`gupy board is unavailable at ${boardUrl}`);
    }

    const boardHtml = await boardResponse.text();
    const boardData = this.extractNextData<GupyDetailPayload>(
      boardHtml,
      boardUrl,
    );
    const boardJobs = boardData.props?.pageProps?.jobs ?? [];
    const observations: NormalizedJobObservation[] = [];

    for (const boardJob of boardJobs) {
      try {
        const canonicalKey = `gupy:${subdomain}:${String(boardJob.id)}`;
        const now = new Date();
        let existing: { lastSeenAt: Date | null } | null = null;

        if (context) {
          try {
            existing = await context.getExistingJobByCanonicalKey(canonicalKey);
            if (shouldSkipDetailFetch(existing?.lastSeenAt, now)) {
              observations.push(
                this.toObservation(
                  subdomain,
                  {
                    addressCity: boardJob.workplace?.address?.city ?? undefined,
                    addressCountry:
                      boardJob.workplace?.address?.country ?? undefined,
                    addressState:
                      boardJob.workplace?.address?.stateShortName ??
                      boardJob.workplace?.address?.state ??
                      undefined,
                    departmentName: boardJob.department ?? undefined,
                    id: boardJob.id,
                    name: boardJob.title ?? undefined,
                    type: boardJob.type ?? undefined,
                    workplaceType:
                      boardJob.workplace?.workplaceType ?? undefined,
                  },
                  { detailFetchSkipped: true },
                ),
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
          const normalizedTitle = normalizeTitle(boardJob.title);
          const filterDecision =
            await this.semanticFilter.evaluate(normalizedTitle);

          if (filterDecision.result === "SKIP") {
            await this.saveDiscardedTitle({
              canonicalKey,
              externalJobId: String(boardJob.id),
              filterReason: filterDecision.reason,
              filterVersion: filterDecision.configVersion,
              ingestionRunId: context?.ingestionRunId,
              jobSourceId,
              normalizedTitle,
              title: boardJob.title ?? `Gupy job ${String(boardJob.id)}`,
            });
            continue;
          }
        }

        const detailUrl = `https://${subdomain}.gupy.io/jobs/${String(boardJob.id)}?jobBoardSource=gupy_public_page`;
        const detailResponse = await this.fetchWithRetry(new URL(detailUrl));

        if (!detailResponse.ok) {
          if (detailResponse.status === 403) {
            throw new IngestionFetchError({
              context: "gupy_job_detail",
              message: `Gupy job detail request returned 403 forbidden for ${String(boardJob.id)}`,
              statusCode: 403,
            });
          }
          this.logger.warn(
            `Skipping Gupy detail due to HTTP ${detailResponse.status} for job ${String(boardJob.id)}`,
          );
          continue;
        }

        const detailHtml = await detailResponse.text();
        const detailData = this.extractNextData<GupyDetailPayload>(
          detailHtml,
          detailUrl,
        );
        const detailJob = detailData.props?.pageProps?.job;

        if (!detailJob) {
          this.logger.warn(
            `Skipping Gupy detail missing job payload for ${String(boardJob.id)}`,
          );
          continue;
        }

        observations.push(
          this.toObservation(subdomain, {
            addressCity:
              detailJob.addressCity ??
              boardJob.workplace?.address?.city ??
              undefined,
            addressCountry:
              detailJob.addressCountry ??
              boardJob.workplace?.address?.country ??
              undefined,
            addressState:
              detailJob.addressStateShortName ??
              boardJob.workplace?.address?.stateShortName ??
              boardJob.workplace?.address?.state ??
              undefined,
            departmentName: boardJob.department ?? undefined,
            description: detailJob.description ?? undefined,
            id: detailJob.id ?? boardJob.id,
            name: detailJob.name ?? boardJob.title ?? undefined,
            prerequisites: detailJob.prerequisites ?? undefined,
            publishedAt: detailJob.publishedAt ?? undefined,
            responsibilities: detailJob.responsibilities ?? undefined,
            type: detailJob.jobType ?? boardJob.type ?? undefined,
            workplaceType:
              detailJob.workplaceType ??
              boardJob.workplace?.workplaceType ??
              undefined,
          }),
        );
      } catch (error) {
        this.logger.warn(
          `Skipping Gupy detail for ${String(boardJob.id)} due to error: ${error instanceof Error ? error.message : "unknown"}`,
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

  private async fetchWithRetry(url: URL) {
    const requestInit: RequestInit = {
      headers: {
        "User-Agent": "EarlyCV-Crawler/1.0",
      },
      signal: AbortSignal.timeout(10_000),
    };

    const response = await fetch(url, requestInit);
    if (response.status !== 429) return response;

    await sleep(1_000);
    return fetch(url, requestInit);
  }

  private extractNextData<T>(html: string, sourceUrl: string): T {
    // Atributos do <script id="__NEXT_DATA__"> variam (a Gupy passou a
    // adicionar nonce de CSP em ago/2026, quebrando um match exato em
    // type="application/json">); [^>]* tolera qualquer atributo extra,
    // em qualquer ordem, entre a abertura da tag e o >.
    const match = html.match(
      /<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/,
    );

    if (!match?.[1]) {
      const snippet = html.slice(0, 200).replace(/\s+/g, " ").trim();
      throw new Error(
        `Unable to find Gupy __NEXT_DATA__ script tag at ${sourceUrl} (html length ${html.length}, starts with: "${snippet}")`,
      );
    }

    try {
      return JSON.parse(match[1]) as T;
    } catch (error) {
      throw new Error(
        `Unable to parse Gupy __NEXT_DATA__ JSON at ${sourceUrl}: ${error instanceof Error ? error.message : "unknown error"}`,
      );
    }
  }

  private toObservation(
    subdomain: string,
    job: GupyApiJob,
    options?: { detailFetchSkipped?: boolean },
  ): NormalizedJobObservation {
    const publishedAt = normalizeDate(job.publishedAt);
    const locationParts = [
      job.addressCity,
      job.addressState,
      job.addressCountry,
    ]
      .map((value) => value?.trim())
      .filter((value): value is string => Boolean(value));

    const descriptionRaw = [
      wrapSection("Descricao da vaga", job.description),
      wrapSection("Responsabilidades e atribuicoes", job.responsibilities),
      wrapSection("Requisitos", job.prerequisites),
    ]
      .filter((value): value is string => Boolean(value))
      .join("\n");
    const descriptionClean = stripHtml(descriptionRaw);
    const title = job.name?.trim() || `Gupy job ${String(job.id)}`;

    return {
      canonicalKey: `gupy:${subdomain}:${String(job.id)}`,
      city: job.addressCity?.trim() || undefined,
      country: job.addressCountry?.trim() || undefined,
      department: job.departmentName?.trim() || undefined,
      descriptionClean,
      descriptionRaw,
      detailFetchSkipped: options?.detailFetchSkipped,
      employmentType: normalizeEmploymentType(job.type),
      employmentTypeRaw: job.type?.trim() || undefined,
      externalJobId: String(job.id),
      firstSeenAt: publishedAt,
      lastSeenAt: publishedAt,
      locationText: locationParts.join(", ") || "Remote",
      normalizedTitle: normalizeTitle(title),
      publishedAtSource: publishedAt,
      seniorityLevel: undefined,
      sourceJobUrl: `https://${subdomain}.gupy.io/jobs/${String(job.id)}?jobBoardSource=gupy_public_page`,
      state: job.addressState?.trim() || undefined,
      status: "active",
      title,
      workModel: normalizeWorkModel(job.workplaceType, job.remoteWorking),
    };
  }
}
