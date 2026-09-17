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

// Eightfold aparece em dois formatos bem diferentes no nosso cadastro:
//
// - "proxy" (ex: Mercado Livre, careers-meli.mercadolibre.com): a empresa
//   hospeda seu proprio front (Next.js) que faz proxy pro Eightfold por
//   baixo, mas expoe uma API JSON propria sem autenticacao —
//   GET {origin}/api/positions e GET {origin}/api/position-detail?id=.
// - "direto" (ex: vale.eightfold.ai): dominio *.eightfold.ai puro, exige
//   visitar /careers pra pegar cookie de sessao + token CSRF antes de
//   chamar POST-like GET {origin}/api/apply/v2/jobs?domain=...
//
// Testado ao vivo em 2026-09: Vale (vale.eightfold.ai) funciona no modo
// direto. Eaton (eaton.eightfold.ai) responde 403 "Not authorized for
// PCSX" nesse mesmo fluxo — e bloqueio de bot (PerimeterX) especifico
// daquele tenant, nao um erro de implementacao. Deixamos o adapter tratar
// esse 403 como IngestionFetchError normal (igual todo outro adapter) pra
// o circuit breaker de 403 do ingestion.service.ts cuidar de pausar a
// fonte sozinho, caso isso aconteca de novo com outro tenant.

const PAGE_LIMIT = 50;

// Diferente dos outros adapters (que usam "EarlyCV-Crawler/1.0"), a WAF do
// Mercado Livre (Cloudflare) bloqueia com 403 qualquer User-Agent contendo
// a palavra "Crawler" — testado ao vivo, confirmado reproduzivel. Um UA
// generico de navegador passa sem problema, entao usamos um aqui em vez do
// padrao dos outros adapters.
const EIGHTFOLD_USER_AGENT = "Mozilla/5.0 (compatible; EarlyCVBot/1.0)";
const MAX_LISTING_PAGES = 50;

type EightfoldProxyPosition = {
  id: number | string;
  name?: string | null;
  department?: string | null;
  locations?: string[] | null;
  postedTs?: number | null;
  positionUrl?: string | null;
};

type EightfoldProxyListResponse = {
  positions?: EightfoldProxyPosition[];
  count?: number;
  hasMore?: boolean;
};

type EightfoldProxyDetailResponse = {
  error?: boolean;
  title?: string | null;
  description?: string | null;
};

type EightfoldDirectPosition = {
  id: number | string;
  name?: string | null;
  department?: string | null;
  location?: string | null;
  locations?: string[] | null;
  t_create?: number | null;
  t_update?: number | null;
  job_description?: string | null;
};

type EightfoldDirectListResponse = {
  positions?: EightfoldDirectPosition[];
  count?: number;
};

type ParsedLocation = {
  city?: string;
  country?: string;
  state?: string;
};

// Regioes macro que a ML devolve em vez de cidade/UF — nao ha como
// derivar estado real disso, so mantemos o texto legivel pro locationText.
const REGION_LABELS: Record<string, string> = {
  norte: "Regiao Norte",
  nordeste: "Regiao Nordeste",
  "centro oeste": "Regiao Centro-Oeste",
  "centro-oeste": "Regiao Centro-Oeste",
  sudeste: "Regiao Sudeste",
  sul: "Regiao Sul",
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isDirectEightfoldHost(hostname: string) {
  return hostname.toLowerCase().endsWith(".eightfold.ai");
}

// Parser generico "Cidade, Estado, Pais" usado pelo modo direto (mesma
// forma livre que Greenhouse/Workday recebem) — ver parseLocation nesses
// adapters.
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
  if (parts.length === 1) {
    return { country: parts[0] };
  }

  return {};
}

function pickDirectLocationText(
  locations?: string[] | null,
  location?: string | null,
) {
  const candidates = (locations ?? []).filter(Boolean);
  // O array "locations" costuma ter "Brazil" (pais) e a entrada detalhada
  // ("Cidade, Estado, Brasil") juntas — prefere a mais especifica (com
  // virgula) quando existir.
  const detailed = candidates.find((entry) => entry.includes(","));
  return detailed?.trim() || candidates[0]?.trim() || location?.trim() || "";
}

function pickProxyRegionLabel(locations?: string[] | null) {
  const region = (locations ?? [])
    .map((entry) => entry.split(",")[0]?.trim().toLowerCase())
    .find((entry) => entry && REGION_LABELS[entry]);

  return region ? REGION_LABELS[region] : undefined;
}

