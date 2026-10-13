import type { Prisma } from "@prisma/client";

// Captura falhou (ex: Gupy devolveu detail sem conteudo, ou payload sem
// titulo) — a vaga fica visivel só pro admin (getById), nunca pro público,
// mesmo que status siga "active". Reaproveitado em toda query pública.
export const PUBLIC_JOB_INTEGRITY_WHERE = {
  descriptionClean: { not: "" },
  title: { not: "" },
  // Vagas sem slug (ainda não backfilled após a migration que adicionou o
  // campo) ficam fora do público até o backfill rodar — evita link quebrado
  // /vagas/null-... antes do backfill manual.
  slug: { not: null },
  // Vaga ainda PENDING/PROCESSING/FAILED/SKIPPED de enriquecimento não tem
  // dominantArea/technologies/seniority — sem isso o Radar não calcula
  // compatibilidade nenhuma pra ninguém, então ela não entra no portal até
  // o enriquecimento terminar (worker assíncrono, ver
  // ingestion.service.ts). Decisão de produto: vaga "crua" não é conteúdo
  // publicável, nem pro anônimo nem pro logado.
  //
  // dominantArea=OTHER ("Geral" no filtro) é o catch-all do LLM pra vaga
  // fora da taxonomia tech (RH, jurídico, engenharia não-tech etc.) — boards
  // globais (Workday/Greenhouse) trazem essas vagas junto com as tech de
  // verdade. Decisão de produto: não é o público do radar, nunca aparece no
  // portal (nem listagem, nem facet, nem /radar/[slug] direto).
  enrichment: {
    enrichmentStatus: "COMPLETED",
    dominantArea: { not: "OTHER" },
  },
} satisfies Prisma.JobWhereInput;
