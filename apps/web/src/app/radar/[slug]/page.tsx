import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";

import { getCurrentAppUserFromCookies } from "@/lib/app-session.server";
import {
  type ClosedPublicJob,
  listPublicJobs,
  type PublicJob,
} from "@/lib/public-jobs-api";
import { fetchClosedPublicJob, fetchPublicJob } from "@/lib/public-jobs-client";
import { buildClosedJobMetadata, ClosedJobView } from "./closed-job-view";
import { buildJobMetadata, JobDetailView, loadJobViewer } from "./job-detail";

// Caminho DINÂMICO: visitantes com qualquer cookie de sessão (ver rewrite em
// next.config.ts). A experiência de quem está logado é a de sempre; visitante
// sem cookie é atendido pela rota interna em cache (app/radar-pub).

type JobPageProps = {
  params: Promise<{ slug: string }>;
};

// Uma única consulta por request, compartilhada entre generateMetadata e a
// página (cache() do React deduplica dentro do request; o fetch não é
// memoizado pelo Next porque usa AbortSignal). Sempre fresco e sem
// cookies/Authorization — o endpoint não é personalizado. Erros viram null,
// como sempre foi nesta rota.
const loadJob = cache(async (slug: string): Promise<PublicJob | null> => {
  try {
    const result = await fetchPublicJob(slug, { kind: "no-store" });
    return result.status === "ok" ? result.data : null;
  } catch {
    return null;
  }
});

// Só consultada quando a vaga ativa não existe: vaga que saiu do radar
// ganha a página "vaga encerrada" em vez do 404 genérico.
const loadClosedJob = cache(
  async (slug: string): Promise<ClosedPublicJob | null> => {
    try {
      const result = await fetchClosedPublicJob(slug, { kind: "no-store" });
      return result.status === "ok" ? result.data : null;
    } catch {
      return null;
    }
  },
);

export async function generateMetadata({
  params,
}: JobPageProps): Promise<Metadata> {
  const { slug } = await params;
  const job = await loadJob(slug);
  if (job) return buildJobMetadata(job);

  const closedJob = await loadClosedJob(slug);
  return closedJob ? buildClosedJobMetadata(closedJob) : buildJobMetadata(null);
}

export default async function JobPage({ params }: JobPageProps) {
  const user = await getCurrentAppUserFromCookies().catch(() => null);

  const { slug } = await params;
  const job = await loadJob(slug);

  if (!job) {
    const closedJob = await loadClosedJob(slug);
    if (!closedJob) notFound();

    const similarJobs = await listPublicJobs({ limit: 3, page: 1 })
      .then((r) => r.data.slice(0, 3))
      .catch(() => [] as PublicJob[]);

    return (
      <ClosedJobView job={closedJob} similarJobs={similarJobs} user={user} />
    );
  }

  const viewer = user ? await loadJobViewer(user, job.slug) : null;

  // Lista personalizada para logado (ordenada por score) — igual a antes.
  const similarJobs = await listPublicJobs({ limit: 4, page: 1 })
    .then((r) => r.data.filter((j) => j.slug !== job.slug).slice(0, 3))
    .catch(() => [] as PublicJob[]);

  return <JobDetailView job={job} similarJobs={similarJobs} viewer={viewer} />;
}
