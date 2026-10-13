import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { cache } from "react";

import {
  buildClosedJobMetadata,
  ClosedJobView,
} from "@/app/radar/[slug]/closed-job-view";
import { buildJobMetadata, JobDetailView } from "@/app/radar/[slug]/job-detail";
import type { ClosedPublicJob, PublicJob } from "@/lib/public-jobs-api";
import {
  fetchClosedPublicJobCached,
  fetchCurrentJobSlugCached,
  fetchPublicJobCached,
  fetchPublicSimilarJobsCached,
} from "@/lib/public-jobs-client";
import { getRadarLandingIndex } from "@/lib/radar-landings";

// Rota INTERNA em cache (ISR) do detalhe anônimo. Nunca é acessada pela URL
// pública direta: next.config.ts reescreve /radar/:slug para cá SOMENTE
// quando o request não traz cookie de sessão, e src/proxy.ts devolve 404 para
// qualquer acesso direto a /radar-pub/*. O HTML é o da própria URL pública
// (canonical /radar/<slug>, indexável, sem noindex).
//
// Esta rota NÃO pode importar cookies()/headers()/lib de sessão nem
// apiRequest: é isso que garante que nada específico de usuário entra no
// cache compartilhado (radar-cache.spec.ts verifica).

// Literal obrigatório (análise estática do Next) — igual a
// PUBLIC_JOB_REVALIDATE_SECONDS em lib/radar-cache.ts.
export const revalidate = 300;
// ISR sob demanda: nenhuma vaga é pré-renderizada no build.
export const dynamicParams = true;
export function generateStaticParams() {
  return [];
}

type PageProps = {
  params: Promise<{ slug: string }>;
};

// Erros da API (5xx/timeout) lançam: o ISR mantém a última versão boa em vez
// de congelar uma falha como 404. Só 404 real da API vira notFound().
const loadJob = cache(async (slug: string): Promise<PublicJob | null> => {
  const result = await fetchPublicJobCached(slug);
  return result.status === "ok" ? result.data : null;
});

// Só consultada quando a vaga ativa não existe (mesma regra de erro do
// loadJob: só 404 real vira null).
const loadClosedJob = cache(
  async (slug: string): Promise<ClosedPublicJob | null> => {
    const result = await fetchClosedPublicJobCached(slug);
    return result.status === "ok" ? result.data : null;
  },
);

// Slug antigo (regenerado na API) vira 308 para o slug atual da vaga. Mesma
// regra de erro: falha da API lança, só 404 real segue para notFound().
async function redirectIfStaleSlug(slug: string): Promise<void> {
  const result = await fetchCurrentJobSlugCached(slug);
  if (result.status === "ok" && result.data.slug !== slug) {
    permanentRedirect(`/radar/${encodeURIComponent(result.data.slug)}`);
  }
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const job = await loadJob(slug);
  if (job) return buildJobMetadata(job);

  const closedJob = await loadClosedJob(slug);
  if (closedJob) return buildClosedJobMetadata(closedJob);
  await redirectIfStaleSlug(slug);
  return buildJobMetadata(null);
}

export default async function PublicJobPage({ params }: PageProps) {
  const { slug } = await params;
  const job = await loadJob(slug);

  if (!job) {
    const closedJob = await loadClosedJob(slug);
    if (!closedJob) {
      await redirectIfStaleSlug(slug);
      notFound();
    }

    const closedSimilarJobs = await fetchPublicSimilarJobsCached()
      .then((result) =>
        result.status === "ok" ? result.data.data.slice(0, 3) : [],
      )
      .catch(() => [] as PublicJob[]);

    return (
      <ClosedJobView
        job={closedJob}
        similarJobs={closedSimilarJobs}
        user={null}
      />
    );
  }

  // Lista genérica (anônima). Falha aqui degrada para "sem similares" — como
  // sempre foi — sem derrubar a página da vaga.
  const similarJobs = await fetchPublicSimilarJobsCached()
    .then((result) =>
      result.status === "ok"
        ? result.data.data.filter((j) => j.slug !== job.slug).slice(0, 3)
        : [],
    )
    .catch(() => [] as PublicJob[]);

  const landingIndex = await getRadarLandingIndex();

  return (
    <JobDetailView
      job={job}
      similarJobs={similarJobs}
      viewer={null}
      landingIndex={landingIndex}
    />
  );
}
