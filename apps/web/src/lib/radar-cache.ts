// Constantes compartilhadas do cache público de /radar/[slug]. Sem
// dependência de servidor (importável por testes e por route handlers).

// TTL do ISR do detalhe anônimo — também o teto de defasagem quando o webhook
// de invalidação falha. `export const revalidate` nas rotas precisa ser
// literal (análise estática do Next); o teste radar-cache.spec.ts garante que
// os literais batem com esta constante.
export const PUBLIC_JOB_REVALIDATE_SECONDS = 300;

export function jobCacheTag(slug: string) {
  return `job:${slug}`;
}

// Lista usada pelo bloco "vagas similares" do detalhe anônimo. Sem
// invalidação sob demanda: expira só por TTL.
export const SIMILAR_JOBS_CACHE_TAG = "jobs:similar";

// Motivos aceitos pelo webhook de revalidação (API -> web).
export const JOB_REVALIDATE_REASONS = [
  "updated",
  "published",
  "inactivated",
] as const;
export type JobRevalidateReason = (typeof JOB_REVALIDATE_REASONS)[number];

// Slugs reais são minúsculos/hifenizados; valida antes de virar tag de cache.
export const JOB_SLUG_PATTERN = /^[a-z0-9][a-z0-9._-]{0,199}$/i;
