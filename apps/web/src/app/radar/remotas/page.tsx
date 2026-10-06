import type { Metadata } from "next";

import { remoteLanding } from "@/lib/radar-landings";
import {
  buildRadarLandingMetadata,
  RadarLandingPage,
} from "../_landing/radar-landing-page";
import type { RadarSearchParams } from "../jobs-listing";

// Landing perene: vagas remotas (ver lib/radar-landings.ts).
type PageProps = {
  searchParams: Promise<RadarSearchParams>;
};

export async function generateMetadata({
  searchParams,
}: PageProps): Promise<Metadata> {
  return buildRadarLandingMetadata(remoteLanding(), await searchParams);
}

export default async function Page({ searchParams }: PageProps) {
  return (
    <RadarLandingPage
      landing={remoteLanding()}
      searchParams={await searchParams}
    />
  );
}
