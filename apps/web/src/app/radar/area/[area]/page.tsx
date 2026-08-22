import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getCurrentAppUserFromCookies } from "@/lib/app-session.server";
import { toHeaderAvailableCredits } from "@/lib/header-credits";
import {
  canAccessJobsInGhostMode,
  isJobsGhostModeEnabled,
} from "@/lib/jobs-ghost-mode";
import { getMyPlan } from "@/lib/plans-api";
import { getAbsoluteUrl } from "@/lib/site";
import { RadarJobsListing, type RadarSearchParams } from "../../jobs-listing";
import { RadarPageShell } from "../../page-shell";
import { RADAR_AREA_LABELS } from "../../radar-ui";
import { RadarViewTracker } from "../../radar-view-tracker";

// [area] chega em lowercase na URL (ex.: "data_ai") — as chaves de
// RADAR_AREA_LABELS são os valores do enum JobArea, em upper case
// (DATA_AI). RADAR_AREA_LABELS é a fonte única da verdade aqui: qualquer
// área nova adicionada lá já habilita a landing page correspondente, sem
// precisar duplicar a lista de valores válidos. OTHER ("Geral") é exceção
// deliberada: o backend nunca retorna vaga com essa área pro público (ver
// PUBLIC_JOB_INTEGRITY_WHERE em jobs.service.ts), então a landing page
// dela ficaria sempre vazia — 404 em vez de página fantasma indexável.
function resolveAreaEnum(slug: string): string | null {
  const candidate = slug.toUpperCase();
  if (candidate === "OTHER") return null;
  return candidate in RADAR_AREA_LABELS ? candidate : null;
}

type PageProps = {
  params: Promise<{ area: string }>;
  searchParams: Promise<RadarSearchParams>;
};

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { area: areaSlug } = await params;
  const areaEnum = resolveAreaEnum(areaSlug);

  if (!areaEnum) {
    return {
      title: "Área não encontrada",
      robots: { index: false, follow: false },
    };
  }

  const isGhostMode = isJobsGhostModeEnabled();
  const label = RADAR_AREA_LABELS[areaEnum];
  const url = getAbsoluteUrl(`/radar/area/${areaSlug}`);

  return {
    title: `Vagas de ${label} no Brasil | EarlyCV`,
    description: `Encontre vagas de ${label} com score de compatibilidade. Analise seu CV gratuitamente.`,
    alternates: { canonical: url },
    robots: { index: !isGhostMode, follow: !isGhostMode },
  };
}

export default async function RadarAreaPage({
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

  const { area: areaSlug } = await params;
  const areaEnum = resolveAreaEnum(areaSlug);

  if (!areaEnum) notFound();

  const label = RADAR_AREA_LABELS[areaEnum];
  const resolvedSearchParams = await searchParams;

  return (
    <RadarPageShell
      userName={user?.name}
      userRole={user?.internalRole}
      credits={availableCredits}
    >
      <RadarViewTracker radarViewType="area" area={areaEnum} />
      <RadarJobsListing
        basePath={`/radar/area/${areaSlug}`}
        user={user}
        searchParams={resolvedSearchParams}
        fixedFilters={{ area: areaEnum }}
        landingHeader={{
          eyebrow: "PORTAL DE VAGAS",
          title: `Vagas de ${label} no Brasil`,
          description: `Encontre as melhores vagas de ${label} e analise seu CV gratuitamente.`,
        }}
      />
    </RadarPageShell>
  );
}
