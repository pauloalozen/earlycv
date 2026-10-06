import type { Metadata } from "next";

import { internshipLanding } from "@/lib/radar-landings";
import {
  buildRadarLandingMetadata,
  RadarLandingPage,
} from "../_landing/radar-landing-page";
import type { RadarSearchParams } from "../jobs-listing";

// Landing perene: vagas de estágio (ver lib/radar-landings.ts).
type PageProps = {
  searchParams: Promise<RadarSearchParams>;
};

export async function generateMetadata({
  searchParams,
}: PageProps): Promise<Metadata> {
  return buildRadarLandingMetadata(internshipLanding(), await searchParams);
}

export default async function Page({ searchParams }: PageProps) {
  return (
    <RadarLandingPage
      landing={internshipLanding()}
      searchParams={await searchParams}
    />
  );
}
