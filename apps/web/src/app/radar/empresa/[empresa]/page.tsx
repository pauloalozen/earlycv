import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getCurrentAppUserFromCookies } from "@/lib/app-session.server";
import { toHeaderAvailableCredits } from "@/lib/header-credits";
import { getPublicJobsByCompanySlug } from "@/lib/internal-jobs-api";
import { getMyPlan } from "@/lib/plans-api";
import { getAbsoluteUrl } from "@/lib/site";
import { RadarJobsListing, type RadarSearchParams } from "../../jobs-listing";
import { RadarPageShell } from "../../page-shell";
import { RadarViewTracker } from "../../radar-view-tracker";

type PageProps = {
  params: Promise<{ empresa: string }>;
  searchParams: Promise<RadarSearchParams>;
};

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { empresa: companySlug } = await params;
  const { companyName } = await getPublicJobsByCompanySlug(companySlug);

  if (!companyName) {
    return {
      title: "Empresa não encontrada",
      robots: { index: false, follow: false },
    };
  }

  const url = getAbsoluteUrl(`/radar/empresa/${companySlug}`);

  return {
    title: `Vagas na ${companyName} | EarlyCV`,
    description: `Veja as vagas abertas na ${companyName} e analise seu CV gratuitamente.`,
    alternates: { canonical: url },
  };
}

export default async function RadarEmpresaPage({
  params,
  searchParams,
}: PageProps) {
  const user = await getCurrentAppUserFromCookies().catch(() => null);

  const availableCredits = user
    ? toHeaderAvailableCredits(await getMyPlan().catch(() => null))
    : undefined;

  const { empresa: companySlug } = await params;
  // Resolve o slug pra o nome de exibição real da empresa (Company.name não
  // tem slug persistido — ver getPublicByCompanySlug em jobs.service.ts) e
  // confirma que existe pelo menos 1 vaga pública antes de renderizar
  // qualquer coisa. A listagem de verdade (com score/paginação/ordenação)
  // vem de RadarJobsListing logo abaixo, via fixedFilters.companyName — essa
  // primeira chamada é só pra existência + nome de exibição.
  const { companyName, jobs } = await getPublicJobsByCompanySlug(companySlug);

  if (!companyName || jobs.length === 0) notFound();

  const resolvedSearchParams = await searchParams;

  return (
    <RadarPageShell
      userName={user?.name}
      userRole={user?.internalRole}
      credits={availableCredits}
    >
      <RadarViewTracker radarViewType="company" />
      <RadarJobsListing
        basePath={`/radar/empresa/${companySlug}`}
        user={user}
        searchParams={resolvedSearchParams}
        fixedFilters={{ companyName }}
        landingHeader={{
          eyebrow: "PORTAL DE VAGAS",
          title: `Vagas na ${companyName}`,
        }}
      />
    </RadarPageShell>
  );
}
