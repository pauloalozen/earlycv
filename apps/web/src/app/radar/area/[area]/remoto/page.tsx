import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { areaRemoteLanding, isLandingArea } from "@/lib/radar-landings";
import {
  buildRadarLandingMetadata,
  RadarLandingPage,
} from "../../../_landing/radar-landing-page";
import type { RadarSearchParams } from "../../../jobs-listing";

// Landing perene: vagas remotas de uma área.
// [area] chega em lowercase na URL (ex.: "data_ai"); as chaves são os
// valores do enum JobArea. OTHER ("Geral") nunca é pública, então não tem
// landing (isLandingArea só aceita as áreas de AREA_SEO).
function resolveLanding(areaSlug: string) {
  const area = areaSlug.toUpperCase();
  return isLandingArea(area) ? areaRemoteLanding(area) : null;
}

type PageProps = {
  params: Promise<{ area: string }>;
  searchParams: Promise<RadarSearchParams>;
};

export async function generateMetadata({
  params,
  searchParams,
}: PageProps): Promise<Metadata> {
  const { area } = await params;
  return buildRadarLandingMetadata(resolveLanding(area), await searchParams);
}

export default async function Page({ params, searchParams }: PageProps) {
  const { area } = await params;
  const landing = resolveLanding(area);
  if (!landing) notFound();

  return (
    <RadarLandingPage landing={landing} searchParams={await searchParams} />
  );
}
