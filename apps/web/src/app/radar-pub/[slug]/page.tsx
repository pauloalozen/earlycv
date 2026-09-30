import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";

import { buildJobMetadata, JobDetailView } from "@/app/radar/[slug]/job-detail";
import type { PublicJob } from "@/lib/public-jobs-api";
import {
  fetchPublicJobCached,
  fetchPublicSimilarJobsCached,
} from "@/lib/public-jobs-client";

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

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  return buildJobMetadata(await loadJob(slug));
}

export default async function PublicJobPage({ params }: PageProps) {
  const { slug } = await params;
  const job = await loadJob(slug);

  if (!job) notFound();

  // Lista genérica (anônima). Falha aqui degrada para "sem similares" — como
  // sempre foi — sem derrubar a página da vaga.
  const similarJobs = await fetchPublicSimilarJobsCached()
    .then((result) =>
      result.status === "ok"
        ? result.data.data.filter((j) => j.slug !== job.slug).slice(0, 3)
        : [],
    )
    .catch(() => [] as PublicJob[]);

  return <JobDetailView job={job} similarJobs={similarJobs} viewer={null} />;
}