function inferWorkModel(location: string, title: string, description: string) {
  const text =
    `${location} ${title} ${description.slice(0, 500)}`.toLowerCase();

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
  if (
    text.includes("presencial") ||
    text.includes("on-site") ||
    text.includes("onsite")
  ) {
    return "onsite";
  }

  return undefined;
}

function normalizeTs(value?: number | null) {
  if (!value) return new Date().toISOString();
  const date = new Date(value * 1000);
  if (Number.isNaN(date.getTime())) return new Date().toISOString();
  return date.toISOString();
}

@Injectable()
export class EightfoldAdapter implements IngestionSourceAdapter {
  readonly sourceType = "eightfold" as const;

  private readonly logger = new Logger(EightfoldAdapter.name);

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
    const origin = new URL(jobSource.sourceUrl).origin;
    const hostname = new URL(jobSource.sourceUrl).hostname;
    const tenantSlug = hostname.toLowerCase().replace(/\./g, "-");

    if (isDirectEightfoldHost(hostname)) {
      return this.collectDirect(origin, tenantSlug, jobSource, context);
    }

    return this.collectProxy(origin, tenantSlug, jobSource, context);
  }

  // ---- Modo "proxy" (dominio proprio da empresa, ex: Mercado Livre) ----

  private async collectProxy(
    origin: string,
    tenantSlug: string,
    jobSource: JobSourceContext,
    context?: IngestionCollectContext,
  ): Promise<NormalizedJobObservation[]> {
    const allPositions: EightfoldProxyPosition[] = [];
    let start = 0;

    for (let page = 0; page < MAX_LISTING_PAGES; page += 1) {
      const url = new URL(`${origin}/api/positions`);
      url.searchParams.set("lang", "pt");
      url.searchParams.set("location", "Brazil");
      url.searchParams.set("start", String(start));
      url.searchParams.set("limit", String(PAGE_LIMIT));

      const response = await this.fetchWithRetry(url);

      if (response.status === 403) {
        throw new IngestionFetchError({
          context: "eightfold_proxy_positions",
          message:
            "Eightfold proxy positions API request returned 403 forbidden",
          statusCode: 403,
        });
      }
      if (!response.ok) {
        throw new IngestionFetchError({
          context: "eightfold_proxy_positions",
          message: `Eightfold proxy positions API request returned HTTP ${response.status}`,
          statusCode: response.status,
        });
      }

      const data = (await response.json()) as EightfoldProxyListResponse;
      const positions = data.positions ?? [];
      allPositions.push(...positions);

      if (positions.length === 0 || !data.hasMore) break;
      start += positions.length;
      await sleep(200);
    }

    const observations: NormalizedJobObservation[] = [];
    const now = new Date();

    for (const position of allPositions) {
      const externalJobId = String(position.id);
      const canonicalKey = `eightfold:${tenantSlug}:${externalJobId}`;
      const title = position.name?.trim() || `Eightfold job ${externalJobId}`;

      let existing: { lastSeenAt: Date | null } | null = null;
      if (context) {
        try {
          existing = await context.getExistingJobByCanonicalKey(canonicalKey);
        } catch (error) {
          this.logger.warn(
            `Failed dedup lookup for ${canonicalKey}: ${error instanceof Error ? error.message : "unknown"}`,
          );
        }
      }

      if (!existing) {
        const normalizedTitle = normalizeAdapterTitle(title);
        const filterDecision =
          await this.semanticFilter.evaluate(normalizedTitle);

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
            title,
          });
          continue;
        }
      }

      try {
        const detailUrl = new URL(`${origin}/api/position-detail`);
        detailUrl.searchParams.set("id", externalJobId);
        const detailResponse = await this.fetchWithRetry(detailUrl);

        if (detailResponse.status === 403) {
          throw new IngestionFetchError({
            context: "eightfold_proxy_position_detail",
            message: `Eightfold proxy position-detail request returned 403 forbidden for ${externalJobId}`,
            statusCode: 403,
          });
        }
        if (!detailResponse.ok) {
          this.logger.warn(
            `Skipping Eightfold proxy detail due to HTTP ${detailResponse.status} for job ${externalJobId}`,
          );
          continue;
        }

        const detail =
          (await detailResponse.json()) as EightfoldProxyDetailResponse;
        if (detail.error) {
          this.logger.warn(
            `Skipping Eightfold proxy detail with error flag for job ${externalJobId}`,
          );
          continue;
        }

        observations.push(
          this.toProxyObservation(
            origin,
            position,
            detail,
            externalJobId,
            canonicalKey,
            now,
          ),
        );
      } catch (error) {
        if (error instanceof IngestionFetchError) throw error;
        this.logger.warn(
          `Skipping Eightfold proxy detail for ${externalJobId} due to error: ${error instanceof Error ? error.message : "unknown"}`,
        );
      }
    }

    return observations;
  }

  private toProxyObservation(
    origin: string,
    position: EightfoldProxyPosition,
    detail: EightfoldProxyDetailResponse,
    externalJobId: string,
    canonicalKey: string,
    now: Date,
  ): NormalizedJobObservation {
    const title =
      detail.title?.trim() ||
      position.name?.trim() ||
      `Eightfold job ${externalJobId}`;
    const regionLabel = pickProxyRegionLabel(position.locations);
    const locationText = regionLabel ? `${regionLabel}, Brasil` : "Brasil";

    const descriptionRaw = normalizeDescriptionHtml(detail.description ?? "");
    const descriptionClean = stripHtml(descriptionRaw) || title;
    const workModel = inferWorkModel(locationText, title, descriptionClean);
    const publishedAt = normalizeTs(position.postedTs);

    return {
      canonicalKey,
      // Sem city/state de proposito: a ML so expoe regiao macro
      // ("Sudeste,Brazil"), nao ha dado suficiente pra normalizar UF real.
      country: "Brasil",
      department: position.department?.trim() || undefined,
      descriptionClean,
      descriptionRaw,
      externalJobId,
      firstSeenAt: publishedAt,
      lastSeenAt: now.toISOString(),
      locationText,
      normalizedTitle: normalizeAdapterTitle(title),
      publishedAtSource: publishedAt,
      sourceJobUrl: `${origin}${position.positionUrl ?? `/careers/job/${externalJobId}`}`,
      status: "active",
      title,
      workModel,
    };
  }

  // ---- Modo "direto" (*.eightfold.ai, ex: Vale) ----

  private async collectDirect(
    origin: string,
    tenantSlug: string,
    jobSource: JobSourceContext,
    context?: IngestionCollectContext,
  ): Promise<NormalizedJobObservation[]> {
    const { cookie, csrfToken, domain } =
      await this.bootstrapDirectSession(origin);

    const allPositions: EightfoldDirectPosition[] = [];
    let start = 0;

    for (let page = 0; page < MAX_LISTING_PAGES; page += 1) {
      const url = new URL(`${origin}/api/apply/v2/jobs`);
      url.searchParams.set("domain", domain);
      url.searchParams.set("start", String(start));
      url.searchParams.set("num", String(PAGE_LIMIT));
      url.searchParams.set("location", "Brazil");

      const response = await this.fetchWithRetry(url, {
        Cookie: cookie,
        Referer: `${origin}/careers`,
        "x-csrf-token": csrfToken,
      });

      if (response.status === 403) {
        // Cobre tanto 403 generico quanto o bloqueio de bot conhecido
        // ("Not authorized for PCSX", visto no tenant Eaton) — os dois
        // viram o mesmo erro tipado pro circuit breaker tratar igual.
        throw new IngestionFetchError({
          context: "eightfold_direct_jobs_api",
          message: "Eightfold direct jobs API request returned 403 forbidden",
          statusCode: 403,
        });
      }
      if (!response.ok) {
        throw new IngestionFetchError({
          context: "eightfold_direct_jobs_api",
          message: `Eightfold direct jobs API request returned HTTP ${response.status}`,
          statusCode: response.status,
        });
      }

      const data = (await response.json()) as EightfoldDirectListResponse;
      const positions = data.positions ?? [];
      allPositions.push(...positions);

      if (positions.length < PAGE_LIMIT) break;
      start += positions.length;
      await sleep(200);
    }

    const observations: NormalizedJobObservation[] = [];
    const now = new Date();

    for (const position of allPositions) {
      const externalJobId = String(position.id);
      const canonicalKey = `eightfold:${tenantSlug}:${externalJobId}`;
      const title = position.name?.trim() || `Eightfold job ${externalJobId}`;

      let existing: { lastSeenAt: Date | null } | null = null;
      if (context) {
        try {
          existing = await context.getExistingJobByCanonicalKey(canonicalKey);
        } catch (error) {
          this.logger.warn(
            `Failed dedup lookup for ${canonicalKey}: ${error instanceof Error ? error.message : "unknown"}`,
          );
        }
      }

      if (!existing) {
        const normalizedTitle = normalizeAdapterTitle(title);
        const filterDecision =
          await this.semanticFilter.evaluate(normalizedTitle);

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
            title,
          });
          continue;
        }
      }

      observations.push(
        this.toDirectObservation(
          origin,
          position,
          externalJobId,
          canonicalKey,
          now,
        ),
      );
    }

    return observations;
  }

  // Visita /careers pra capturar cookie de sessao + CSRF token (meta
  // "_csrf") e o "domain" (window._EF_GROUP_ID) que a API exige — sem
  // isso a API direta do Eightfold responde 403. Testado ao vivo contra
  // vale.eightfold.ai.
  private async bootstrapDirectSession(
    origin: string,
  ): Promise<{ cookie: string; csrfToken: string; domain: string }> {
    const response = await fetch(`${origin}/careers`, {
      headers: { "User-Agent": EIGHTFOLD_USER_AGENT },
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      throw new IngestionFetchError({
        context: "eightfold_direct_bootstrap",
        message: `Eightfold /careers bootstrap request returned HTTP ${response.status}`,
        statusCode: response.status,
      });
    }

    const html = await response.text();
    const setCookieHeaders =
      typeof (response.headers as { getSetCookie?: () => string[] })
        .getSetCookie === "function"
        ? (
            response.headers as unknown as { getSetCookie: () => string[] }
          ).getSetCookie()
        : [];
    const cookie = setCookieHeaders
      .map((entry) => entry.split(";")[0])
      .filter(Boolean)
      .join("; ");

    const csrfMatch = html.match(/name="_csrf"\s+content="([^"]+)"/);
    const domainMatch = html.match(/_EF_GROUP_ID\s*=\s*"([^"]+)"/);

    if (!csrfMatch?.[1] || !cookie) {
      throw new IngestionFetchError({
        context: "eightfold_direct_bootstrap",
        message:
          "Eightfold /careers bootstrap did not return a usable session (missing cookie or CSRF token)",
        statusCode: 403,
      });
    }

    return {
      cookie,
      csrfToken: csrfMatch[1],
      domain: domainMatch?.[1] ?? new URL(origin).hostname,
    };
  }

  private toDirectObservation(
    origin: string,
    position: EightfoldDirectPosition,
    externalJobId: string,
    canonicalKey: string,
    now: Date,
  ): NormalizedJobObservation {
    const title = position.name?.trim() || `Eightfold job ${externalJobId}`;
    const locationText = pickDirectLocationText(
      position.locations,
      position.location,
    );
    const parsedLocation = parseLocation(locationText);
    const city = normalizeCity(parsedLocation.city) ?? undefined;
    const state =
      normalizeState(parsedLocation.state)?.sigla ?? parsedLocation.state;
    const country = parsedLocation.country;

    const descriptionRaw = normalizeDescriptionHtml(
      position.job_description ?? "",
    );
    const descriptionClean = stripHtml(descriptionRaw) || title;
    const workModel = inferWorkModel(locationText, title, descriptionClean);
    const publishedAt = normalizeTs(position.t_create ?? position.t_update);

    return {
      canonicalKey,
      city,
      // Sem fallback "Brasil" de proposito — ver isForeignLocation() em
      // ingestion.service.ts, que usa o vazio como sinal.
      country,
      department: position.department?.trim() || undefined,
      descriptionClean,
      descriptionRaw,
      externalJobId,
      firstSeenAt: publishedAt,
      lastSeenAt: now.toISOString(),
      locationText: locationText || "Remote",
      normalizedTitle: normalizeAdapterTitle(title),
      publishedAtSource: publishedAt,
      sourceJobUrl: `${origin}/careers/job/${externalJobId}`,
      state,
      status: "active",
      title,
      workModel,
    };
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

  private async fetchWithRetry(
    url: URL,
    extraHeaders?: Record<string, string>,
  ) {
    const requestInit: RequestInit = {
      headers: {
        "User-Agent": EIGHTFOLD_USER_AGENT,
        Accept: "application/json",
        ...extraHeaders,
      },
      signal: AbortSignal.timeout(10_000),
    };

    const response = await fetch(url, requestInit);
    if (response.status !== 429) return response;

    await sleep(1_000);
    return fetch(url, requestInit);
  }
}
