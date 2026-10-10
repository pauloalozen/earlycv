import type { Metadata } from "next";
import { notFound } from "next/navigation";

import {
  companyCountDisplayName,
  companyLanding,
  findCompanyBySlug,
  getRadarLandingIndex,
} from "@/lib/radar-landings";
import {
  buildRadarLandingMetadata,
  RadarLandingPage,
} from "../../_landing/radar-landing-page";
import type { RadarSearchParams } from "../../jobs-listing";

// Landing perene: vagas de uma empresa. Company não tem slug persistido; o
// índice de landings (contado no banco, cache de 5 min) traz nome e slug de
// toda empresa com vaga pública — antes isto carregava todas as vagas.
async function resolveLanding(companySlug: string) {
  const index = await getRadarLandingIndex();
  const company = index ? findCompanyBySlug(index, companySlug) : null;
  return company
    ? companyLanding(company.name, companyCountDisplayName(company))
    : null;
}

type PageProps = {
  params: Promise<{ empresa: string }>;
  searchParams: Promise<RadarSearchParams>;
};

export async function generateMetadata({
  params,
  searchParams,
}: PageProps): Promise<Metadata> {
  const { empresa } = await params;
  return buildRadarLandingMetadata(
    await resolveLanding(empresa),
    await searchParams,
  );
}

export default async function Page({ params, searchParams }: PageProps) {
  const { empresa } = await params;
  const landing = await resolveLanding(empresa);
  if (!landing) notFound();

  return (
    <RadarLandingPage landing={landing} searchParams={await searchParams} />
  );
}
