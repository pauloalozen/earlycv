import "server-only";

import type {
  ClosedPublicJob,
  PublicJob,
  PublicJobsPage,
} from "./public-jobs-api";
import {
  jobCacheTag,
  PUBLIC_JOB_REVALIDATE_SECONDS,
  SIMILAR_JOBS_CACHE_TAG,
} from "./radar-cache";

// Cliente de dados PÚBLICOS. Diferente de apiRequest (lib/api-request.ts),
// nunca lê cookies() e nunca envia Cookie/Authorization: por construção, o
// que passa por aqui é idêntico para todos os visitantes e pode ser
// armazenado em cache compartilhado sem risco de conteúdo personalizado.
// Só use com endpoints da API que NÃO dependem do usuário (GET
// /public/jobs/:slug, /public/jobs sem guard opcional de sessão no anônimo).

const DEFAULT_TIMEOUT_MS = 10_000;

function getApiBaseUrl() {
  const base =
    process.env.API_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    "http://localhost:4000";

  return base.endsWith("/api") ? base : `${base}/api`;
}

export class PublicApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "PublicApiError";
  }
}

export type PublicFetchMode =
  // Data Cache do Next (compartilhado entre requests) com TTL + tag.
  | { kind: "cached"; tags: string[] }
  // Sempre fresco — usado no caminho dinâmico (logados).
  | { kind: "no-store" };

export type PublicResult<T> =
  | { status: "ok"; data: T }
  | { status: "not-found" };

async function publicGet<T>(
  path: string,
  mode: PublicFetchMode,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<PublicResult<T>> {
  const init: RequestInit & {
    next?: { revalidate?: number; tags?: string[] };
  } = {
    credentials: "omit",
    headers: { Accept: "application/json" },
    method: "GET",
    signal: AbortSignal.timeout(timeoutMs),
  };

  if (mode.kind === "no-store") {
    init.cache = "no-store";
  } else {
    init.next = {
      revalidate: PUBLIC_JOB_REVALIDATE_SECONDS,
      tags: mode.tags,
    };
  }

  const response = await fetch(`${getApiBaseUrl()}${path}`, init);

  // 404 é resposta legítima ("vaga inexistente/inativa"); qualquer outro
  // não-2xx (5xx, 429...) e timeout/erro de rede LANÇAM, para que o ISR
  // mantenha a última versão boa em vez de congelar um erro como 404.
  if (response.status === 404) return { status: "not-found" };
  if (!response.ok) {
    throw new PublicApiError(`Public API ${response.status}`, response.status);
  }

  return { status: "ok", data: (await response.json()) as T };
}

export function fetchPublicJob(slug: string, mode: PublicFetchMode) {
  return publicGet<PublicJob>(`/public/jobs/${encodeURIComponent(slug)}`, mode);
}

// Versão cacheada padrão do detalhe anônimo.
export function fetchPublicJobCached(slug: string) {
  return fetchPublicJob(slug, { kind: "cached", tags: [jobCacheTag(slug)] });
}

// Vaga que saiu do radar (fechada/retirada) — só consultada quando o
// detalhe ativo devolve 404, pra mostrar "vaga encerrada" em vez do 404
// genérico. Mesma tag de cache do detalhe: inativação e reativação (webhook
// de revalidação da API) invalidam as duas respostas juntas.
export function fetchClosedPublicJob(slug: string, mode: PublicFetchMode) {
  return publicGet<ClosedPublicJob>(
    `/public/jobs/${encodeURIComponent(slug)}/closed`,
    mode,
  );
}

export function fetchClosedPublicJobCached(slug: string) {
  return fetchClosedPublicJob(slug, {
    kind: "cached",
    tags: [jobCacheTag(slug)],
  });
}

// Lista genérica (anônima) para "vagas similares". Nunca personalizada:
// este cliente não envia credenciais.
export function fetchPublicSimilarJobsCached(limit = 4) {
  return publicGet<PublicJobsPage>(`/public/jobs?limit=${limit}&page=1`, {
    kind: "cached",
    tags: [SIMILAR_JOBS_CACHE_TAG],
  });
}
