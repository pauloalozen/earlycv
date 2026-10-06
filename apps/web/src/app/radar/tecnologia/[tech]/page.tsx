import type { Metadata } from "next";

import {
  getRadarLandingIndex,
  resolveTechnologySlug,
  technologyLanding,
} from "@/lib/radar-landings";
import {
  buildRadarLandingMetadata,
  RadarLandingPage,
} from "../../_landing/radar-landing-page";
import type { RadarSearchParams } from "../../jobs-listing";

// Landing perene: vagas que pedem uma tecnologia. O slug da URL ("power-bi",
// "c-sharp") é resolvido para a tecnologia do enrichment pelo índice; abaixo
// de MIN_TECH_JOBS vagas a página fica noindex e, sem vaga, vira 404 (ver
// RadarLandingPage).
async function resolveLanding(techSlug: string) {
  const index = await getRadarLandingIndex();
  return technologyLanding(resolveTechnologySlug(index, techSlug));
}

type PageProps = {
  params: Promise<{ tech: string }>;
  searchParams: Promise<RadarSearchParams>;
};

export async function generateMetadata({
  params,
  searchParams,
}: PageProps): Promise<Metadata> {
  const { tech } = await params;
  return buildRadarLandingMetadata(
    await resolveLanding(tech),
    await searchParams,
  );
}

export default async function Page({ params, searchParams }: PageProps) {
  const { tech } = await params;
  return (
    <RadarLandingPage
      landing={await resolveLanding(tech)}
      searchParams={await searchParams}
    />
  );
}
