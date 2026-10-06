import type { Metadata } from "next";
import { notFound } from "next/navigation";

import {
  cityLanding,
  findCityBySlug,
  getRadarLandingIndex,
} from "@/lib/radar-landings";
import {
  buildRadarLandingMetadata,
  RadarLandingPage,
} from "../../_landing/radar-landing-page";
import type { RadarSearchParams } from "../../jobs-listing";

// Landing perene: vagas de tecnologia numa cidade. O slug ("sao-paulo-sp")
// só existe para cidades do índice (UF brasileira válida e volume mínimo),
// o que deixa de fora o lixo de localização vindo dos crawlers.
async function resolveLanding(citySlug: string) {
  const index = await getRadarLandingIndex();
  const city = index ? findCityBySlug(index, citySlug) : null;
  return city ? cityLanding(city) : null;
}

type PageProps = {
  params: Promise<{ cidade: string }>;
  searchParams: Promise<RadarSearchParams>;
};

export async function generateMetadata({
  params,
  searchParams,
}: PageProps): Promise<Metadata> {
  const { cidade } = await params;
  return buildRadarLandingMetadata(
    await resolveLanding(cidade),
    await searchParams,
  );
}

export default async function Page({ params, searchParams }: PageProps) {
  const { cidade } = await params;
  const landing = await resolveLanding(cidade);
  if (!landing) notFound();

  return (
    <RadarLandingPage landing={landing} searchParams={await searchParams} />
  );
}
