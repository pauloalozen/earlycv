import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getCurrentAppUserFromCookies } from "@/lib/app-session.server";
import { toHeaderAvailableCredits } from "@/lib/header-credits";
import { getPublicJobsByTech } from "@/lib/internal-jobs-api";
import {
  canAccessJobsInGhostMode,
  isJobsGhostModeEnabled,
} from "@/lib/jobs-ghost-mode";
import { getMyPlan } from "@/lib/plans-api";
import { getAbsoluteUrl } from "@/lib/site";
import { RadarJobsListing, type RadarSearchParams } from "../../jobs-listing";
import { RadarPageShell } from "../../page-shell";

// Só existe conteúdo publicável na landing page de tecnologia se houver
// pelo menos esse tanto de vagas ativas com ela — abaixo disso, notFound()
// (ver JobsService#listPublicJobsByTech, que já aplica o mesmo threshold no
// endpoint /internal/jobs/by-tech).
const MIN_TECH_JOBS = 10;

type PageProps = {
  params: Promise<{ tech: string }>;
  searchParams: Promise<RadarSearchParams>;
};

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { tech: techSlug } = await params;
  const tech = techSlug.toLowerCase();
  const { total } = await getPublicJobsByTech(tech, MIN_TECH_JOBS);

  if (total < MIN_TECH_JOBS) {
    return {
      title: "Tecnologia não encontrada",
      robots: { index: false, follow: false },
    };
  }

  const isGhostMode = isJobsGhostModeEnabled();
  const url = getAbsoluteUrl(`/radar/tecnologia/${tech}`);

  return {
    title: `Vagas de ${tech} no Brasil | EarlyCV`,
    description: `Encontre vagas que exigem ${tech} e analise seu CV gratuitamente.`,
    alternates: { canonical: url },
    robots: { index: !isGhostMode, follow: !isGhostMode },
  };
}

export default async function RadarTecnologiaPage({
  params,
  searchParams,
}: PageProps) {
  const isGhostMode = isJobsGhostModeEnabled();
  const user = await getCurrentAppUserFromCookies().catch(() => null);

  if (isGhostMode && !canAccessJobsInGhostMode(user?.internalRole)) {
    notFound();
  }

  const availableCredits = user
    ? toHeaderAvailableCredits(await getMyPlan().catch(() => null))
    : undefined;

  const { tech: techSlug } = await params;
  const tech = techSlug.toLowerCase();
  // Confirma o threshold de volume antes de renderizar qualquer coisa — a
  // listagem de verdade (com score/paginação/ordenação) vem de
  // RadarJobsListing logo abaixo, via fixedFilters.technology; essa
  // primeira chamada é só pra decidir notFound().
  const { total } = await getPublicJobsByTech(tech, MIN_TECH_JOBS);

  if (total < MIN_TECH_JOBS) notFound();

  const resolvedSearchParams = await searchParams;

  return (
    <RadarPageShell
      userName={user?.name}
      userRole={user?.internalRole}
      credits={availableCredits}
    >
      <RadarJobsListing
        basePath={`/radar/tecnologia/${tech}`}
        user={user}
        searchParams={resolvedSearchParams}
        fixedFilters={{ technology: tech }}
        landingHeader={{
          eyebrow: "PORTAL DE VAGAS",
          title: `Vagas de ${tech} no Brasil`,
          description: `Encontre vagas que exigem ${tech} e analise seu CV gratuitamente.`,
        }}
      />
    </RadarPageShell>
  );
}
